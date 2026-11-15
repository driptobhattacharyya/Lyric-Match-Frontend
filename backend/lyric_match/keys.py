"""Derive independent sub-keys from the single SECRET_KEY."""

from __future__ import annotations

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF


def derive_key(secret: str, purpose: str) -> bytes:
    """Return 32 bytes bound to ``purpose`` so one key never serves two uses."""
    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=None,
        info=f"lyric-match:{purpose}".encode(),
    )
    return hkdf.derive(secret.encode())
