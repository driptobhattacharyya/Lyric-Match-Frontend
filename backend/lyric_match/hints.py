"""Title masks and progressive letter hints."""

from __future__ import annotations

import hashlib
import random
import re
from collections.abc import Collection

_WORD = re.compile(r"[^\W_]+(?:'[^\W_]+)*")
_LEVEL_FRACTION = {2: 0.4, 3: 0.6}


def title_mask(title: str, revealed: Collection[int] = ()) -> str:
    """Replace every letter/digit with "_" unless its index is in ``revealed``."""
    return "".join("_" if ch.isalnum() and i not in revealed else ch for i, ch in enumerate(title))


def letters_hint(title: str, seed: str, level: int) -> str:
    """Mask with more letters revealed per level.

    Reveal order is fixed per ``seed`` (the round token): first letters of each
    word, then the remaining letters in a seeded shuffle. Every level reveals a
    prefix of that order, so each level is a superset of the one before.
    """
    positions = [i for i, ch in enumerate(title) if ch.isalnum()]
    firsts = [m.start() for m in _WORD.finditer(title)]
    rest = [i for i in positions if i not in set(firsts)]
    random.Random(hashlib.sha256(seed.encode()).digest()).shuffle(rest)
    order = firsts + rest

    count = len(firsts)
    if level in _LEVEL_FRACTION:
        target = min(round(_LEVEL_FRACTION[level] * len(positions)), len(positions) - 1)
        count = max(count, target)
    return title_mask(title, set(order[:count]))
