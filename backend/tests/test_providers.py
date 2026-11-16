"""LLM provider chain, Hindi script rules and the OpenAI adapter (SDK mocked)."""

import json

import pytest
from conftest import StubGenerator, assert_error, new_round

from lyric_match.llm import (
    FakeGenerator,
    GeminiGenerator,
    OpenAIGenerator,
    build_prompt,
    clean_snippet,
)
from lyric_match.songs import Song

DEVANAGARI = "तुम ही हो\nअब तुम"
EN_SONG = Song("abc", "Paper Lanterns", "The Imaginary Band", 2014, "en", "en-alpha")
HI_SONG = Song("def", "Chaand Ki Raat", "Kalpit Gayak", 1995, "hi", "hi-one", "Kalpana Nagar")


def test_clean_snippet_rejects_devanagari_and_other_scripts():
    assert clean_snippet("placeholder romanised line\nanother line") is not None
    assert clean_snippet("café naïve line") is not None
    assert clean_snippet(DEVANAGARI) is None
    assert clean_snippet("mixed line तुम\nline two") is None
    assert clean_snippet("مرحبا line") is None


def test_prompt_asks_for_romanised_hindi_and_includes_film():
    prompt = build_prompt(HI_SONG)
    assert "romanised Hindi" in prompt and "Never use Devanagari" in prompt
    assert '"Chaand Ki Raat" by Kalpit Gayak from the film "Kalpana Nagar"' in prompt
    en = build_prompt(EN_SONG)
    assert "Devanagari" not in en and "film" not in en
    assert '"Paper Lanterns" by The Imaginary Band.' in en


# --- chain ----------------------------------------------------------------------


def _client(make_app, generators, **config):
    app = make_app(SNIPPET_GENERATOR=generators, **config)
    return app, app.test_client()


@pytest.mark.parametrize(
    "failure", [None, "", DEVANAGARI, RuntimeError("quota exceeded: 429 RESOURCE_EXHAUSTED")]
)
def test_openai_used_when_gemini_fails(make_app, failure):
    gemini = StubGenerator(responses=[failure], name="gemini")
    openai = StubGenerator(responses=["placeholder from openai\nsecond line"], name="openai")
    app, client = _client(make_app, [gemini, openai])
    body = new_round(client)
    assert body["lyrics"] == "placeholder from openai\nsecond line"
    assert gemini.calls == openai.calls  # same song
    # Both calls count against the shared daily budget.
    assert app.extensions["lyric_match"].snippets.budget.remaining() == 198


def test_gemini_success_skips_openai(make_app):
    gemini = StubGenerator(name="gemini")
    openai = StubGenerator(name="openai")
    _, client = _client(make_app, [gemini, openai])
    new_round(client)
    assert len(gemini.calls) == 1 and openai.calls == []


def test_both_fail_moves_to_next_song_then_503(make_app):
    gemini = StubGenerator(responses=[None] * 3, name="gemini")
    openai = StubGenerator(responses=[DEVANAGARI] * 3, name="openai")
    _, client = _client(make_app, [gemini, openai])
    assert_error(client.post("/api/rounds", json={}), 503, "llm_unavailable")
    assert len(set(gemini.calls)) == 3 and gemini.calls == openai.calls


def test_only_openai_configured(make_app):
    openai = StubGenerator(name="openai")
    _, client = _client(make_app, [GeminiGenerator(None, "m", 5), openai])
    new_round(client)
    assert len(openai.calls) == 1


def test_budget_counts_across_providers(make_app):
    gemini = StubGenerator(responses=[None] * 10, name="gemini")
    openai = StubGenerator(name="openai")
    app, client = _client(make_app, [gemini, openai], MAX_LLM_CALLS_PER_DAY=3)
    new_round(client)  # gemini fails, openai succeeds: 2 calls
    assert app.extensions["lyric_match"].snippets.budget.remaining() == 1
    # Gemini's third call fails and the budget is gone: OpenAI is not tried.
    response = client.post("/api/rounds", json={"exclude": [gemini.calls[0]]})
    assert_error(response, 503, "llm_unavailable")
    assert len(gemini.calls) == 2 and len(openai.calls) == 1
    # The cached song can still be served.
    assert new_round(client)["lyrics"].startswith("placeholder line A")


def test_fake_llm_ignores_keys(make_app):
    app = make_app(SNIPPET_GENERATOR=None, FAKE_LLM=True, GEMINI_API_KEY="k", OPENAI_API_KEY="k")
    gens = app.extensions["lyric_match"].snippets.generators
    assert len(gens) == 1 and isinstance(gens[0], FakeGenerator)


def test_default_chain_order(make_app):
    app = make_app(SNIPPET_GENERATOR=None, GEMINI_API_KEY="g", OPENAI_API_KEY="o")
    gens = app.extensions["lyric_match"].snippets.generators
    assert [type(g) for g in gens] == [GeminiGenerator, OpenAIGenerator]
    assert all(g.available for g in gens)


def test_keys_never_logged(make_app, caplog):
    make_app(
        SNIPPET_GENERATOR=None,
        GEMINI_API_KEY="gem-SECRET-1",
        OPENAI_API_KEY="sk-SECRET-2",
        SUPABASE_URL="https://db.example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY="sb_secret_SECRET-3",
    )
    assert "SECRET" not in caplog.text


# --- OpenAI adapter --------------------------------------------------------------


class _FakeResponses:
    def __init__(self, outputs):
        self.outputs = list(outputs)
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        out = self.outputs.pop(0)
        if isinstance(out, Exception):
            raise out
        return type("Resp", (), {"output_text": out})()


def _openai_with(outputs, effort="low"):
    gen = OpenAIGenerator("sk-dummy", "gpt-test-mini", 7, reasoning_effort=effort)
    responses = _FakeResponses(outputs)
    gen._client = type("Client", (), {"responses": responses})()
    return gen, responses


def test_openai_structured_output_request():
    gen, responses = _openai_with([json.dumps({"lyrics": "placeholder one\nplaceholder two"})])
    assert gen.generate(HI_SONG) == "placeholder one\nplaceholder two"
    call = responses.calls[0]
    assert call["model"] == "gpt-test-mini"
    assert call["store"] is False
    fmt = call["text"]["format"]
    assert fmt["type"] == "json_schema" and fmt["strict"] is True
    assert fmt["schema"]["required"] == ["lyrics"]
    assert fmt["schema"]["additionalProperties"] is False
    assert call["reasoning"] == {"effort": "low"}
    assert "romanised Hindi" in call["input"]


def test_openai_without_reasoning_effort():
    gen, responses = _openai_with([json.dumps({"lyrics": "a line\nb line"})], effort=None)
    gen.generate(EN_SONG)
    assert "reasoning" not in responses.calls[0]


def test_openai_handles_bad_output_and_errors(caplog):
    gen, _ = _openai_with(
        [
            None,
            "not json",
            json.dumps({"lyrics": ""}),
            json.dumps({"lyrics": DEVANAGARI}),
            json.dumps(["list"]),
            RuntimeError("boom sk-dummy"),
        ]
    )
    for _ in range(6):
        assert gen.generate(EN_SONG) is None
    assert "sk-dummy" not in caplog.text


def test_openai_client_built_with_timeout():
    gen = OpenAIGenerator("sk-dummy", "m", 7)
    client = gen._get_client()
    assert client.timeout == 7 and client.max_retries == 1
    assert not OpenAIGenerator(None, "m", 7).available
    assert OpenAIGenerator(None, "m", 7).generate(EN_SONG) is None
