"""Snippet cache, persistent store hook, daily LLM budget, and per-round selection."""

from __future__ import annotations

import json
import logging
import os
import random
import tempfile
import threading
import time
from collections.abc import Callable, Sequence
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Protocol

from .llm import SnippetGenerator, clean_snippet
from .songs import Song

log = logging.getLogger(__name__)

MAX_SONG_ATTEMPTS = 3
STORE_RECHECK_SECONDS = 3600.0
#: Songs looked up in the persistent store per round when no LLM can be used.
MAX_STORE_PROBES = 6
CACHE_FILE_VERSION = 1


class DailyBudget:
    """Global LLM call counter (all providers) that resets at UTC midnight (in memory)."""

    def __init__(self, limit: int | None, today: Callable[[], date] | None = None):
        self.limit = limit
        self._today = today or (lambda: datetime.now(UTC).date())
        self._day = self._today()
        self._used = 0
        self._lock = threading.Lock()

    def _roll(self) -> None:
        today = self._today()
        if today != self._day:
            self._day, self._used = today, 0

    def remaining(self) -> int | None:
        if self.limit is None:
            return None
        with self._lock:
            self._roll()
            return max(0, self.limit - self._used)

    def try_consume(self) -> bool:
        if self.limit is None:
            return True
        with self._lock:
            self._roll()
            if self._used >= self.limit:
                return False
            self._used += 1
            return True


class SnippetCache:
    """Up to ``max_variants`` distinct snippets per song, keyed by Song.cache_key."""

    def __init__(self, max_variants: int, initial: dict[str, list[str]] | None = None):
        self.max_variants = max_variants
        self._data: dict[str, list[str]] = {}
        self._lock = threading.Lock()
        for key, variants in (initial or {}).items():
            for text in variants:
                self.add(key, text)

    def add(self, key: str, text: str) -> None:
        with self._lock:
            variants = self._data.setdefault(key, [])
            if text not in variants:
                variants.append(text)
                del variants[: -self.max_variants]

    def get(self, key: str) -> list[str]:
        with self._lock:
            return list(self._data.get(key, ()))

    def snapshot(self) -> dict[str, list[str]]:
        with self._lock:
            return {k: list(v) for k, v in self._data.items()}


def load_cache_file(path: str | os.PathLike | None) -> dict[str, list[str]]:
    if not path or not Path(path).is_file():
        return {}
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        snippets = data["snippets"]
        result = {
            str(key): [s for s in map(clean_snippet, variants) if s]
            for key, variants in snippets.items()
            if isinstance(variants, list)
        }
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        log.exception("snippet_cache_unreadable path=%s", path)
        return {}
    log.info("snippet_cache_loaded path=%s songs=%d", path, len(result))
    return result


def save_cache_file(path: str | os.PathLike, snippets: dict[str, list[str]]) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    payload = {"version": CACHE_FILE_VERSION, "snippets": snippets}
    fd, tmp = tempfile.mkstemp(dir=target.parent, suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2, sort_keys=True)
    os.replace(tmp, target)


class SnippetStore(Protocol):
    """Persistent snippet storage (Supabase). Implementations never raise."""

    def fetch(self, song: Song) -> list[str]: ...

    def save(self, song: Song, text: str, provider: str) -> bool: ...


class SnippetService:
    """Picks songs and snippets: memory cache -> persistent store -> LLM providers.

    Providers are tried in order (Gemini, then OpenAI); each call that spends
    API quota counts against the shared daily budget.
    """

    def __init__(
        self,
        generators: SnippetGenerator | Sequence[SnippetGenerator],
        cache: SnippetCache,
        budget: DailyBudget,
        cache_hit_probability: float = 0.85,
        rng: random.Random | None = None,
        store: SnippetStore | None = None,
        store_recheck_seconds: float = STORE_RECHECK_SECONDS,
        clock: Callable[[], float] = time.monotonic,
    ):
        if isinstance(generators, Sequence):
            self.generators = list(generators)
        else:
            self.generators = [generators]
        self.cache = cache
        self.budget = budget
        self.cache_hit_probability = cache_hit_probability
        self.store = store
        self._rng = rng or random.SystemRandom()
        self._store_checked: dict[str, float] = {}
        self._store_recheck = store_recheck_seconds
        self._clock = clock
        self._lock = threading.Lock()

    def can_generate(self) -> bool:
        available = [g for g in self.generators if g.available]
        if not available:
            return False
        return any(not g.uses_quota for g in available) or self.budget.remaining() != 0

    def has_cached(self, song: Song) -> bool:
        return bool(self.cache.get(song.cache_key))

    def _load_from_store(self, song: Song) -> list[str]:
        """On a memory miss, pull stored snippets (at most once per recheck window)."""
        if self.store is None:
            return []
        now = self._clock()
        with self._lock:
            last = self._store_checked.get(song.cache_key)
            if last is not None and now - last < self._store_recheck:
                return []
            self._store_checked[song.cache_key] = now
        for text in self.store.fetch(song):
            if clean_snippet(text):
                self.cache.add(song.cache_key, text)
        return self.cache.get(song.cache_key)

    def generate(self, song: Song) -> tuple[str, str] | None:
        """(snippet, provider name) from the first provider that succeeds."""
        for generator in self.generators:
            if not generator.available:
                continue
            if generator.uses_quota and not self.budget.try_consume():
                log.warning("llm_budget_exhausted")
                return None
            text = clean_snippet(generator.generate(song))
            if text:
                return text, getattr(generator, "name", type(generator).__name__)
        return None

    def snippet_for(self, song: Song) -> str | None:
        variants = self.cache.get(song.cache_key) or self._load_from_store(song)
        if variants and (
            len(variants) >= self.cache.max_variants
            or self._rng.random() < self.cache_hit_probability
        ):
            return self._rng.choice(variants)
        result = self.generate(song)
        if result:
            text, provider = result
            self.cache.add(song.cache_key, text)
            if self.store is not None:
                self.store.save(song, text, provider)
            return text
        return self._rng.choice(variants) if variants else None

    def pick_round(self, pool: Sequence[Song]) -> tuple[Song, str] | None:
        """Choose a song from ``pool`` and get a snippet for it.

        Tries up to MAX_SONG_ATTEMPTS different songs. When no LLM can be used,
        only songs with cached (or stored) snippets are considered.
        """
        if not pool:
            return None
        if not self.can_generate():
            cached = [s for s in pool if self.has_cached(s)]
            if not cached and self.store is not None:
                for song in self._rng.sample(list(pool), k=min(MAX_STORE_PROBES, len(pool))):
                    if self._load_from_store(song):
                        cached.append(song)
            pool = cached
            if not pool:
                return None
        for song in self._rng.sample(list(pool), k=min(MAX_SONG_ATTEMPTS, len(pool))):
            text = self.snippet_for(song)
            if text:
                return song, text
        cached = [s for s in pool if self.has_cached(s)]
        if cached:
            song = self._rng.choice(cached)
            return song, self._rng.choice(self.cache.get(song.cache_key))
        return None
