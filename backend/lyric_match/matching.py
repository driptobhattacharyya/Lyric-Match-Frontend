"""Lenient-but-not-too-lenient answer matching."""

from __future__ import annotations

import re
import unicodedata

from rapidfuzz import fuzz

FUZZY_THRESHOLD = 85
MIN_LENGTH_RATIO = 0.6

_PARENTHETICAL = re.compile(r"\s*[(\[][^)\]]*[)\]]")
_APOSTROPHES = re.compile(r"['‘’`]")
_NON_ALNUM = re.compile(r"[^\w\s]|_")
_ARTIST_SEPARATORS = re.compile(r"\s+by\s+|\s+[-–—]\s+", re.IGNORECASE)


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = _PARENTHETICAL.sub(" ", text.casefold())
    text = _APOSTROPHES.sub("", text)
    text = _NON_ALNUM.sub(" ", text)
    return " ".join(text.split())


def _candidates(guess: str) -> list[str]:
    """The whole guess, plus the title part of "title by artist" / "title - artist"."""
    parts = _ARTIST_SEPARATORS.split(guess, maxsplit=1)
    return [guess, parts[0]] if len(parts) > 1 else [guess]


def is_correct(guess: str, title: str) -> bool:
    target = normalize(title)
    if not target:
        return False
    for candidate in _candidates(guess):
        norm = normalize(candidate)
        if not norm:
            continue
        if norm == target:
            return True
        if len(norm) < max(2, MIN_LENGTH_RATIO * len(target)):
            continue
        if fuzz.ratio(norm, target) >= FUZZY_THRESHOLD:
            return True
    return False
