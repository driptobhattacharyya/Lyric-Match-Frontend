from datetime import UTC, datetime, timedelta

import pytest
from conftest import assert_error, new_round, reveal

from lyric_match.leaderboard import (
    MemoryLeaderboard,
    ScoreEntry,
    ScoreRow,
    clean_name,
    game_fingerprint,
    is_blocked_name,
    ranked,
)
from lyric_match.scoring import game_score
from lyric_match.tokens import ReceiptClaims


def play(client, state, results, mode="type"):
    """Play rounds (True = correct, False = revealed) and return (receipts, points)."""
    receipts, points = [], []
    for correct in results:
        token = new_round(client, mode=mode)["roundToken"]
        if correct:
            title = state.tokens.decode(token).title
            body = client.post("/api/rounds/check", json={"roundToken": token, "guess": title}).json
        else:
            body = reveal(client, token)
        receipts.append(body["receipt"])
        points.append(body["points"])
    return receipts, points


def submit(client, receipts, name="Tester"):
    return client.post("/api/scores", json={"name": name, "receipts": receipts})


# --- names ----------------------------------------------------------------------


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Dripto", "Dripto"),
        ("  a  b  ", "a b"),
        ("x_y-z.1", "x_y-z.1"),
        ("a" * 20, "a" * 20),
        ("a" * 21, None),
        ("", None),
        ("   ", None),
        ("<script>", None),
        ("name!", None),
        ("राम", None),
        (5, None),
        (None, None),
    ],
)
def test_clean_name(raw, expected):
    assert clean_name(raw) == expected


@pytest.mark.parametrize(
    ("name", "blocked"),
    [
        ("fuck", True),
        ("FuCk3r", True),
        ("f.u.c.k", True),
        ("sh1t head", True),
        ("big ass", True),
        ("chutiya", True),
        ("Dripto", False),
        ("Classic Fan", False),
        ("Nazia", False),
        ("Scunthorpe", False),
        ("Cocktail", False),
        ("Pedro", False),
    ],
)
def test_profanity(name, blocked):
    assert is_blocked_name(name) is blocked


# --- submission -----------------------------------------------------------------


def test_submit_scores_with_streak(client, state):
    receipts, points = play(client, state, [True, True, False, True])
    response = submit(client, receipts)
    assert response.status_code == 200, response.json
    expected = game_score(zip([True, True, False, True], points, strict=True))
    assert response.json["score"] == expected
    assert response.json["rank"] == 1
    assert isinstance(response.json["id"], str)


def test_rank_and_ties(client, state):
    board = state.leaderboard
    for i, score in enumerate([500, 300, 300]):
        board.insert(ScoreEntry(f"P{i}", "type", score, 1, 1, f"fp{i}"))
    receipts, _ = play(client, state, [False])
    assert submit(client, receipts).json["rank"] == 4
    entries = client.get("/api/leaderboard").json["entries"]
    assert [(e["rank"], e["score"]) for e in entries] == [(1, 500), (2, 300), (2, 300), (4, 0)]
    assert set(entries[0]) == {"rank", "name", "score", "correct", "rounds", "createdAt"}


def test_duplicate_game_any_order(client, state):
    receipts, _ = play(client, state, [True, False])
    assert submit(client, receipts).status_code == 200
    assert_error(submit(client, list(reversed(receipts))), 409, "duplicate_game")


def test_rejects_mixed_modes(client, state):
    a, _ = play(client, state, [True], mode="type")
    b, _ = play(client, state, [True], mode="choice")
    assert_error(submit(client, a + b), 400, "bad_request")


def test_rejects_repeated_round(client, state):
    receipts, _ = play(client, state, [True])
    assert_error(submit(client, receipts * 2), 400, "bad_request")


def test_rejects_too_many_or_none(client, state):
    receipts, _ = play(client, state, [False] * 9)
    assert_error(submit(client, receipts), 400, "bad_request")
    assert_error(submit(client, []), 400, "bad_request")
    assert_error(client.post("/api/scores", json={"name": "x"}), 400, "bad_request")
    assert submit(client, receipts[:8]).status_code == 200


@pytest.mark.parametrize("name", ["", "a" * 21, "bad<name>", "fuckface", None])
def test_rejects_bad_names(client, state, name):
    receipts, _ = play(client, state, [True])
    assert_error(submit(client, receipts, name=name), 400, "bad_request")


def test_rejects_forged_and_foreign_receipts(client, state, make_app):
    token = new_round(client)["roundToken"]
    assert_error(submit(client, [token]), 400, "invalid_token")
    assert_error(submit(client, ["garbage"]), 400, "invalid_token")
    other = make_app(SECRET_KEY="other", FAKE_DB=True)
    foreign, _ = play(other.test_client(), other.extensions["lyric_match"], [True])
    assert_error(submit(client, foreign), 400, "invalid_token")


def test_rejects_receipts_older_than_an_hour(client, state):
    import time

    old = time.time() - 3700
    receipt = state.receipts.encode(ReceiptClaims("old-round", "type", True, 150, old), now=old)
    assert_error(submit(client, [receipt]), 400, "invalid_token")
    fresh = state.receipts.encode(ReceiptClaims("new-round", "type", True, 150, time.time()))
    assert submit(client, [fresh]).json["score"] == 150


def test_scores_503_without_database(make_app):
    client = make_app().test_client()
    assert_error(
        client.post("/api/scores", json={"name": "x", "receipts": ["r"]}),
        503,
        "leaderboard_unavailable",
    )
    assert_error(client.get("/api/leaderboard"), 503, "leaderboard_unavailable")


def test_scores_rate_limited(make_app):
    app = make_app(FAKE_DB=True, RATELIMIT_ENABLED=True)
    client = app.test_client()
    for _ in range(6):
        assert client.post("/api/scores", json={"name": "x", "receipts": []}).status_code == 400
    response = client.post("/api/scores", json={"name": "x", "receipts": []})
    assert_error(response, 429, "rate_limited")


# --- leaderboard GET -------------------------------------------------------------


@pytest.mark.parametrize(
    "query",
    ["mode=hard", "period=year", "limit=0", "limit=51", "limit=abc", "limit=-1", "limit=2.5"],
)
def test_leaderboard_bad_params(client, query):
    assert_error(client.get(f"/api/leaderboard?{query}"), 400, "bad_request")


def test_leaderboard_defaults_and_limit(client, state):
    for i in range(25):
        state.leaderboard.insert(ScoreEntry(f"P{i}", "type", i, 0, 1, f"f{i}"))
    state.leaderboard.insert(ScoreEntry("C", "choice", 1, 1, 1, "c"))
    assert len(client.get("/api/leaderboard").json["entries"]) == 20
    entries = client.get("/api/leaderboard?mode=type&period=all&limit=3").json["entries"]
    assert [e["name"] for e in entries] == ["P24", "P23", "P22"]
    assert [e["name"] for e in client.get("/api/leaderboard?mode=choice").json["entries"]] == ["C"]


def test_memory_periods():
    board = MemoryLeaderboard()
    board.insert(ScoreEntry("old", "type", 900, 1, 1, "a"))
    board.insert(ScoreEntry("new", "type", 100, 1, 1, "b"))
    # Backdate the first row by eight days.
    row_id, entry, created = board._rows[0]
    board._rows[0] = (row_id, entry, created - timedelta(days=8))
    now = datetime.now(UTC)
    assert [r.name for r in board.top("type", None, 10)] == ["old", "new"]
    assert [r.name for r in board.top("type", now - timedelta(days=7), 10)] == ["new"]


def test_ranked_helper():
    now = datetime.now(UTC)
    rows = [ScoreRow("a", s, 0, 1, now) for s in (10, 10, 5, 1, 1)]
    assert [r for r, _ in ranked(rows)] == [1, 1, 3, 4, 4]


def test_fingerprint():
    assert game_fingerprint("type", ["b", "a"]) == game_fingerprint("type", ["a", "b"])
    assert game_fingerprint("type", ["a"]) != game_fingerprint("choice", ["a"])
