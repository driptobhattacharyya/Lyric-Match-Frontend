"""Leaderboard: name rules, receipt checks, game scoring, and the stores.

``MemoryLeaderboard`` is used in tests and with FAKE_DB=1; production uses
``supabase.SupabaseLeaderboard``. Both raise ``DuplicateGame`` when the same
set of rounds is submitted twice and ``LeaderboardUnavailable`` on storage
errors.
"""

from __future__ import annotations

import hashlib
import re
import threading
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Protocol

NAME_MAX = 20
_NAME = re.compile(r"^[A-Za-z0-9 _.\-]+$")
PERIODS = {"all": None, "week": timedelta(days=7), "day": timedelta(days=1)}

# Small built-in blocklist (English and romanised Hindi). Matched against the
# name with spaces/punctuation removed and common look-alike digits mapped.
_BLOCKED_SUBSTRINGS = (
    "fuck", "fuk", "shit", "cunt", "nigg", "nigga", "faggot", "bitch", "whore", "slut",
    "rapist", "nazi", "hitler", "pedo", "wank", "twat", "bastard", "asshole", "dickhead",
    "motherf", "chutiya", "chutia", "madarchod", "madarc", "bhenchod", "behenchod",
    "benchod", "bhosd", "gandu", "randi", "lavde", "lauda", "lawda", "harami", "kutta",
    "kamina", "chod",
)  # fmt: skip
_BLOCKED_WORDS = {"ass", "cum", "tit", "tits", "dick", "cock", "porn", "sex", "fag", "gaand"}
_LEET = str.maketrans({"0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b"})


class DuplicateGame(Exception):
    pass


class LeaderboardUnavailable(Exception):
    pass


def clean_name(raw: object) -> str | None:
    """Trimmed name if it follows the rules, else None."""
    if not isinstance(raw, str):
        return None
    name = " ".join(raw.split())
    if not 1 <= len(name) <= NAME_MAX or not _NAME.match(name):
        return None
    return name


def is_blocked_name(name: str) -> bool:
    lowered = name.casefold().translate(_LEET)
    squashed = re.sub(r"[^a-z]", "", lowered)
    if any(word in squashed for word in _BLOCKED_SUBSTRINGS):
        return True
    words = re.split(r"[^a-z]+", lowered)
    return any(w in _BLOCKED_WORDS for w in words)


def game_fingerprint(mode: str, round_ids: list[str]) -> str:
    """Same rounds (in any order) give the same fingerprint."""
    joined = "|".join([mode, *sorted(round_ids)])
    return hashlib.sha256(joined.encode()).hexdigest()


@dataclass(frozen=True)
class ScoreEntry:
    name: str
    mode: str
    score: int
    correct: int
    rounds: int
    fingerprint: str


@dataclass(frozen=True)
class ScoreRow:
    name: str
    score: int
    correct: int
    rounds: int
    created_at: datetime


class LeaderboardStore(Protocol):
    def insert(self, entry: ScoreEntry) -> str: ...

    def rank(self, mode: str, score: int) -> int: ...

    def top(self, mode: str, since: datetime | None, limit: int) -> list[ScoreRow]: ...


def ranked(rows: list[ScoreRow]) -> list[tuple[int, ScoreRow]]:
    """Competition ranking ("1, 2, 2, 4"); rows must be sorted by score desc."""
    result: list[tuple[int, ScoreRow]] = []
    for index, row in enumerate(rows):
        if result and result[-1][1].score == row.score:
            result.append((result[-1][0], row))
        else:
            result.append((index + 1, row))
    return result


def since_for(period: str, now: datetime | None = None) -> datetime | None:
    delta = PERIODS[period]
    return None if delta is None else (now or datetime.now(UTC)) - delta


class MemoryLeaderboard:
    def __init__(self) -> None:
        self._rows: list[tuple[str, ScoreEntry, datetime]] = []
        self._fingerprints: set[str] = set()
        self._lock = threading.Lock()

    def insert(self, entry: ScoreEntry) -> str:
        with self._lock:
            if entry.fingerprint in self._fingerprints:
                raise DuplicateGame
            self._fingerprints.add(entry.fingerprint)
            row_id = str(uuid.uuid4())
            self._rows.append((row_id, entry, datetime.now(UTC)))
            return row_id

    def rank(self, mode: str, score: int) -> int:
        with self._lock:
            return 1 + sum(1 for _, e, _ in self._rows if e.mode == mode and e.score > score)

    def top(self, mode: str, since: datetime | None, limit: int) -> list[ScoreRow]:
        with self._lock:
            rows = [
                (e, created)
                for _, e, created in self._rows
                if e.mode == mode and (since is None or created >= since)
            ]
        rows.sort(key=lambda r: (-r[0].score, r[1]))
        return [ScoreRow(e.name, e.score, e.correct, e.rounds, c) for e, c in rows[:limit]]
