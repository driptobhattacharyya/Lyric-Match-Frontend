from conftest import StubGenerator, new_round

ORIGIN = "https://lyricmatch.example.com"


# --- CORS ----------------------------------------------------------------------


def test_cors_allowed_origin(client):
    response = client.post("/api/rounds", json={}, headers={"Origin": ORIGIN})
    assert response.headers.get("Access-Control-Allow-Origin") == ORIGIN


def test_cors_preflight(client):
    response = client.options(
        "/api/rounds/check",
        headers={
            "Origin": ORIGIN,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Content-Type",
        },
    )
    assert response.headers.get("Access-Control-Allow-Origin") == ORIGIN
    methods = response.headers.get("Access-Control-Allow-Methods", "")
    assert "POST" in methods and "DELETE" not in methods


def test_cors_denied_origin(client):
    response = client.post("/api/rounds", json={}, headers={"Origin": "https://evil.example"})
    assert "Access-Control-Allow-Origin" not in response.headers
    preflight = client.options(
        "/api/rounds",
        headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"},
    )
    assert "Access-Control-Allow-Origin" not in preflight.headers


# --- rate limiting -------------------------------------------------------------


def test_rate_limit_returns_envelope(make_app):
    app = make_app(RATELIMIT_ENABLED=True, RATE_LIMIT_ROUNDS="3 per minute")
    client = app.test_client()
    for _ in range(3):
        new_round(client)
    response = client.post("/api/rounds", json={})
    assert response.status_code == 429
    assert response.json["error"]["code"] == "rate_limited"
    assert "Retry-After" in response.headers
    # Health check is never limited.
    assert client.get("/healthz").status_code == 200


def test_rate_limit_is_per_client_ip_behind_proxy(make_app):
    app = make_app(RATELIMIT_ENABLED=True, RATE_LIMIT_ROUNDS="1 per minute")
    client = app.test_client()
    a = {"X-Forwarded-For": "203.0.113.1"}
    b = {"X-Forwarded-For": "203.0.113.2"}
    assert client.post("/api/rounds", json={}, headers=a).status_code == 200
    assert client.post("/api/rounds", json={}, headers=a).status_code == 429
    assert client.post("/api/rounds", json={}, headers=b).status_code == 200


def test_action_rate_limit_shared(make_app):
    app = make_app(RATELIMIT_ENABLED=True, RATE_LIMIT_ACTIONS="2 per minute")
    client = app.test_client()
    token = new_round(client)["roundToken"]
    assert client.post("/api/rounds/reveal", json={"roundToken": token}).status_code == 200
    assert (
        client.post("/api/rounds/check", json={"roundToken": token, "guess": "x"}).status_code
        == 200
    )
    response = client.post("/api/rounds/hint", json={"roundToken": token, "kind": "artist"})
    assert response.status_code == 429
    assert response.json["error"]["code"] == "rate_limited"


# --- LLM budget and fallbacks ---------------------------------------------------


def test_budget_exhaustion_serves_cache_then_503(make_app):
    generator = StubGenerator()
    app = make_app(SNIPPET_GENERATOR=generator, MAX_LLM_CALLS_PER_DAY=2)
    client = app.test_client()
    state = app.extensions["lyric_match"]
    new_round(client)
    new_round(client)
    assert len(generator.calls) == 2
    cached_ids = set(generator.calls)
    for _ in range(10):
        body = new_round(client)
        song_id = client.post("/api/rounds/reveal", json={"roundToken": body["roundToken"]}).json[
            "answer"
        ]["songId"]
        assert song_id in cached_ids
    assert len(generator.calls) == 2
    assert state.snippets.budget.remaining() == 0

    empty = make_app(SNIPPET_GENERATOR=StubGenerator(), MAX_LLM_CALLS_PER_DAY=0).test_client()
    response = empty.post("/api/rounds", json={})
    assert response.status_code == 503
    assert response.json["error"]["code"] == "llm_unavailable"


def test_none_response_falls_back_to_another_song(make_app):
    generator = StubGenerator(responses=[None, None, "placeholder text one\nplaceholder text two"])
    client = make_app(SNIPPET_GENERATOR=generator).test_client()
    body = new_round(client)
    assert body["lyrics"] == "placeholder text one\nplaceholder text two"
    assert len(generator.calls) == 3
    assert len(set(generator.calls)) == 3  # three different songs tried


def test_three_failures_give_503(make_app):
    generator = StubGenerator(responses=[None] * 10)
    client = make_app(SNIPPET_GENERATOR=generator).test_client()
    response = client.post("/api/rounds", json={})
    assert response.status_code == 503
    assert response.json == {
        "error": {
            "code": "llm_unavailable",
            "message": "Couldn't get lyrics right now. Please try again later.",
        }
    }
    assert len(generator.calls) == 3


def test_cache_is_preferred_once_populated(make_app):
    generator = StubGenerator()
    app = make_app(SNIPPET_GENERATOR=generator, CACHE_HIT_PROBABILITY=1.0)
    client = app.test_client()
    ids = [s.id for s in app.extensions["lyric_match"].catalogue.songs]
    only = [i for i in ids if i != ids[0]]
    for _ in range(5):
        new_round(client, exclude=only)
    assert len(generator.calls) == 1


def test_disk_cache_loaded_and_used_without_key(make_app, tmp_path):
    from lyric_match.llm import GeminiGenerator
    from lyric_match.snippets import save_cache_file

    path = tmp_path / "snippets.json"
    save_cache_file(path, {"Hello|Adele": ["placeholder cached line 1\nplaceholder cached line 2"]})
    app = make_app(SNIPPET_GENERATOR=GeminiGenerator(None, "m", 5), SNIPPET_CACHE_PATH=str(path))
    client = app.test_client()
    body = new_round(client)
    assert body["lyrics"].startswith("placeholder cached line 1")
    answer = client.post("/api/rounds/reveal", json={"roundToken": body["roundToken"]}).json
    assert answer["answer"]["title"] == "Hello"


def test_fake_llm_mode(make_app):
    client = make_app(SNIPPET_GENERATOR=None, FAKE_LLM=True).test_client()
    body = new_round(client)
    song_id = client.post("/api/rounds/reveal", json={"roundToken": body["roundToken"]}).json[
        "answer"
    ]["songId"]
    assert body["lyrics"].startswith(f"♪ placeholder lyric line 1 for {song_id}")


def test_budget_resets_by_utc_date():
    from datetime import date

    from lyric_match.snippets import DailyBudget

    today = [date(2026, 1, 1)]
    budget = DailyBudget(1, today=lambda: today[0])
    assert budget.try_consume()
    assert not budget.try_consume()
    today[0] = date(2026, 1, 2)
    assert budget.try_consume()


# --- Gemini adapter (SDK mocked) ------------------------------------------------


class _FakeModels:
    def __init__(self, texts):
        self.texts = list(texts)
        self.prompts = []

    def generate_content(self, model, contents, config):
        self.prompts.append(contents)
        assert config.response_mime_type == "application/json"
        text = self.texts.pop(0)
        if isinstance(text, Exception):
            raise text
        return type("Resp", (), {"text": text})()


def _gemini_with(texts):
    from lyric_match.llm import GeminiGenerator

    gen = GeminiGenerator("dummy-key", "model-x", 5)
    models = _FakeModels(texts)
    gen._client = type("Client", (), {"models": models})()
    return gen, models


def test_gemini_parses_json_and_handles_none_and_errors(app):
    song = app.extensions["lyric_match"].catalogue.songs[0]
    gen, models = _gemini_with(
        [
            '{"lyrics": "placeholder one\\nplaceholder two\\n\\n"}',
            None,
            "not json",
            '{"lyrics": ""}',
            RuntimeError("boom with secret details"),
        ]
    )
    assert gen.generate(song) == "placeholder one\nplaceholder two"
    assert gen.generate(song) is None
    assert gen.generate(song) is None
    assert gen.generate(song) is None
    assert gen.generate(song) is None
    assert song.title in models.prompts[0]


def test_llm_exception_text_never_reaches_client(make_app):
    gen, _ = _gemini_with([RuntimeError("SECRET-DETAIL")] * 3)
    client = make_app(SNIPPET_GENERATOR=gen).test_client()
    response = client.post("/api/rounds", json={})
    assert response.status_code == 503
    assert b"SECRET-DETAIL" not in response.data


def test_production_requires_secret_key(make_app):
    import pytest

    with pytest.raises(RuntimeError):
        make_app(SECRET_KEY=None, IS_PRODUCTION=True)
    assert make_app(SECRET_KEY=None).test_client().get("/healthz").status_code == 200
