"""Song catalogue: pack files listed in catalog/index.json, exposed with opaque ids.

Pack files may be missing or briefly invalid (they are curated separately), so
loading never crashes on them: a missing or unreadable pack is skipped with a
warning, invalid entries are dropped, and a (title, artist) pair already seen
in an earlier pack is dropped (first pack wins).
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import random
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .catalog_rules import LANGUAGES, PACK_ID, song_key, validate_entry

log = logging.getLogger(__name__)

DEFAULT_CATALOG_DIR = Path(__file__).with_name("catalog")
INDEX_FILE = "index.json"


@dataclass(frozen=True)
class Song:
    id: str
    title: str
    artist: str
    year: int
    language: str
    pack_id: str
    film: str | None = None

    @property
    def cache_key(self) -> str:
        """Secret-independent key, so stored snippets survive key rotation."""
        return f"{self.title}|{self.artist}"


@dataclass(frozen=True)
class Pack:
    id: str
    name: str
    language: str


@dataclass(frozen=True)
class Language:
    id: str
    name: str


@dataclass
class PackReport:
    pack: Pack
    status: str = "ok"  # ok | missing | unreadable
    raw: list[Any] = field(default_factory=list)
    entries: list[dict[str, Any]] = field(default_factory=list)
    invalid: list[str] = field(default_factory=list)
    duplicates: list[str] = field(default_factory=list)


def _read_index(directory: Path) -> tuple[list[Language], list[Pack]]:
    data = json.loads((directory / INDEX_FILE).read_text(encoding="utf-8"))
    languages = [Language(str(x["id"]), str(x["name"])) for x in data["languages"]]
    known_languages = {lang.id for lang in languages}
    packs: list[Pack] = []
    for item in data["packs"]:
        pack = Pack(str(item["id"]), str(item["name"]), str(item["language"]))
        if not PACK_ID.match(pack.id) or pack.language not in known_languages:
            raise ValueError(f"invalid pack in index: {pack.id!r}")
        if pack.language not in LANGUAGES:
            raise ValueError(f"unsupported language in index: {pack.language!r}")
        if any(p.id == pack.id for p in packs):
            raise ValueError(f"duplicate pack in index: {pack.id!r}")
        packs.append(pack)
    return languages, packs


def read_catalog(directory: Path | str) -> tuple[list[Language], list[PackReport]]:
    """Read the index and every listed pack; never raises for pack problems."""
    directory = Path(directory)
    languages, packs = _read_index(directory)
    seen: dict[tuple[str, str], str] = {}
    reports: list[PackReport] = []
    for pack in packs:
        report = PackReport(pack)
        reports.append(report)
        path = directory / f"{pack.id}.json"
        if not path.is_file():
            report.status = "missing"
            continue
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            if not isinstance(raw, list):
                raise ValueError("top level is not an array")
        except (OSError, ValueError) as exc:
            report.status = "unreadable"
            report.invalid.append(f"unreadable: {type(exc).__name__}: {exc}")
            continue
        report.raw = raw
        for item in raw:
            entry, reason = validate_entry(item, pack.language)
            if entry is None:
                report.invalid.append(reason or "invalid entry")
                continue
            key = song_key(entry["title"], entry["artist"])
            if key in seen:
                report.duplicates.append(
                    f"{entry['title']!r} by {entry['artist']!r} (already in {seen[key]})"
                )
                continue
            seen[key] = pack.id
            report.entries.append(entry)
    return languages, reports


def make_song_id(id_key: bytes, title: str, artist: str) -> str:
    digest = hmac.new(id_key, f"{title}|{artist}".encode(), hashlib.sha256)
    return digest.hexdigest()[:12]


class Catalogue:
    def __init__(self, id_key: bytes, directory: Path | str = DEFAULT_CATALOG_DIR):
        languages, reports = read_catalog(directory)
        songs: list[Song] = []
        self.pack_songs: dict[str, tuple[Song, ...]] = {}
        for report in reports:
            pack = report.pack
            if report.status == "missing":
                log.warning("catalog_pack_missing pack=%s", pack.id)
            elif report.status == "unreadable":
                log.warning("catalog_pack_unreadable pack=%s", pack.id)
            if report.invalid and report.status == "ok":
                log.warning(
                    "catalog_entries_skipped pack=%s invalid=%d", pack.id, len(report.invalid)
                )
            if report.duplicates:
                log.warning(
                    "catalog_duplicates_skipped pack=%s count=%d", pack.id, len(report.duplicates)
                )
            pack_songs = tuple(
                Song(
                    id=make_song_id(id_key, e["title"], e["artist"]),
                    title=e["title"],
                    artist=e["artist"],
                    year=e["year"],
                    language=pack.language,
                    pack_id=pack.id,
                    film=e["film"],
                )
                for e in report.entries
            )
            self.pack_songs[pack.id] = pack_songs
            songs.extend(pack_songs)
        self.languages: tuple[Language, ...] = tuple(languages)
        self.packs: tuple[Pack, ...] = tuple(r.pack for r in reports)
        self._pack_by_id = {p.id: p for p in self.packs}
        self.songs: tuple[Song, ...] = tuple(songs)
        self._by_id = {song.id: song for song in self.songs}
        log.info("catalog_loaded packs=%d songs=%d", len(self.available_packs()), len(songs))

    def get(self, song_id: str) -> Song | None:
        return self._by_id.get(song_id)

    def pack(self, pack_id: str) -> Pack | None:
        return self._pack_by_id.get(pack_id)

    def available_packs(self) -> list[Pack]:
        return [p for p in self.packs if self.pack_songs.get(p.id)]

    def songs_in(self, pack_ids: Sequence[str] | None) -> list[Song]:
        """Songs of the given packs (all packs if None or empty)."""
        if not pack_ids:
            return list(self.songs)
        wanted = list(dict.fromkeys(pack_ids))
        return [song for pid in wanted for song in self.pack_songs.get(pid, ())]

    def eligible(self, exclude: Iterable[str], pack_ids: Sequence[str] | None = None) -> list[Song]:
        """Songs of ``pack_ids`` not in ``exclude``; if that leaves nothing, ignore ``exclude``."""
        base = self.songs_in(pack_ids)
        excluded = set(exclude)
        return [song for song in base if song.id not in excluded] or base

    def distractor_titles(self, song: Song, count: int, rng: random.Random) -> list[str]:
        """Up to ``count`` other titles: same pack first, then same language, then any."""
        chosen: list[str] = []
        used = {song.title.casefold()}
        tiers = [
            self.pack_songs.get(song.pack_id, ()),
            [s for s in self.songs if s.language == song.language and s.pack_id != song.pack_id],
            [s for s in self.songs if s.language != song.language],
        ]
        for tier in tiers:
            candidates = list(tier)
            rng.shuffle(candidates)
            for other in candidates:
                if len(chosen) == count:
                    return chosen
                if other.title.casefold() not in used:
                    used.add(other.title.casefold())
                    chosen.append(other.title)
        return chosen

    def meta(self) -> list[dict[str, Any]]:
        result = []
        for lang in self.languages:
            packs = [
                {"id": p.id, "name": p.name, "count": len(self.pack_songs[p.id])}
                for p in self.available_packs()
                if p.language == lang.id
            ]
            if packs:
                result.append({"id": lang.id, "name": lang.name, "packs": packs})
        return result
