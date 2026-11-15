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


_DOUBLED = re.compile(r"([a-z])\1+")


def fold_romanised(text: str) -> str:
    """Collapse common spelling variants of romanised Hindi.

    Applied to already-normalised text: w/v, ph/f, q/k, chh/ch, ee/i, oo/u,
    any doubled letter (aa/a, nn/n, ...) and an optional trailing "h"
    ("Chaand"/"Chand", "Kee"/"Ki", "Pyaar"/"Pyar", "Ishq"/"Ishk", "Hai"/"Haih").
    """
    words = []
    for word in text.split():
        word = word.replace("w", "v").replace("ph", "f").replace("q", "k")
        word = word.replace("chh", "ch").replace("ee", "i").replace("oo", "u")
        word = _DOUBLED.sub(r"\1", word)
        if len(word) > 2 and word.endswith("h"):
            word = word[:-1]
        words.append(word)
    return " ".join(words)


def _candidates(guess: str) -> list[str]:
    """The whole guess, plus the title part of "title by artist" / "title - artist"."""
    parts = _ARTIST_SEPARATORS.split(guess, maxsplit=1)
    return [guess, parts[0]] if len(parts) > 1 else [guess]


def _matches(norm: str, target: str) -> bool:
    if norm == target:
        return True
    if len(norm) < max(2, MIN_LENGTH_RATIO * len(target)):
        return False
    return fuzz.ratio(norm, target) >= FUZZY_THRESHOLD


def is_correct(guess: str, title: str, language: str = "en") -> bool:
    """Whether ``guess`` names ``title``. Hindi titles also match spelling variants."""
    target = normalize(title)
    if not target:
        return False
    for candidate in _candidates(guess):
        norm = normalize(candidate)
        if not norm:
            continue
        if _matches(norm, target):
            return True
        if language == "hi" and _matches(fold_romanised(norm), fold_romanised(target)):
            return True
    return False
