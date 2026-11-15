"""Settings from environment variables (with overrides for tests)."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

BACKEND_DIR = Path(__file__).resolve().parent.parent

DEFAULT_GEMINI_MODEL = "gemini-3.8-flash"
DEFAULT_ALLOWED_ORIGINS = "http://localhost:5173"
DEFAULT_SNIPPET_CACHE_PATH = BACKEND_DIR / "data" / "snippets.json"


def _bool(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    if value is None or value.strip() == "":
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _int(name: str, default: int) -> int:
    value = os.environ.get(name, "").strip()
    if not value:
        return default
    try:
        return int(value)
    except ValueError:
        raise RuntimeError(f"{name} must be an integer") from None


def _float(name: str, default: float) -> float:
    value = os.environ.get(name, "").strip()
    if not value:
        return default
    try:
        return float(value)
    except ValueError:
        raise RuntimeError(f"{name} must be a number") from None


def load_settings(overrides: dict[str, Any] | None = None) -> dict[str, Any]:
    env = os.environ.get
    settings: dict[str, Any] = {
        "SECRET_KEY": env("SECRET_KEY") or None,
        "IS_PRODUCTION": bool(env("RENDER")) or env("APP_ENV", "").lower() == "production",
        "GEMINI_API_KEY": env("GEMINI_API_KEY") or None,
        "GEMINI_MODEL": env("GEMINI_MODEL") or DEFAULT_GEMINI_MODEL,
        "GEMINI_TIMEOUT_SECONDS": _float("GEMINI_TIMEOUT_SECONDS", 12.0),
        "FAKE_LLM": _bool("FAKE_LLM", False),
        "ALLOWED_ORIGINS": [
            o.strip().rstrip("/")
            for o in (env("ALLOWED_ORIGINS") or DEFAULT_ALLOWED_ORIGINS).split(",")
            if o.strip()
        ],
        "MAX_LLM_CALLS_PER_DAY": _int("MAX_LLM_CALLS_PER_DAY", 200),
        "SNIPPET_CACHE_PATH": env("SNIPPET_CACHE_PATH") or str(DEFAULT_SNIPPET_CACHE_PATH),
        "CACHE_HIT_PROBABILITY": _float("CACHE_HIT_PROBABILITY", 0.85),
        "MAX_VARIANTS_PER_SONG": 3,
        "TOKEN_TTL_SECONDS": 15 * 60,
        "RATELIMIT_ENABLED": _bool("RATELIMIT_ENABLED", True),
        "RATE_LIMIT_ROUNDS": env("RATE_LIMIT_ROUNDS") or "20 per minute;300 per day",
        "RATE_LIMIT_ACTIONS": env("RATE_LIMIT_ACTIONS") or "60 per minute",
        "MAX_CONTENT_LENGTH": 8 * 1024,
        # Tests may inject a generator object here instead of Gemini/Fake.
        "SNIPPET_GENERATOR": None,
    }
    settings.update(overrides or {})
    return settings
