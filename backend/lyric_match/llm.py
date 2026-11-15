"""Lyric snippet generators: Gemini for real use, a deterministic fake for dev/e2e.

Only catalogue data (title, artist) ever goes into a prompt, never user input.
"""

from __future__ import annotations

import json
import logging
import threading
from typing import Protocol

from .songs import Song

log = logging.getLogger(__name__)

MAX_SNIPPET_CHARS = 500
MAX_SNIPPET_LINES = 4

PROMPT_TEMPLATE = (
    'Quote 2 to 4 consecutive lines from the lyrics of the song "{title}" by {artist}. '
    "Pick a recognisable passage that a fan could identify the song from. "
    "If possible, choose lines that do not contain the song title itself. "
    'Respond with JSON of the form {{"lyrics": "<lines separated by \\n>"}}.'
)


class SnippetGenerator(Protocol):
    #: Whether calls spend real API quota (and so count against the daily budget).
    uses_quota: bool

    @property
    def available(self) -> bool: ...

    def generate(self, song: Song) -> str | None:
        """Return a snippet, or None if the model produced nothing usable."""


def clean_snippet(text: object) -> str | None:
    if not isinstance(text, str):
        return None
    lines = [line.strip() for line in text.strip().splitlines() if line.strip()]
    if not lines:
        return None
    snippet = "\n".join(lines[:MAX_SNIPPET_LINES])
    return snippet if len(snippet) <= MAX_SNIPPET_CHARS else None


class FakeGenerator:
    """Placeholder text only; never real lyrics. Enabled with FAKE_LLM=1."""

    uses_quota = False
    available = True

    def generate(self, song: Song) -> str | None:
        return "\n".join(f"♪ placeholder lyric line {n} for {song.id} ♪" for n in (1, 2))


class GeminiGenerator:
    uses_quota = True

    def __init__(self, api_key: str | None, model: str, timeout_seconds: float):
        self._api_key = api_key
        self._model = model
        self._timeout_ms = int(timeout_seconds * 1000)
        self._client = None
        self._lock = threading.Lock()

    @property
    def available(self) -> bool:
        return bool(self._api_key)

    def _get_client(self):
        # Imported and constructed lazily so the app boots without a key.
        with self._lock:
            if self._client is None:
                from google import genai
                from google.genai import types

                self._client = genai.Client(
                    api_key=self._api_key,
                    http_options=types.HttpOptions(timeout=self._timeout_ms),
                )
            return self._client

    def generate(self, song: Song) -> str | None:
        if not self.available:
            return None
        from google.genai import types

        config = types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=types.Schema(
                type=types.Type.OBJECT,
                properties={"lyrics": types.Schema(type=types.Type.STRING)},
                required=["lyrics"],
            ),
            temperature=0.9,
            # No tools are declared; make sure the SDK never loops on our quota.
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        )
        prompt = PROMPT_TEMPLATE.format(title=song.title, artist=song.artist)
        try:
            response = self._get_client().models.generate_content(
                model=self._model, contents=prompt, config=config
            )
            text = response.text
        except Exception as exc:  # network, quota, safety, SDK errors: all "no snippet"
            log.warning(
                "llm_call_failed song_id=%s error=%s status=%s",
                song.id,
                type(exc).__name__,
                getattr(exc, "code", None),
            )
            return None
        if text is None:
            log.warning("llm_empty_response song_id=%s", song.id)
            return None
        try:
            snippet = clean_snippet(json.loads(text).get("lyrics"))
        except (ValueError, AttributeError):
            snippet = None
        if snippet is None:
            log.warning("llm_unusable_response song_id=%s", song.id)
        return snippet
