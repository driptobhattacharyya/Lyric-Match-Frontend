import json

from conftest import FIXTURE_CATALOG, StubGenerator
from fake_postgrest import FakePostgrest


def test_pregenerate_pack_limit_file_and_supabase(monkeypatch, tmp_path):
    import scripts.pregenerate as pre
    from lyric_match import supabase

    db = FakePostgrest()
    real_client = supabase.PostgrestClient
    monkeypatch.setattr(
        pre, "PostgrestClient", lambda *a, **k: real_client(*a, transport=db.transport)
    )
    gemini = StubGenerator(responses=[None] * 50, name="gemini")
    openai = StubGenerator(name="openai")
    monkeypatch.setattr(pre, "GeminiGenerator", lambda *a, **k: gemini)
    monkeypatch.setattr(pre, "OpenAIGenerator", lambda *a, **k: openai)
    monkeypatch.setattr(pre.time, "sleep", lambda s: None)
    for name, value in {
        "CATALOG_DIR": str(FIXTURE_CATALOG),
        "FAKE_LLM": "0",
        "SUPABASE_URL": "https://x.example.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "sb_secret_x",
    }.items():
        monkeypatch.setenv(name, value)
    out = tmp_path / "snippets.json"
    code = pre.main(["--pack", "hi-one", "--limit", "2", "--variants", "1", "--output", str(out)])
    assert code == 0
    assert len(openai.calls) == 2 and len(gemini.calls) == 2
    stored = json.loads(out.read_text())["snippets"]
    assert len(stored) == 2
    assert {r["provider"] for r in db.snippets} == {"openai"} and len(db.snippets) == 2
    assert pre.main(["--pack", "nope", "--output", str(out)]) == 2
