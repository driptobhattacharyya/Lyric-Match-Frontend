"""Lyric snippet generators: Gemini (primary), OpenAI (fallback), and a
deterministic fake for dev/e2e.

Only catalogue data (title, artist, film) ever goes into a prompt, never user
input. Keys are never logged.
"""

from __future__ import annotations

import json
import logging
import threading
from typing import Protocol

from .latin import is_latin_text
from .songs import Song

log = logging.getLogger(__name__)

MAX_SNIPPET_CHARS = 500
MAX_SNIPPET_LINES = 4

PROMPT_TEMPLATE = (
    'Quote 2 to 4 consecutive lines from the lyrics of the song "{title}" by {artist}{film}. '
    "Pick a recognisable passage that a fan could identify the song from. "
    "If possible, choose lines that do not contain the song title itself. "
    "{script}"
    'Respond with JSON of the form {{"lyrics": "<lines separated by \\n>"}}.'
)
SCRIPT_INSTRUCTIONS = {
    "en": "Write the lines in Latin script. ",
    "hi": (
        "The song is in Hindi: write the lines in romanised Hindi (Latin script, the way "
        "Hindi lyrics are commonly typed in English letters). Never use Devanagari. "
    ),
}
SNIPPET_SCHEMA = {
    "type": "object",
    "properties": {"lyrics": {"type": "string"}},
    "required": ["lyrics"],
    "additionalProperties": False,
}


def build_prompt(song: Song) -> str:
    film = f' from the film "{song.film}"' if song.film else ""
    script = SCRIPT_INSTRUCTIONS.get(song.language, SCRIPT_INSTRUCTIONS["en"])
    return PROMPT_TEMPLATE.format(title=song.title, artist=song.artist, film=film, script=script)


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
    if len(snippet) > MAX_SNIPPET_CHARS or not is_latin_text(snippet):
        # Devanagari (or any non-Latin script) counts as a failed generation.
        return None
    return snippet


def parse_snippet_json(text: object) -> str | None:
    if not isinstance(text, str):
        return None
    try:
        data = json.loads(text)
    except ValueError:
        return None
    return clean_snippet(data.get("lyrics")) if isinstance(data, dict) else None


class FakeGenerator:
    """Placeholder text only; never real lyrics. Enabled with FAKE_LLM=1."""

    name = "fake"
    uses_quota = False
    available = True

    def generate(self, song: Song) -> str | None:
        return "\n".join(f"♪ placeholder lyric line {n} for {song.id} ♪" for n in (1, 2))


class GeminiGenerator:
    name = "gemini"
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
        prompt = build_prompt(song)
        try:
            response = self._get_client().models.generate_content(
                model=self._model, contents=prompt, config=config
            )
            text = response.text
        except Exception as exc:  # network, quota, safety, SDK errors: all "no snippet"
            log.warning(
                "llm_call_failed provider=gemini song_id=%s error=%s status=%s",
                song.id,
                type(exc).__name__,
                getattr(exc, "code", None),
            )
            return None
        if text is None:
            log.warning("llm_empty_response provider=gemini song_id=%s", song.id)
            return None
        snippet = parse_snippet_json(text)
        if snippet is None:
            log.warning("llm_unusable_response provider=gemini song_id=%s", song.id)
        return snippet


class OpenAIGenerator:
    """Fallback provider: OpenAI Responses API with JSON-schema structured output."""

    name = "openai"
    uses_quota = True

    def __init__(
        self,
        api_key: str | None,
        model: str,
        timeout_seconds: float,
        reasoning_effort: str | None = None,
    ):
        self._api_key = api_key
        self._model = model
        self._timeout = timeout_seconds
        self._reasoning_effort = reasoning_effort or None
        self._client = None
        self._lock = threading.Lock()

    @property
    def available(self) -> bool:
        return bool(self._api_key)

    def _get_client(self):
        with self._lock:
            if self._client is None:
                from openai import OpenAI

                self._client = OpenAI(
                    api_key=self._api_key, timeout=self._timeout, max_retries=1
                )
            return self._client

    def generate(self, song: Song) -> str | None:
        if not self.available:
            return None
        kwargs: dict = {
            "model": self._model,
            "input": build_prompt(song),
            "store": False,
            "max_output_tokens": 2000,
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": "lyric_snippet",
                    "strict": True,
                    "schema": SNIPPET_SCHEMA,
                }
            },
        }
        if self._reasoning_effort:
            kwargs["reasoning"] = {"effort": self._reasoning_effort}
        try:
            response = self._get_client().responses.create(**kwargs)
            text = getattr(response, "output_text", None)
        except Exception as exc:  # network, quota, refusal, SDK errors: all "no snippet"
            log.warning(
                "llm_call_failed provider=openai song_id=%s error=%s status=%s",
                song.id,
                type(exc).__name__,
                getattr(exc, "status_code", None),
            )
            return None
        snippet = parse_snippet_json(text)
        if snippet is None:
            log.warning("llm_unusable_response provider=openai song_id=%s", song.id)
        return snippet
