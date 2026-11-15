"""Snippet cache, daily LLM budget, and per-round snippet selection."""

from __future__ import annotations

import json
import logging
import os
import random
import tempfile
import threading
from collections.abc import Callable, Sequence
from datetime import UTC, date, datetime
from pathlib import Path

from .llm import SnippetGenerator, clean_snippet
from .songs import Song

log = logging.getLogger(__name__)

MAX_SONG_ATTEMPTS = 3
CACHE_FILE_VERSION = 1


class DailyBudget:
    """Global LLM call counter that resets at UTC midnight (in memory only)."""

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


class SnippetService:
    def __init__(
        self,
        generator: SnippetGenerator,
        cache: SnippetCache,
        budget: DailyBudget,
        cache_hit_probability: float = 0.85,
        rng: random.Random | None = None,
    ):
        self.generator = generator
        self.cache = cache
        self.budget = budget
        self.cache_hit_probability = cache_hit_probability
        self._rng = rng or random.SystemRandom()

    def can_generate(self) -> bool:
        if not self.generator.available:
            return False
        return not self.generator.uses_quota or self.budget.remaining() != 0

    def has_cached(self, song: Song) -> bool:
        return bool(self.cache.get(song.cache_key))

    def snippet_for(self, song: Song) -> str | None:
        variants = self.cache.get(song.cache_key)
        if variants and (
            len(variants) >= self.cache.max_variants
            or self._rng.random() < self.cache_hit_probability
        ):
            return self._rng.choice(variants)
        if not self.generator.available or (
            self.generator.uses_quota and not self.budget.try_consume()
        ):
            return self._rng.choice(variants) if variants else None
        text = self.generator.generate(song)
        if text:
            self.cache.add(song.cache_key, text)
            return text
        return self._rng.choice(variants) if variants else None

    def pick_round(
        self, pool: Sequence[Song], catalogue: Sequence[Song]
    ) -> tuple[Song, str] | None:
        """Choose a song from ``pool`` and get a snippet for it.

        Tries up to MAX_SONG_ATTEMPTS different songs. When the LLM can't be
        used, only songs with cached snippets are considered (falling back to
        the whole catalogue's cache before giving up).
        """
        if not self.can_generate():
            pool = [s for s in pool if self.has_cached(s)] or [
                s for s in catalogue if self.has_cached(s)
            ]
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
