import base64
import json

import pytest
from conftest import StubGenerator, new_round

from lyric_match.songs import RAW_SONGS

TITLES = {title for title, _ in RAW_SONGS}
ARTISTS = {artist for _, artist in RAW_SONGS}


def answer_for(client, token):
    return client.post("/api/rounds/reveal", json={"roundToken": token}).json["answer"]


def assert_error(response, status, code):
    assert response.status_code == status, response.json
    assert set(response.json) == {"error"}
    assert response.json["error"]["code"] == code
    assert isinstance(response.json["error"]["message"], str)


# --- health -----------------------------------------------------------------


def test_healthz(client):
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json == {"status": "ok"}


def test_healthz_without_api_key(make_app):
    from lyric_match.llm import GeminiGenerator

    app = make_app(SNIPPET_GENERATOR=GeminiGenerator(None, "model", 5))
    client = app.test_client()
    assert client.get("/healthz").status_code == 200
    assert_error(client.post("/api/rounds", json={}), 503, "llm_unavailable")


# --- create round ------------------------------------------------------------


def test_create_round_type_mode(client):
    body = new_round(client)
    assert set(body) == {"roundToken", "lyrics", "mode", "titleLength", "titleMask", "options"}
    assert body["mode"] == "type"
    assert body["options"] is None
    answer = answer_for(client, body["roundToken"])
    assert body["titleLength"] == len(answer["title"])
    assert len(body["titleMask"]) == len(answer["title"])
    assert set(body["titleMask"]) <= set("_ '-")


def test_create_round_empty_body(client):
    response = client.post("/api/rounds")
    assert response.status_code == 200
    assert response.json["mode"] == "type"


def test_create_round_choice_mode(client):
    body = new_round(client, mode="choice")
    assert body["mode"] == "choice"
    assert len(body["options"]) == 4 == len(set(body["options"]))
    assert set(body["options"]) <= TITLES
    assert answer_for(client, body["roundToken"])["title"] in body["options"]


def test_answer_never_in_round_response(client):
    for mode in ("type", "choice"):
        for _ in range(10):
            body = new_round(client, mode=mode)
            answer = answer_for(client, body["roundToken"])
            visible = {k: v for k, v in body.items() if k not in ("roundToken", "options")}
            text = json.dumps(visible)
            assert answer["title"] not in text
            assert answer["artist"] not in text
            assert answer["songId"] not in json.dumps(body)


def test_token_not_decodable_without_key(client):
    token = new_round(client)["roundToken"]
    answer = answer_for(client, token)
    raw = base64.urlsafe_b64decode(token + "==")
    for value in (answer["title"], answer["artist"], answer["songId"]):
        assert value.encode() not in raw
        assert value not in token


@pytest.mark.parametrize(
    "body",
    [
        {"mode": "hard"},
        {"mode": 3},
        {"exclude": "abc"},
        {"exclude": [1, 2]},
        {"exclude": ["x"] * 51},
        {"exclude": ["x" * 65]},
    ],
)
def test_create_round_bad_request(client, body):
    assert_error(client.post("/api/rounds", json=body), 400, "bad_request")


@pytest.mark.parametrize("data", ["[1,2]", '"str"', "{not json", "null"])
def test_create_round_rejects_non_object_json(client, data):
    response = client.post("/api/rounds", data=data, content_type="application/json")
    assert_error(response, 400, "bad_request")


def test_body_size_cap(client):
    response = client.post(
        "/api/rounds", data=json.dumps({"exclude": ["a" * 9000]}), content_type="application/json"
    )
    assert_error(response, 413, "bad_request")


def test_exclude_honoured(client, state):
    all_ids = [s.id for s in state.catalogue.songs]
    keep = all_ids[7]
    for _ in range(10):
        body = new_round(client, exclude=[i for i in all_ids if i != keep])
        assert answer_for(client, body["roundToken"])["songId"] == keep


def test_exclude_everything_is_ignored(client, state):
    all_ids = [s.id for s in state.catalogue.songs]
    assert len(all_ids) <= 50
    body = new_round(client, exclude=all_ids)
    assert answer_for(client, body["roundToken"])["songId"] in all_ids


def test_unknown_exclude_ids_ignored(client):
    new_round(client, exclude=["not-a-song", "another"])


def test_song_ids_stable_across_restarts_with_same_secret(make_app):
    ids_a = [s.id for s in make_app().extensions["lyric_match"].catalogue.songs]
    ids_b = [s.id for s in make_app().extensions["lyric_match"].catalogue.songs]
    ids_c = [
        s.id for s in make_app(SECRET_KEY="different").extensions["lyric_match"].catalogue.songs
    ]
    assert ids_a == ids_b
    assert ids_a != ids_c
    assert len(set(ids_a)) == len(ids_a)
    assert not any(t.casefold() in i for i in ids_a for t in TITLES)


# --- hint ----------------------------------------------------------------------


def test_hint_letters_levels(client):
    token = new_round(client)["roundToken"]
    title = answer_for(client, token)["title"]
    masks = []
    for level in (1, 2, 3):
        response = client.post(
            "/api/rounds/hint", json={"roundToken": token, "kind": "letters", "level": level}
        )
        assert response.status_code == 200
        assert response.json["kind"] == "letters"
        masks.append(response.json["titleMask"])
    again = client.post(
        "/api/rounds/hint", json={"roundToken": token, "kind": "letters", "level": 2}
    ).json["titleMask"]
    assert again == masks[1]
    shown = [{i for i, c in enumerate(m) if c != "_"} for m in masks]
    assert shown[0] <= shown[1] <= shown[2]
    assert all(len(m) == len(title) for m in masks)


def test_hint_artist(client):
    token = new_round(client)["roundToken"]
    response = client.post("/api/rounds/hint", json={"roundToken": token, "kind": "artist"})
    assert response.status_code == 200
    assert response.json == {"kind": "artist", "artist": answer_for(client, token)["artist"]}


@pytest.mark.parametrize(
    "extra",
    [
        {"kind": "title"},
        {"kind": "letters", "level": 4},
        {"kind": "letters", "level": 0},
        {"kind": "letters", "level": "2"},
        {"kind": "letters", "level": True},
        {},
    ],
)
def test_hint_bad_request(client, extra):
    token = new_round(client)["roundToken"]
    response = client.post("/api/rounds/hint", json={"roundToken": token, **extra})
    assert_error(response, 400, "bad_request")


# --- check ---------------------------------------------------------------------


def test_check_correct_and_incorrect(client):
    token = new_round(client)["roundToken"]
    answer = answer_for(client, token)
    wrong = client.post("/api/rounds/check", json={"roundToken": token, "guess": "zzzz qqqq"})
    assert wrong.status_code == 200
    assert wrong.json == {"correct": False, "answer": None}
    right = client.post(
        "/api/rounds/check", json={"roundToken": token, "guess": answer["title"].upper()}
    )
    assert right.json == {"correct": True, "answer": answer}


@pytest.mark.parametrize("guess", ["", "   ", "x" * 201, 42, None])
def test_check_bad_guess(client, guess):
    token = new_round(client)["roundToken"]
    response = client.post("/api/rounds/check", json={"roundToken": token, "guess": guess})
    assert_error(response, 400, "bad_request")


# --- token errors (all round actions) ------------------------------------------

ACTIONS = [
    ("/api/rounds/hint", {"kind": "artist"}),
    ("/api/rounds/check", {"guess": "hello"}),
    ("/api/rounds/reveal", {}),
]


@pytest.mark.parametrize(("path", "extra"), ACTIONS)
def test_missing_token_is_bad_request(client, path, extra):
    assert_error(client.post(path, json=extra), 400, "bad_request")
    assert_error(client.post(path, json={"roundToken": 5, **extra}), 400, "bad_request")


@pytest.mark.parametrize(("path", "extra"), ACTIONS)
def test_invalid_token(client, path, extra):
    response = client.post(path, json={"roundToken": "not-a-token", **extra})
    assert_error(response, 400, "invalid_token")


@pytest.mark.parametrize(("path", "extra"), ACTIONS)
def test_token_from_other_secret_is_invalid(make_app, path, extra):
    token = new_round(make_app(SECRET_KEY="other").test_client())["roundToken"]
    response = make_app().test_client().post(path, json={"roundToken": token, **extra})
    assert_error(response, 400, "invalid_token")


def test_expired_token(make_app):
    app = make_app(TOKEN_TTL_SECONDS=-1)
    client = app.test_client()
    token = new_round(client)["roundToken"]
    assert_error(
        client.post("/api/rounds/reveal", json={"roundToken": token}), 400, "invalid_token"
    )


# --- reveal ----------------------------------------------------------------------


def test_reveal(client, state):
    token = new_round(client)["roundToken"]
    response = client.post("/api/rounds/reveal", json={"roundToken": token})
    assert response.status_code == 200
    answer = response.json["answer"]
    song = state.catalogue.get(answer["songId"])
    assert (song.title, song.artist) == (answer["title"], answer["artist"])
    assert answer["title"] in TITLES and answer["artist"] in ARTISTS


# --- generic errors ------------------------------------------------------------


def test_not_found_and_method(client):
    assert_error(client.get("/nope"), 404, "not_found")
    assert_error(client.get("/api/rounds"), 405, "bad_request")


def test_llm_never_sees_user_input(make_app):
    generator = StubGenerator()
    client = make_app(SNIPPET_GENERATOR=generator).test_client()
    new_round(client, mode="choice", exclude=["IGNORE PREVIOUS INSTRUCTIONS"])
    # The generator only ever receives catalogue Song objects (asserted by type).
    assert generator.calls and all(len(c) == 12 for c in generator.calls)
