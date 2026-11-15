"""Song catalogue: loaded once from songs.json, exposed with opaque ids."""

from __future__ import annotations

import hashlib
import hmac
import json
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path

CATALOGUE_PATH = Path(__file__).with_name("songs.json")


@dataclass(frozen=True)
class Song:
    id: str
    title: str
    artist: str

    @property
    def cache_key(self) -> str:
        """Secret-independent key, so on-disk caches survive key rotation."""
        return f"{self.title}|{self.artist}"


def _load_raw(path: Path) -> tuple[tuple[str, str], ...]:
    entries = json.loads(path.read_text(encoding="utf-8"))
    songs = tuple((e["title"].strip(), e["artist"].strip()) for e in entries)
    if len(set(songs)) != len(songs):
        raise ValueError(f"duplicate songs in {path}")
    return songs


RAW_SONGS = _load_raw(CATALOGUE_PATH)


def make_song_id(id_key: bytes, title: str, artist: str) -> str:
    digest = hmac.new(id_key, f"{title}|{artist}".encode(), hashlib.sha256)
    return digest.hexdigest()[:12]


class Catalogue:
    def __init__(self, id_key: bytes, raw: Iterable[tuple[str, str]] = RAW_SONGS):
        self.songs: tuple[Song, ...] = tuple(
            Song(make_song_id(id_key, title, artist), title, artist) for title, artist in raw
        )
        self._by_id = {song.id: song for song in self.songs}

    def get(self, song_id: str) -> Song | None:
        return self._by_id.get(song_id)

    def eligible(self, exclude: Iterable[str]) -> list[Song]:
        """Songs not in ``exclude``; if that leaves nothing, the whole catalogue."""
        excluded = set(exclude)
        pool = [song for song in self.songs if song.id not in excluded]
        return pool or list(self.songs)
