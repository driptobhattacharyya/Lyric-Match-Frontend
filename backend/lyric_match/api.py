"""HTTP routes. The answer never leaves the server before the round ends."""

from __future__ import annotations

import logging
import random
from typing import Any

from flask import Blueprint, current_app, jsonify, request
from flask_limiter import Limiter

from .errors import bad_request, invalid_token, llm_unavailable
from .hints import letters_hint, title_mask
from .matching import is_correct
from .state import AppState
from .tokens import InvalidToken, RoundClaims

log = logging.getLogger(__name__)

MODES = ("type", "choice")
MAX_EXCLUDE = 50
MAX_GUESS_LENGTH = 200
CHOICE_COUNT = 4

_rng = random.SystemRandom()


def _state() -> AppState:
    return current_app.extensions["lyric_match"]


def _json_body(optional: bool = False) -> dict[str, Any]:
    if optional and not request.get_data():
        return {}
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        raise bad_request("Request body must be a JSON object.")
    return body


def _claims(body: dict[str, Any]) -> RoundClaims:
    token = body.get("roundToken")
    if not isinstance(token, str) or not token:
        raise bad_request("roundToken is required.")
    try:
        return _state().tokens.decode(token)
    except InvalidToken:
        raise invalid_token() from None


def _answer(claims: RoundClaims) -> dict[str, str]:
    return {"songId": claims.song_id, "title": claims.title, "artist": claims.artist}


def create_blueprint(limiter: Limiter) -> Blueprint:
    bp = Blueprint("api", __name__)
    rounds_limit = limiter.limit(lambda: current_app.config["RATE_LIMIT_ROUNDS"])
    actions_limit = limiter.shared_limit(
        lambda: current_app.config["RATE_LIMIT_ACTIONS"], scope="round-actions"
    )

    @bp.get("/healthz")
    @limiter.exempt
    def healthz():
        return jsonify({"status": "ok"})

    @bp.post("/api/rounds")
    @rounds_limit
    def create_round():
        body = _json_body(optional=True)
        mode = body.get("mode", "type")
        if mode not in MODES:
            raise bad_request('mode must be "type" or "choice".')
        exclude = body.get("exclude", [])
        if (
            not isinstance(exclude, list)
            or len(exclude) > MAX_EXCLUDE
            or not all(isinstance(x, str) and len(x) <= 64 for x in exclude)
        ):
            raise bad_request(f"exclude must be a list of at most {MAX_EXCLUDE} song ids.")

        state = _state()
        picked = state.snippets.pick_round(state.catalogue.eligible(exclude), state.catalogue.songs)
        if picked is None:
            log.warning("round_unavailable")
            raise llm_unavailable()
        song, lyrics = picked

        options = None
        if mode == "choice":
            others = [s.title for s in state.catalogue.songs if s.id != song.id]
            options = _rng.sample(others, CHOICE_COUNT - 1) + [song.title]
            _rng.shuffle(options)

        token = state.tokens.encode(RoundClaims(song.id, song.title, song.artist, mode))
        log.info("round_created song_id=%s mode=%s", song.id, mode)
        return jsonify(
            {
                "roundToken": token,
                "lyrics": lyrics,
                "mode": mode,
                "titleLength": len(song.title),
                "titleMask": title_mask(song.title),
                "options": options,
            }
        )

    @bp.post("/api/rounds/hint")
    @actions_limit
    def hint():
        body = _json_body()
        claims = _claims(body)
        kind = body.get("kind")
        if kind == "artist":
            return jsonify({"kind": "artist", "artist": claims.artist})
        if kind != "letters":
            raise bad_request('kind must be "letters" or "artist".')
        level = body.get("level", 1)
        if isinstance(level, bool) or not isinstance(level, int) or not 1 <= level <= 3:
            raise bad_request("level must be 1, 2 or 3.")
        mask = letters_hint(claims.title, body["roundToken"], level)
        return jsonify({"kind": "letters", "titleMask": mask})

    @bp.post("/api/rounds/check")
    @actions_limit
    def check():
        body = _json_body()
        claims = _claims(body)
        guess = body.get("guess")
        if not isinstance(guess, str) or not guess.strip() or len(guess) > MAX_GUESS_LENGTH:
            raise bad_request(f"guess must be 1-{MAX_GUESS_LENGTH} characters.")
        correct = is_correct(guess, claims.title)
        return jsonify({"correct": correct, "answer": _answer(claims) if correct else None})

    @bp.post("/api/rounds/reveal")
    @actions_limit
    def reveal():
        claims = _claims(_json_body())
        return jsonify({"answer": _answer(claims)})

    return bp
