from __future__ import annotations

from pathlib import Path

import pytest

from lyric_match import create_app

FIXTURE_CATALOG = Path(__file__).parent / "fixtures" / "catalog"


class StubGenerator:
    """Records calls; returns placeholder text (or the queued responses)."""

    uses_quota = True

    def __init__(self, responses=None, available=True, name="stub"):
        self.available = available
        self.name = name
        self.calls: list[str] = []
        self.songs = []
        self._responses = list(responses or [])

    def generate(self, song):
        self.calls.append(song.id)
        self.songs.append(song)
        if self._responses:
            response = self._responses.pop(0)
            if isinstance(response, Exception):
                raise response
            return response
        n = len(self.calls)
        return f"placeholder line A, call {n}\nplaceholder line B, call {n}"


BASE_CONFIG = {
    "TESTING": True,
    "SECRET_KEY": "test-secret-key",
    "IS_PRODUCTION": False,
    "FAKE_LLM": False,
    "FAKE_DB": False,
    "GEMINI_API_KEY": None,
    "OPENAI_API_KEY": None,
    "SUPABASE_URL": None,
    "SUPABASE_SERVICE_ROLE_KEY": None,
    "CATALOG_DIR": str(FIXTURE_CATALOG),
    "ALLOWED_ORIGINS": ["https://lyricmatch.example.com"],
    "RATELIMIT_ENABLED": False,
    "SNIPPET_CACHE_PATH": None,
    "MAX_LLM_CALLS_PER_DAY": 200,
}


@pytest.fixture
def make_app():
    def _make(**overrides):
        config = {**BASE_CONFIG, "SNIPPET_GENERATOR": StubGenerator(), **overrides}
        return create_app(config)

    return _make


@pytest.fixture
def app(make_app):
    return make_app(FAKE_DB=True)


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def state(app):
    return app.extensions["lyric_match"]


def new_round(client, **body):
    response = client.post("/api/rounds", json=body)
    assert response.status_code == 200, response.json
    return response.json


def reveal(client, token):
    response = client.post("/api/rounds/reveal", json={"roundToken": token})
    assert response.status_code == 200, response.json
    return response.json


def assert_error(response, status, code):
    assert response.status_code == status, response.json
    assert set(response.json) == {"error"}
    assert response.json["error"]["code"] == code
    assert isinstance(response.json["error"]["message"], str)
