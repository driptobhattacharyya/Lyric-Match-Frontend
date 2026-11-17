"""Catalogue entry validation (see catalog/README.md).

``validate_entry`` is the basic check the server applies when loading packs:
an entry that fails it is skipped. ``pack_rule_violations`` adds the editorial
rules (artist caps, title suffixes, ...) that ``scripts/validate_catalog.py``
reports but the server does not enforce.
"""

from __future__ import annotations

import re
from collections import Counter
from collections.abc import Iterable, Sequence
from datetime import UTC, datetime
from typing import Any

from .latin import is_latin_text

LANGUAGES = ("en", "hi")
PACK_ID = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
MAX_TEXT = 120
MIN_YEAR = 1900
ALLOWED_KEYS = {"title", "artist", "year", "language", "genre", "film"}

_TITLE_SUFFIX = re.compile(
    r"\((?:feat|ft|with|from)\b|\bfeat\.|\bft\.|remaster|\b(?:version|edit|mix|live)\)",
    re.IGNORECASE,
)


def song_key(title: str, artist: str) -> tuple[str, str]:
    """Identity used for duplicate detection across packs."""
    return (" ".join(title.casefold().split()), " ".join(artist.casefold().split()))


def _text(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    value = " ".join(value.split())
    return value if 0 < len(value) <= MAX_TEXT else None


def validate_entry(raw: Any, language: str) -> tuple[dict[str, Any] | None, str | None]:
    """Return (clean entry, None) or (None, reason)."""
    if not isinstance(raw, dict):
        return None, "entry is not an object"
    title, artist = _text(raw.get("title")), _text(raw.get("artist"))
    if title is None:
        return None, "missing or invalid title"
    if artist is None:
        return None, f"{title!r}: missing or invalid artist"
    if not is_latin_text(title) or not is_latin_text(artist):
        return None, f"{title!r}: title and artist must be in Latin script"
    year = raw.get("year")
    max_year = datetime.now(UTC).year + 1
    if isinstance(year, bool) or not isinstance(year, int) or not MIN_YEAR <= year <= max_year:
        return None, f"{title!r}: invalid year"
    if raw.get("language") != language:
        return None, f"{title!r}: language must be {language!r}"
    film = raw.get("film")
    if film is not None:
        film = _text(film)
        if film is None or not is_latin_text(film):
            return None, f"{title!r}: invalid film"
    genre = raw.get("genre")
    if genre is not None and not isinstance(genre, str):
        return None, f"{title!r}: invalid genre"
    return (
        {
            "title": title,
            "artist": artist,
            "year": year,
            "language": language,
            "genre": genre,
            "film": film,
        },
        None,
    )


def artist_cap(pack_id: str, language: str) -> int:
    if language == "en":
        return 5
    return 8 if pack_id == "hi-indie" else 10


def _performers(artist: str, language: str) -> Iterable[str]:
    if language == "hi":
        return [a.strip() for a in artist.split(" & ") if a.strip()]
    return [artist]


def pack_rule_violations(
    pack_id: str, language: str, raws: Sequence[Any], entries: Sequence[dict[str, Any]]
) -> list[str]:
    """Editorial rule violations for one pack (``entries`` are the valid ones)."""
    problems: list[str] = []
    for raw in raws:
        if isinstance(raw, dict) and set(raw) - ALLOWED_KEYS:
            extra = ", ".join(sorted(set(raw) - ALLOWED_KEYS))
            problems.append(f"{raw.get('title')!r}: unexpected keys: {extra}")
    film_pack = pack_id.startswith("hi-bollywood")
    for entry in entries:
        title, artist = entry["title"], entry["artist"]
        if _TITLE_SUFFIX.search(title):
            problems.append(f"{title!r}: title has a feat./from/version suffix")
        if language == "hi" and len(list(_performers(artist, language))) > 2:
            problems.append(f"{title!r}: more than two singers")
        if film_pack and not entry["film"]:
            problems.append(f"{title!r}: Hindi film song without film")
        if not entry["genre"]:
            problems.append(f"{title!r}: missing genre")
    genres = Counter(e["genre"] for e in entries if e["genre"])
    if len(genres) > 1:
        problems.append(f"mixed genres: {dict(genres)}")
    cap = artist_cap(pack_id, language)
    counts = Counter(p for e in entries for p in _performers(e["artist"], language))
    for name, count in sorted(counts.items()):
        if count > cap:
            problems.append(f"{name!r} has {count} songs (max {cap})")
    return problems
