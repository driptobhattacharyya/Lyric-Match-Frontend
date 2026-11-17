"""Stateless, encrypted round tokens and score receipts (Fernet: AES-128-CBC + HMAC-SHA256).

Round tokens and receipts use different keys (derived for different purposes),
so one can never be passed off as the other.
"""

from __future__ import annotations

import base64
import json
import time
from dataclasses import dataclass, replace

from cryptography.fernet import Fernet
from cryptography.fernet import InvalidToken as FernetInvalidToken

MAX_TOKEN_LENGTH = 2048
CLOCK_SKEW_SECONDS = 60


class InvalidToken(Exception):
    """Token is malformed, tampered with, or expired."""


@dataclass(frozen=True)
class RoundClaims:
    round_id: str
    song_id: str
    title: str
    artist: str
    mode: str
    issued_at: float
    time_limit: int
    year: int | None = None
    film: str | None = None
    language: str = "en"
    letters_level: int = 0
    artist_hint: bool = False

    def with_hint(self, kind: str, level: int = 0) -> RoundClaims:
        if kind == "artist":
            return replace(self, artist_hint=True)
        return replace(self, letters_level=max(self.letters_level, level))


@dataclass(frozen=True)
class ReceiptClaims:
    round_id: str
    mode: str
    correct: bool
    points: int
    issued_at: float  # when the round was issued


def _dumps(data: dict) -> bytes:
    return json.dumps(data, separators=(",", ":"), ensure_ascii=False).encode()


class _Codec:
    def __init__(self, key: bytes, ttl_seconds: int):
        self._fernet = Fernet(base64.urlsafe_b64encode(key))
        self._ttl = ttl_seconds

    def _encrypt(self, data: dict, now: float | None) -> str:
        return self._fernet.encrypt_at_time(_dumps(data), int(_now(now))).decode()

    def _decrypt(self, token: object, now: float | None) -> dict:
        if not isinstance(token, str) or not token or len(token) > MAX_TOKEN_LENGTH:
            raise InvalidToken
        try:
            data = json.loads(self._fernet.decrypt(token.encode()))
        except (FernetInvalidToken, ValueError) as exc:
            raise InvalidToken from exc
        if not isinstance(data, dict):
            raise InvalidToken
        return data

    def _check_age(self, issued_at: float, now: float | None) -> None:
        current = _now(now)
        if issued_at > current + CLOCK_SKEW_SECONDS or current - issued_at > self._ttl:
            raise InvalidToken


def _now(now: float | None) -> float:
    return time.time() if now is None else now


class TokenCodec(_Codec):
    """Round tokens. Expiry counts from when the round was issued, so a token
    re-issued after a hint does not extend the round."""

    def encode(self, claims: RoundClaims, now: float | None = None) -> str:
        data = {
            "r": claims.round_id,
            "s": claims.song_id,
            "t": claims.title,
            "a": claims.artist,
            "m": claims.mode,
            "i": round(claims.issued_at, 3),
            "l": claims.time_limit,
            "y": claims.year,
            "f": claims.film,
            "lg": claims.language,
            "hl": claims.letters_level,
            "ha": claims.artist_hint,
        }
        return self._encrypt(data, now)

    def decode(self, token: object, now: float | None = None) -> RoundClaims:
        data = self._decrypt(token, now)
        try:
            claims = RoundClaims(
                round_id=str(data["r"]),
                song_id=str(data["s"]),
                title=str(data["t"]),
                artist=str(data["a"]),
                mode=str(data["m"]),
                issued_at=float(data["i"]),
                time_limit=int(data["l"]),
                year=None if data.get("y") is None else int(data["y"]),
                film=None if data.get("f") is None else str(data["f"]),
                language=str(data.get("lg", "en")),
                letters_level=int(data.get("hl", 0)),
                artist_hint=bool(data.get("ha", False)),
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise InvalidToken from exc
        self._check_age(claims.issued_at, now)
        return claims


class ReceiptCodec(_Codec):
    """Signed + encrypted proof of one round's outcome, for score submission."""

    def encode(self, claims: ReceiptClaims, now: float | None = None) -> str:
        data = {
            "r": claims.round_id,
            "m": claims.mode,
            "c": claims.correct,
            "p": claims.points,
            "i": round(claims.issued_at, 3),
        }
        return self._encrypt(data, now)

    def decode(self, token: object, now: float | None = None) -> ReceiptClaims:
        data = self._decrypt(token, now)
        try:
            claims = ReceiptClaims(
                round_id=str(data["r"]),
                mode=str(data["m"]),
                correct=bool(data["c"]),
                points=int(data["p"]),
                issued_at=float(data["i"]),
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise InvalidToken from exc
        self._check_age(claims.issued_at, now)
        return claims
