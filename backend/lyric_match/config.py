"""Settings from environment variables (with overrides for tests)."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

BACKEND_DIR = Path(__file__).resolve().parent.parent

DEFAULT_GEMINI_MODEL = "gemini-3.8-flash"
DEFAULT_OPENAI_MODEL = "gpt-5.4-mini"
DEFAULT_ALLOWED_ORIGINS = "http://localhost:5173"
DEFAULT_SNIPPET_CACHE_PATH = BACKEND_DIR / "data" / "snippets.json"
DEFAULT_CATALOG_DIR = BACKEND_DIR / "lyric_match" / "catalog"


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
        "OPENAI_API_KEY": env("OPENAI_API_KEY") or None,
        "OPENAI_MODEL": env("OPENAI_MODEL") or DEFAULT_OPENAI_MODEL,
        "OPENAI_TIMEOUT_SECONDS": _float("OPENAI_TIMEOUT_SECONDS", 12.0),
        # "low" suits reasoning models (GPT-5 family); set empty for models without reasoning.
        "OPENAI_REASONING_EFFORT": env("OPENAI_REASONING_EFFORT", "low").strip() or None,
        "FAKE_LLM": _bool("FAKE_LLM", False),
        "SUPABASE_URL": (env("SUPABASE_URL") or "").strip() or None,
        "SUPABASE_SERVICE_ROLE_KEY": env("SUPABASE_SERVICE_ROLE_KEY") or None,
        "SUPABASE_TIMEOUT_SECONDS": _float("SUPABASE_TIMEOUT_SECONDS", 3.0),
        # 1 = in-memory leaderboard, no Supabase (local e2e). Snippets stay in memory.
        "FAKE_DB": _bool("FAKE_DB", False),
        "CATALOG_DIR": env("CATALOG_DIR") or str(DEFAULT_CATALOG_DIR),
        "ROUNDS_PER_GAME": 8,
        "ROUND_SECONDS": {"type": 45, "choice": 20},
        "RECEIPT_MAX_AGE_SECONDS": 60 * 60,
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
        "RATE_LIMIT_SCORES": env("RATE_LIMIT_SCORES") or "6 per minute;60 per day",
        "RATE_LIMIT_READS": env("RATE_LIMIT_READS") or "60 per minute",
        "MAX_CONTENT_LENGTH": 16 * 1024,
        # Test hooks: a generator (or list of them) instead of Gemini/OpenAI/Fake,
        # an httpx2 transport for PostgREST, and ready-made stores.
        "SNIPPET_GENERATOR": None,
        "SUPABASE_TRANSPORT": None,
        "LEADERBOARD_STORE": None,
        "SNIPPET_STORE": None,
    }
    settings.update(overrides or {})
    return settings
