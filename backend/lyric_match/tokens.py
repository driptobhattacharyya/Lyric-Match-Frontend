"""Stateless, encrypted round tokens (Fernet: AES-128-CBC + HMAC-SHA256)."""

from __future__ import annotations

import base64
import json
import time
from dataclasses import dataclass

from cryptography.fernet import Fernet
from cryptography.fernet import InvalidToken as FernetInvalidToken

MAX_TOKEN_LENGTH = 2048


class InvalidToken(Exception):
    """Token is malformed, tampered with, or expired."""


@dataclass(frozen=True)
class RoundClaims:
    song_id: str
    title: str
    artist: str
    mode: str


class TokenCodec:
    def __init__(self, key: bytes, ttl_seconds: int):
        self._fernet = Fernet(base64.urlsafe_b64encode(key))
        self._ttl = ttl_seconds

    def encode(self, claims: RoundClaims, now: float | None = None) -> str:
        payload = json.dumps(
            {"id": claims.song_id, "t": claims.title, "a": claims.artist, "m": claims.mode},
            separators=(",", ":"),
        ).encode()
        issued_at = int(time.time() if now is None else now)
        return self._fernet.encrypt_at_time(payload, issued_at).decode()

    def decode(self, token: str, now: float | None = None) -> RoundClaims:
        if not isinstance(token, str) or not token or len(token) > MAX_TOKEN_LENGTH:
            raise InvalidToken
        current = int(time.time() if now is None else now)
        try:
            raw = self._fernet.decrypt_at_time(token.encode(), self._ttl, current)
            data = json.loads(raw)
            return RoundClaims(
                song_id=str(data["id"]),
                title=str(data["t"]),
                artist=str(data["a"]),
                mode=str(data["m"]),
            )
        except (FernetInvalidToken, ValueError, KeyError, TypeError) as exc:
            raise InvalidToken from exc
