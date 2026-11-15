"""Per-app services, stored on ``app.extensions["lyric_match"]``."""

from __future__ import annotations

import threading
import time
from collections import OrderedDict
from collections.abc import Callable
from dataclasses import dataclass

from .leaderboard import LeaderboardStore
from .snippets import SnippetService
from .songs import Catalogue
from .tokens import ReceiptCodec, TokenCodec


class RevealedRounds:
    """Round ids whose answer was revealed, so the same token can't then be
    "checked" correct for a scoring receipt. Best effort, in memory, bounded;
    entries expire with the round token."""

    def __init__(
        self, ttl_seconds: float, max_entries: int = 50_000, clock: Callable[[], float] = time.time
    ):
        self._ttl = ttl_seconds
        self._max = max_entries
        self._clock = clock
        self._items: OrderedDict[str, float] = OrderedDict()
        self._lock = threading.Lock()

    def _prune(self, now: float) -> None:
        while self._items:
            key, added = next(iter(self._items.items()))
            if now - added <= self._ttl and len(self._items) <= self._max:
                break
            self._items.pop(key)

    def add(self, round_id: str) -> None:
        with self._lock:
            now = self._clock()
            self._items[round_id] = now
            self._items.move_to_end(round_id)
            self._prune(now)

    def __contains__(self, round_id: object) -> bool:
        with self._lock:
            self._prune(self._clock())
            return round_id in self._items


@dataclass
class AppState:
    catalogue: Catalogue
    tokens: TokenCodec
    receipts: ReceiptCodec
    snippets: SnippetService
    revealed: RevealedRounds
    leaderboard: LeaderboardStore | None = None
