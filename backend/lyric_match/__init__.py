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
from .llm import FakeGenerator, GeminiGenerator
from .snippets import DailyBudget, SnippetCache, SnippetService, load_cache_file
from .songs import Catalogue
from .state import AppState
from .tokens import TokenCodec

log = logging.getLogger("lyric_match")


def _configure_logging() -> None:
    root = logging.getLogger()
    if not root.handlers:
        logging.basicConfig(
            level=logging.INFO,
            format="%(asctime)s level=%(levelname)s logger=%(name)s %(message)s",
        )


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


def _build_snippets(settings: dict[str, Any]) -> SnippetService:
    generator = settings["SNIPPET_GENERATOR"]
    initial: dict[str, list[str]] = {}
    if generator is None and settings["FAKE_LLM"]:
        log.warning("FAKE_LLM is on: serving placeholder lyrics, Gemini is not called")
        generator = FakeGenerator()
    elif generator is None:
        generator = GeminiGenerator(
            api_key=settings["GEMINI_API_KEY"],
            model=settings["GEMINI_MODEL"],
            timeout_seconds=settings["GEMINI_TIMEOUT_SECONDS"],
        )
        if not generator.available:
            log.warning("GEMINI_API_KEY not set: rounds will be served from cache only")
    if not settings["FAKE_LLM"]:
        initial = load_cache_file(settings["SNIPPET_CACHE_PATH"])
    return SnippetService(
        generator=generator,
        cache=SnippetCache(settings["MAX_VARIANTS_PER_SONG"], initial),
        budget=DailyBudget(settings["MAX_LLM_CALLS_PER_DAY"]),
        cache_hit_probability=settings["CACHE_HIT_PROBABILITY"],
    )


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

    app.extensions["lyric_match"] = AppState(
        catalogue=Catalogue(derive_key(secret, "song-id")),
        tokens=TokenCodec(derive_key(secret, "round-token"), settings["TOKEN_TTL_SECONDS"]),
        snippets=_build_snippets(settings),
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
        "app_ready model=%s fake_llm=%s origins=%s daily_budget=%s",
        settings["GEMINI_MODEL"],
        settings["FAKE_LLM"],
        ",".join(settings["ALLOWED_ORIGINS"]),
        settings["MAX_LLM_CALLS_PER_DAY"],
    )
    return app
