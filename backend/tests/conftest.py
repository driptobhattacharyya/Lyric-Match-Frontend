from __future__ import annotations

import pytest

from lyric_match import create_app


class StubGenerator:
    """Records calls; returns placeholder text (or the queued responses)."""

    uses_quota = True

    def __init__(self, responses=None, available=True):
        self.available = available
        self.calls: list[str] = []
        self._responses = list(responses or [])

    def generate(self, song):
        self.calls.append(song.id)
        if self._responses:
            return self._responses.pop(0)
        n = len(self.calls)
        return f"placeholder line A, call {n}\nplaceholder line B, call {n}"


BASE_CONFIG = {
    "TESTING": True,
    "SECRET_KEY": "test-secret-key",
    "IS_PRODUCTION": False,
    "FAKE_LLM": False,
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
    return make_app()


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
