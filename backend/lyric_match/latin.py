"""Script checks: every title and lyric the game shows must be in Latin script."""

from __future__ import annotations

import re
import unicodedata

_DEVANAGARI = re.compile("[ऀ-ॿ꣠-ꣿ]")


def has_devanagari(text: str) -> bool:
    return bool(_DEVANAGARI.search(text))


def is_latin_text(text: str) -> bool:
    """True if every letter in ``text`` is a Latin letter (digits, punctuation,
    spaces and symbols are allowed)."""
    if has_devanagari(text):
        return False
    for ch in text:
        if ch.isalpha() and not unicodedata.name(ch, "").startswith("LATIN"):
            return False
    return True
