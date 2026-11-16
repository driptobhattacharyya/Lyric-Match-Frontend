"""Supabase/PostgREST integration against an in-memory fake (httpx2.MockTransport)."""

import pytest
from conftest import StubGenerator, assert_error, new_round, reveal
from fake_postgrest import FakePostgrest

from lyric_match.llm import GeminiGenerator
from lyric_match.supabase import DatabaseError, PostgrestClient

URL = "https://project.example.supabase.co"


@pytest.fixture
def db():
    return FakePostgrest()


@pytest.fixture
def make_db_app(make_app, db):
    def _make(**overrides):
        config = {
            "SUPABASE_URL": URL,
            "SUPABASE_SERVICE_ROLE_KEY": "sb_secret_test",
            "SUPABASE_TRANSPORT": db.transport,
            **overrides,
        }
        return make_app(**config)

    return _make


def _only(app, title):
    """exclude list that leaves just the song called ``title``."""
    songs = app.extensions["lyric_match"].catalogue.songs
    target = next(s for s in songs if s.title == title)
    return target, [s.id for s in songs if s.id != target.id]


def _store_snippet(db, song, text):
    db.snippets.append({"song_key": song.cache_key, "lyrics": text, "provider": "seed"})


# --- client ---------------------------------------------------------------------


def test_headers_and_base_url(db):
    PostgrestClient(URL + "/", "sb_secret_abc", transport=db.transport).request(
        "GET", "snippets", params={"song_key": "eq.x|y", "limit": "1", "select": "lyrics"}
    )
    request = db.requests[-1]
    assert str(request.url).startswith(URL + "/rest/v1/snippets?")
    assert request.headers["apikey"] == "sb_secret_abc"
    assert "authorization" not in request.headers
    PostgrestClient(URL, "eyJhbGciOi.legacy.jwt", transport=db.transport).request(
        "GET", "snippets", params={"song_key": "eq.x|y", "limit": "1", "select": "lyrics"}
    )
    assert db.requests[-1].headers["authorization"] == "Bearer eyJhbGciOi.legacy.jwt"


@pytest.mark.parametrize("failure", ["500", "network"])
def test_client_errors_hide_details(db, failure):
    db.fail = failure
    client = PostgrestClient(URL, "sb_secret_hidden", transport=db.transport)
    with pytest.raises(DatabaseError) as info:
        client.request("GET", "scores")
    assert "sb_secret_hidden" not in str(info.value)


# --- snippet store ----------------------------------------------------------------


def test_stored_snippets_used_before_llm(make_db_app, db):
    generator = StubGenerator()
    app = make_db_app(SNIPPET_GENERATOR=generator, CACHE_HIT_PROBABILITY=1.0)
    song, exclude = _only(app, "Glass Harbour")
    _store_snippet(db, song, "stored placeholder one\nstored placeholder two")
    client = app.test_client()
    for _ in range(3):
        body = new_round(client, exclude=exclude)
        assert body["lyrics"] == "stored placeholder one\nstored placeholder two"
    assert generator.calls == []
    # Looked up once, then served from memory.
    assert sum(r.url.path.endswith("/snippets") for r in db.requests) == 1


def test_generated_snippets_are_stored(make_db_app, db):
    generator = StubGenerator(name="gemini")
    app = make_db_app(SNIPPET_GENERATOR=generator)
    song, exclude = _only(app, "Dil Ki Doori")
    body = new_round(app.test_client(), exclude=exclude)
    assert db.snippets == [
        {
            "song_key": song.cache_key,
            "title": song.title,
            "artist": song.artist,
            "language": "hi",
            "pack_id": "hi-one",
            "lyrics": body["lyrics"],
            "provider": "gemini",
        }
    ]


def test_store_without_llm_serves_rounds(make_db_app, db):
    app = make_db_app(SNIPPET_GENERATOR=[GeminiGenerator(None, "m", 5)])
    song, exclude = _only(app, "Thunder Kettle")
    _store_snippet(db, song, "stored placeholder a\nstored placeholder b")
    client = app.test_client()
    body = new_round(client, packs=["en-beta"])
    assert body["lyrics"] == "stored placeholder a\nstored placeholder b"
    assert reveal(client, body["roundToken"])["answer"]["title"] == "Thunder Kettle"


def test_invalid_stored_snippets_ignored(make_db_app, db):
    generator = StubGenerator()
    app = make_db_app(SNIPPET_GENERATOR=generator, CACHE_HIT_PROBABILITY=1.0)
    song, exclude = _only(app, "Glass Harbour")
    _store_snippet(db, song, "तुम ही हो")
    body = new_round(app.test_client(), exclude=exclude)
    assert body["lyrics"].startswith("placeholder line A")
    assert len(generator.calls) == 1


@pytest.mark.parametrize("failure", ["500", "network"])
def test_database_errors_degrade_to_memory(make_db_app, db, failure):
    db.fail = failure
    generator = StubGenerator()
    app = make_db_app(SNIPPET_GENERATOR=generator)
    client = app.test_client()
    for _ in range(3):
        new_round(client)
    assert len(generator.calls) == 3
    assert db.snippets == []


def test_fake_db_never_calls_supabase(make_db_app, db):
    app = make_db_app(FAKE_DB=True)
    client = app.test_client()
    new_round(client)
    assert client.get("/api/meta").json["leaderboard"] is True
    assert db.requests == []


# --- leaderboard on Supabase ----------------------------------------------------


def _receipts(client, state, results, mode="type"):
    receipts = []
    for correct in results:
        token = new_round(client, mode=mode)["roundToken"]
        if correct:
            title = state.tokens.decode(token).title
            body = client.post("/api/rounds/check", json={"roundToken": token, "guess": title}).json
        else:
            body = reveal(client, token)
        receipts.append(body["receipt"])
    return receipts


def test_supabase_leaderboard_flow(make_db_app, db):
    app = make_db_app()
    client = app.test_client()
    state = app.extensions["lyric_match"]
    assert client.get("/api/meta").json["leaderboard"] is True

    first = _receipts(client, state, [True, True, False])
    response = client.post("/api/scores", json={"name": "  Player One ", "receipts": first})
    assert response.status_code == 200, response.json
    assert response.json["rank"] == 1 and response.json["score"] > 0
    row = db.scores[0]
    assert row["name"] == "Player One" and row["mode"] == "type"
    assert row["correct"] == 2 and row["rounds"] == 3 and len(row["fingerprint"]) == 64
    assert response.json["id"] == row["id"]

    again = client.post("/api/scores", json={"name": "Someone Else", "receipts": first})
    assert_error(again, 409, "duplicate_game")

    second = _receipts(client, state, [False])
    response = client.post("/api/scores", json={"name": "Zero", "receipts": second})
    assert response.json == {"id": db.scores[1]["id"], "score": 0, "rank": 2}

    board = client.get("/api/leaderboard?mode=type&period=day&limit=5").json["entries"]
    assert [(e["rank"], e["name"], e["rounds"]) for e in board] == [
        (1, "Player One", 3),
        (2, "Zero", 1),
    ]
    assert board[0]["createdAt"].endswith("Z")
    assert client.get("/api/leaderboard?mode=choice").json == {"entries": []}
    request = db.requests[-1]
    assert "created_at" not in dict(request.url.params)


@pytest.mark.parametrize("failure", ["500", "network"])
def test_supabase_leaderboard_errors_are_503(make_db_app, db, failure):
    app = make_db_app()
    client = app.test_client()
    receipts = _receipts(client, app.extensions["lyric_match"], [True])
    db.fail = failure
    assert_error(
        client.post("/api/scores", json={"name": "Abc", "receipts": receipts}),
        503,
        "leaderboard_unavailable",
    )
    assert_error(client.get("/api/leaderboard"), 503, "leaderboard_unavailable")
    db.fail = None
    assert client.post("/api/scores", json={"name": "Abc", "receipts": receipts}).status_code == 200
