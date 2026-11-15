import base64

import pytest

from lyric_match.keys import derive_key
from lyric_match.tokens import InvalidToken, ReceiptClaims, ReceiptCodec, RoundClaims, TokenCodec

ISSUED = 1_000_000.0
CLAIMS = RoundClaims(
    round_id="r-1",
    song_id="abc123",
    title="Shake It Off",
    artist="Taylor Swift",
    mode="type",
    issued_at=ISSUED,
    time_limit=45,
    year=2014,
)


@pytest.fixture
def codec():
    return TokenCodec(derive_key("secret-one", "round-token"), ttl_seconds=900)


def test_round_trip(codec):
    assert codec.decode(codec.encode(CLAIMS, now=ISSUED), now=ISSUED) == CLAIMS
    hinted = CLAIMS.with_hint("letters", 2).with_hint("artist").with_hint("letters", 1)
    assert hinted.letters_level == 2 and hinted.artist_hint
    assert codec.decode(codec.encode(hinted, now=ISSUED + 5), now=ISSUED + 6) == hinted


def test_expiry_counts_from_round_issue_not_reencryption(codec):
    token = codec.encode(CLAIMS, now=ISSUED)
    assert codec.decode(token, now=ISSUED + 899) == CLAIMS
    with pytest.raises(InvalidToken):
        codec.decode(token, now=ISSUED + 901)
    # A token re-issued after a hint keeps the round's original issue time.
    later = codec.encode(CLAIMS.with_hint("artist"), now=ISSUED + 800)
    with pytest.raises(InvalidToken):
        codec.decode(later, now=ISSUED + 901)


def test_future_issue_time_rejected(codec):
    with pytest.raises(InvalidToken):
        codec.decode(codec.encode(CLAIMS, now=ISSUED), now=ISSUED - 3600)


def test_receipts_round_trip_and_separate_key():
    receipts = ReceiptCodec(derive_key("secret-one", "score-receipt"), ttl_seconds=3600)
    rounds = TokenCodec(derive_key("secret-one", "round-token"), ttl_seconds=900)
    claims = ReceiptClaims("r-1", "choice", True, 132, ISSUED)
    receipt = receipts.encode(claims, now=ISSUED + 10)
    assert receipts.decode(receipt, now=ISSUED + 20) == claims
    with pytest.raises(InvalidToken):
        rounds.decode(receipt, now=ISSUED + 20)
    with pytest.raises(InvalidToken):
        receipts.decode(rounds.encode(CLAIMS, now=ISSUED), now=ISSUED)
    with pytest.raises(InvalidToken):
        receipts.decode(receipt, now=ISSUED + 3601)


def test_tampered_token_rejected(codec):
    token = codec.encode(CLAIMS, now=ISSUED)
    raw = bytearray(base64.urlsafe_b64decode(token))
    raw[30] ^= 0x01
    with pytest.raises(InvalidToken):
        codec.decode(base64.urlsafe_b64encode(bytes(raw)).decode(), now=ISSUED)


def test_other_key_rejected(codec):
    other = TokenCodec(derive_key("secret-two", "round-token"), ttl_seconds=900)
    with pytest.raises(InvalidToken):
        other.decode(codec.encode(CLAIMS, now=ISSUED), now=ISSUED)


@pytest.mark.parametrize("bad", ["", "garbage", "gAAAA" + "x" * 50, "a" * 5000, None, 123])
def test_garbage_rejected(codec, bad):
    with pytest.raises(InvalidToken):
        codec.decode(bad)


def test_token_is_opaque(codec):
    token = codec.encode(CLAIMS, now=ISSUED)
    decoded = base64.urlsafe_b64decode(token + "==")
    for secret in (b"Shake", b"shake", b"Taylor", b"abc123"):
        assert secret not in decoded
        assert secret.decode() not in token
