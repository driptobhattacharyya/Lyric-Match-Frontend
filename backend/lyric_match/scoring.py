"""Round points and game score (see docs/api.md, "Scoring")."""

from __future__ import annotations

import math
from collections.abc import Iterable

BASE_POINTS = 100
MAX_SPEED_BONUS = 50
MIN_CORRECT_POINTS = 10
LETTER_HINT_PENALTY = 15
ARTIST_HINT_PENALTY = 20
STREAK_STEP = 0.1
MAX_STREAK_MULTIPLIER = 1.5


def round_half_up(value: float) -> int:
    """Like JavaScript's Math.round, so client and server agree on .5 cases."""
    return math.floor(value + 0.5)


def speed_bonus(elapsed: float, time_limit: float) -> int:
    if time_limit <= 0:
        return 0
    return round_half_up(MAX_SPEED_BONUS * max(0.0, 1 - max(0.0, elapsed) / time_limit))


def hint_penalty(letters_level: int, artist_hint: bool) -> int:
    return LETTER_HINT_PENALTY * letters_level + (ARTIST_HINT_PENALTY if artist_hint else 0)


def round_points(elapsed: float, time_limit: float, letters_level: int, artist_hint: bool) -> int:
    points = BASE_POINTS + speed_bonus(elapsed, time_limit) - hint_penalty(letters_level, artist_hint)
    return max(MIN_CORRECT_POINTS, points)


def streak_multiplier(streak: int) -> float:
    """Multiplier for the ``streak``-th consecutive correct round (1-based)."""
    return min(MAX_STREAK_MULTIPLIER, 1 + STREAK_STEP * (streak - 1))


def game_score(rounds: Iterable[tuple[bool, int]]) -> int:
    """Total of (correct, base points) rounds in play order with the streak multiplier."""
    total = 0
    streak = 0
    for correct, points in rounds:
        if not correct:
            streak = 0
            continue
        streak += 1
        total += round_half_up(points * streak_multiplier(streak))
    return total
