"""Lyric Match API: guess the song from a short lyric snippet."""

from __future__ import annotations

import logging
import secrets
from typing import Any

from dotenv import load_dotenv
from flask import Flask
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from werkzeug.middleware.proxy_fix import ProxyFix

from .api import create_blueprint
from .config import load_settings
from .errors import register_error_handlers
from .keys import derive_key
from .leaderboard import MemoryLeaderboard
from .llm import FakeGenerator, GeminiGenerator, OpenAIGenerator
from .snippets import DailyBudget, SnippetCache, SnippetService, load_cache_file
from .songs import Catalogue
from .state import AppState, RevealedRounds
from .supabase import PostgrestClient, SupabaseLeaderboard, SupabaseSnippetStore
from .tokens import ReceiptCodec, TokenCodec

log = logging.getLogger("lyric_match")


def _configure_logging() -> None:
    root = logging.getLogger()
    if not root.handlers:
        logging.basicConfig(
            level=logging.INFO,
            format="%(asctime)s level=%(levelname)s logger=%(name)s %(message)s",
        )
    # Per-request INFO lines from HTTP clients are noise (and include URLs).
    for name in ("httpx2", "httpx", "httpcore2", "httpcore", "openai", "google_genai"):
        logging.getLogger(name).setLevel(logging.WARNING)


def _secret_key(settings: dict[str, Any]) -> str:
    if settings["SECRET_KEY"]:
        return settings["SECRET_KEY"]
    if settings["IS_PRODUCTION"]:
        raise RuntimeError("SECRET_KEY must be set in production")
    log.warning(
        "SECRET_KEY not set; using a random per-process key. Round tokens and "
        "song ids will change on restart. Set SECRET_KEY outside local dev."
    )
    return secrets.token_urlsafe(32)


def _build_generators(settings: dict[str, Any]) -> list:
    injected = settings["SNIPPET_GENERATOR"]
    if injected is not None:
        return list(injected) if isinstance(injected, (list, tuple)) else [injected]
    if settings["FAKE_LLM"]:
        log.warning("FAKE_LLM is on: serving placeholder lyrics, no LLM is called")
        return [FakeGenerator()]
    generators = [
        GeminiGenerator(
            api_key=settings["GEMINI_API_KEY"],
            model=settings["GEMINI_MODEL"],
            timeout_seconds=settings["GEMINI_TIMEOUT_SECONDS"],
        ),
        OpenAIGenerator(
            api_key=settings["OPENAI_API_KEY"],
            model=settings["OPENAI_MODEL"],
            timeout_seconds=settings["OPENAI_TIMEOUT_SECONDS"],
            reasoning_effort=settings["OPENAI_REASONING_EFFORT"],
        ),
    ]
    if not any(g.available for g in generators):
        log.warning("No GEMINI_API_KEY or OPENAI_API_KEY: rounds will be served from cache only")
    return generators


def _postgrest(settings: dict[str, Any]) -> PostgrestClient | None:
    if settings["FAKE_DB"]:
        return None
    url, key = settings["SUPABASE_URL"], settings["SUPABASE_SERVICE_ROLE_KEY"]
    if not url or not key:
        return None
    return PostgrestClient(
        url,
        key,
        timeout_seconds=settings["SUPABASE_TIMEOUT_SECONDS"],
        transport=settings["SUPABASE_TRANSPORT"],
    )


def _build_snippets(settings: dict[str, Any], db: PostgrestClient | None) -> SnippetService:
    generators = _build_generators(settings)
    initial: dict[str, list[str]] = {}
    store = settings["SNIPPET_STORE"]
    if not settings["FAKE_LLM"]:
        initial = load_cache_file(settings["SNIPPET_CACHE_PATH"])
        if store is None and db is not None:
            store = SupabaseSnippetStore(db)
    return SnippetService(
        generators=generators,
        cache=SnippetCache(settings["MAX_VARIANTS_PER_SONG"], initial),
        budget=DailyBudget(settings["MAX_LLM_CALLS_PER_DAY"]),
        cache_hit_probability=settings["CACHE_HIT_PROBABILITY"],
        store=store,
    )


def _build_leaderboard(settings: dict[str, Any], db: PostgrestClient | None):
    if settings["LEADERBOARD_STORE"] is not None:
        return settings["LEADERBOARD_STORE"]
    if settings["FAKE_DB"]:
        log.warning("FAKE_DB is on: leaderboard is in memory and resets on restart")
        return MemoryLeaderboard()
    return SupabaseLeaderboard(db) if db is not None else None


def create_app(overrides: dict[str, Any] | None = None) -> Flask:
    load_dotenv()
    _configure_logging()
    settings = load_settings(overrides)

    app = Flask(__name__)
    app.config.update(settings)
    app.config["SECRET_KEY"] = secret = _secret_key(settings)
    app.config["RATELIMIT_STORAGE_URI"] = "memory://"
    app.config["RATELIMIT_HEADERS_ENABLED"] = True
    # Render terminates TLS at exactly one proxy in front of the app.
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1)

    db = _postgrest(settings)
    leaderboard = _build_leaderboard(settings, db)
    app.extensions["lyric_match"] = AppState(
        catalogue=Catalogue(derive_key(secret, "song-id"), settings["CATALOG_DIR"]),
        tokens=TokenCodec(derive_key(secret, "round-token"), settings["TOKEN_TTL_SECONDS"]),
        receipts=ReceiptCodec(
            derive_key(secret, "score-receipt"), settings["RECEIPT_MAX_AGE_SECONDS"]
        ),
        snippets=_build_snippets(settings, db),
        revealed=RevealedRounds(settings["TOKEN_TTL_SECONDS"]),
        leaderboard=leaderboard,
    )

    CORS(
        app,
        origins=settings["ALLOWED_ORIGINS"],
        methods=["GET", "POST"],
        allow_headers=["Content-Type"],
        max_age=600,
    )
    limiter = Limiter(get_remote_address, app=app)
    # Route decorators hold the limiter weakly; keep it alive with the app.
    app.extensions["lyric_match_limiter"] = limiter
    register_error_handlers(app)
    app.register_blueprint(create_blueprint(limiter))

    @app.after_request
    def _security_headers(response):
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Cache-Control", "no-store")
        return response

    log.info(
        "app_ready gemini=%s openai=%s fake_llm=%s database=%s leaderboard=%s origins=%s "
        "daily_budget=%s",
        settings["GEMINI_MODEL"] if settings["GEMINI_API_KEY"] else "off",
        settings["OPENAI_MODEL"] if settings["OPENAI_API_KEY"] else "off",
        settings["FAKE_LLM"],
        "supabase" if db is not None else "off",
        "memory" if settings["FAKE_DB"] else ("on" if leaderboard is not None else "off"),
        ",".join(settings["ALLOWED_ORIGINS"]),
        settings["MAX_LLM_CALLS_PER_DAY"],
    )
    return app
