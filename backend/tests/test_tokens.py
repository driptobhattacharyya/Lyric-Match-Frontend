import base64

import pytest

from lyric_match.keys import derive_key
from lyric_match.tokens import InvalidToken, RoundClaims, TokenCodec

CLAIMS = RoundClaims(song_id="abc123", title="Shake It Off", artist="Taylor Swift", mode="type")


@pytest.fixture
def codec():
    return TokenCodec(derive_key("secret-one", "round-token"), ttl_seconds=900)


def test_round_trip(codec):
    assert codec.decode(codec.encode(CLAIMS)) == CLAIMS


def test_expiry(codec):
    token = codec.encode(CLAIMS, now=1_000_000)
    assert codec.decode(token, now=1_000_000 + 899) == CLAIMS
    with pytest.raises(InvalidToken):
        codec.decode(token, now=1_000_000 + 901)


def test_tampered_token_rejected(codec):
    token = codec.encode(CLAIMS)
    raw = bytearray(base64.urlsafe_b64decode(token))
    raw[30] ^= 0x01
    with pytest.raises(InvalidToken):
        codec.decode(base64.urlsafe_b64encode(bytes(raw)).decode())


def test_other_key_rejected(codec):
    other = TokenCodec(derive_key("secret-two", "round-token"), ttl_seconds=900)
    with pytest.raises(InvalidToken):
        other.decode(codec.encode(CLAIMS))


@pytest.mark.parametrize("bad", ["", "garbage", "gAAAA" + "x" * 50, "a" * 5000, None, 123])
def test_garbage_rejected(codec, bad):
    with pytest.raises(InvalidToken):
        codec.decode(bad)


def test_token_is_opaque(codec):
    token = codec.encode(CLAIMS)
    decoded = base64.urlsafe_b64decode(token + "==")
    for secret in (b"Shake", b"shake", b"Taylor", b"abc123"):
        assert secret not in decoded
        assert secret.decode() not in token
