"""HTTP routes (contract: docs/api.md). The answer never leaves the server before
the round ends."""

from __future__ import annotations

import logging
import random
import secrets
import time
from datetime import UTC
from typing import Any

from flask import Blueprint, current_app, jsonify, request
from flask_limiter import Limiter

from .errors import (
    bad_request,
    duplicate_game,
    invalid_token,
    leaderboard_unavailable,
    llm_unavailable,
)
from .hints import letters_hint, title_mask
from .leaderboard import (
    PERIODS,
    DuplicateGame,
    LeaderboardUnavailable,
    ScoreEntry,
    clean_name,
    game_fingerprint,
    is_blocked_name,
    ranked,
    since_for,
)
from .matching import is_correct
from .scoring import game_score, round_points
from .state import AppState
from .tokens import InvalidToken, ReceiptClaims, RoundClaims

log = logging.getLogger(__name__)

MODES = ("type", "choice")
MAX_PACKS = 30
MAX_EXCLUDE = 200
MAX_ID_LENGTH = 64
MAX_GUESS_LENGTH = 200
CHOICE_COUNT = 4
MAX_LEADERBOARD_LIMIT = 50
DEFAULT_LEADERBOARD_LIMIT = 20

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
        claims = _state().tokens.decode(token)
    except InvalidToken:
        raise invalid_token() from None
    return claims


def _open_claims(body: dict[str, Any]) -> RoundClaims:
    """Claims for a round that may still be played (not yet revealed)."""
    claims = _claims(body)
    if claims.round_id in _state().revealed:
        raise invalid_token()
    return claims


def _answer(claims: RoundClaims) -> dict[str, Any]:
    return {
        "songId": claims.song_id,
        "title": claims.title,
        "artist": claims.artist,
        "year": claims.year,
        "film": claims.film,
    }


def _string_list(body: dict[str, Any], field: str, max_items: int) -> list[str]:
    value = body.get(field, [])
    if value is None:
        return []
    if (
        not isinstance(value, list)
        or len(value) > max_items
        or not all(isinstance(x, str) and 0 < len(x) <= MAX_ID_LENGTH for x in value)
    ):
        raise bad_request(f"{field} must be a list of at most {max_items} ids.")
    return value


def _receipt(claims: RoundClaims, correct: bool, points: int) -> str:
    return _state().receipts.encode(
        ReceiptClaims(claims.round_id, claims.mode, correct, points, claims.issued_at)
    )


def _require_leaderboard():
    board = _state().leaderboard
    if board is None:
        raise leaderboard_unavailable()
    return board


def create_blueprint(limiter: Limiter) -> Blueprint:
    bp = Blueprint("api", __name__)
    rounds_limit = limiter.limit(lambda: current_app.config["RATE_LIMIT_ROUNDS"])
    actions_limit = limiter.shared_limit(
        lambda: current_app.config["RATE_LIMIT_ACTIONS"], scope="round-actions"
    )
    scores_limit = limiter.limit(lambda: current_app.config["RATE_LIMIT_SCORES"])
    reads_limit = limiter.shared_limit(
        lambda: current_app.config["RATE_LIMIT_READS"], scope="reads"
    )

    @bp.get("/healthz")
    @limiter.exempt
    def healthz():
        return jsonify({"status": "ok"})

    @bp.get("/api/meta")
    @reads_limit
    def meta():
        state = _state()
        config = current_app.config
        return jsonify(
            {
                "languages": state.catalogue.meta(),
                "leaderboard": state.leaderboard is not None,
                "roundsPerGame": config["ROUNDS_PER_GAME"],
                "roundSeconds": dict(config["ROUND_SECONDS"]),
            }
        )

    @bp.post("/api/rounds")
    @rounds_limit
    def create_round():
        body = _json_body(optional=True)
        mode = body.get("mode", "type")
        if mode not in MODES:
            raise bad_request('mode must be "type" or "choice".')
        packs = _string_list(body, "packs", MAX_PACKS)
        exclude = _string_list(body, "exclude", MAX_EXCLUDE)

        state = _state()
        if any(state.catalogue.pack(pid) is None for pid in packs):
            raise bad_request("Unknown pack id.")
        pool = state.catalogue.eligible(exclude, packs)
        if not pool:
            if packs:
                raise bad_request("No songs are available in the selected packs yet.")
            log.warning("round_unavailable reason=empty_catalogue")
            raise llm_unavailable()
        picked = state.snippets.pick_round(pool)
        if picked is None:
            log.warning("round_unavailable")
            raise llm_unavailable()
        song, lyrics = picked

        options = None
        if mode == "choice":
            options = state.catalogue.distractor_titles(song, CHOICE_COUNT - 1, _rng) + [song.title]
            _rng.shuffle(options)

        time_limit = int(current_app.config["ROUND_SECONDS"][mode])
        claims = RoundClaims(
            round_id=secrets.token_urlsafe(12),
            song_id=song.id,
            title=song.title,
            artist=song.artist,
            mode=mode,
            issued_at=time.time(),
            time_limit=time_limit,
            year=song.year,
            film=song.film,
            language=song.language,
        )
        log.info("round_created song_id=%s mode=%s pack=%s", song.id, mode, song.pack_id)
        return jsonify(
            {
                "roundToken": state.tokens.encode(claims),
                "lyrics": lyrics,
                "mode": mode,
                "language": song.language,
                "packId": song.pack_id,
                "titleLength": len(song.title),
                "titleMask": title_mask(song.title),
                "options": options,
                "timeLimitSeconds": time_limit,
            }
        )

    @bp.post("/api/rounds/hint")
    @actions_limit
    def hint():
        body = _json_body()
        claims = _open_claims(body)
        tokens = _state().tokens
        kind = body.get("kind")
        if kind == "artist":
            new_token = tokens.encode(claims.with_hint("artist"))
            return jsonify({"kind": "artist", "artist": claims.artist, "roundToken": new_token})
        if kind != "letters":
            raise bad_request('kind must be "letters" or "artist".')
        level = body.get("level", 1)
        if isinstance(level, bool) or not isinstance(level, int) or not 1 <= level <= 3:
            raise bad_request("level must be 1, 2 or 3.")
        mask = letters_hint(claims.title, claims.round_id, level)
        new_token = tokens.encode(claims.with_hint("letters", level))
        return jsonify({"kind": "letters", "titleMask": mask, "roundToken": new_token})

    @bp.post("/api/rounds/check")
    @actions_limit
    def check():
        body = _json_body()
        claims = _open_claims(body)
        guess = body.get("guess")
        if not isinstance(guess, str) or not guess.strip() or len(guess) > MAX_GUESS_LENGTH:
            raise bad_request(f"guess must be 1-{MAX_GUESS_LENGTH} characters.")
        if not is_correct(guess, claims.title, claims.language):
            return jsonify({"correct": False, "answer": None, "points": 0, "receipt": None})
        elapsed = time.time() - claims.issued_at
        points = round_points(elapsed, claims.time_limit, claims.letters_level, claims.artist_hint)
        log.info("round_correct song_id=%s points=%d", claims.song_id, points)
        return jsonify(
            {
                "correct": True,
                "answer": _answer(claims),
                "points": points,
                "receipt": _receipt(claims, True, points),
            }
        )

    @bp.post("/api/rounds/reveal")
    @actions_limit
    def reveal():
        claims = _claims(_json_body())
        _state().revealed.add(claims.round_id)
        return jsonify(
            {"answer": _answer(claims), "points": 0, "receipt": _receipt(claims, False, 0)}
        )

    @bp.post("/api/scores")
    @scores_limit
    def submit_score():
        body = _json_body()
        board = _require_leaderboard()
        state = _state()
        name = clean_name(body.get("name"))
        if name is None:
            raise bad_request(
                "name must be 1-20 characters: letters, digits, spaces, _, - and . only."
            )
        if is_blocked_name(name):
            raise bad_request("Please choose a different name.")
        receipts = body.get("receipts")
        max_rounds = current_app.config["ROUNDS_PER_GAME"]
        if (
            not isinstance(receipts, list)
            or not 1 <= len(receipts) <= max_rounds
            or not all(isinstance(r, str) and r for r in receipts)
        ):
            raise bad_request(f"receipts must be a list of 1 to {max_rounds} receipts.")
        try:
            decoded = [state.receipts.decode(r) for r in receipts]
        except InvalidToken:
            raise invalid_token("A receipt is invalid or has expired.") from None
        modes = {r.mode for r in decoded}
        if len(modes) != 1 or not modes <= set(MODES):
            raise bad_request("All receipts must be from the same mode.")
        round_ids = [r.round_id for r in decoded]
        if len(set(round_ids)) != len(round_ids):
            raise bad_request("Each receipt must be for a different round.")

        mode = modes.pop()
        score = game_score((r.correct, r.points) for r in decoded)
        entry = ScoreEntry(
            name=name,
            mode=mode,
            score=score,
            correct=sum(r.correct for r in decoded),
            rounds=len(decoded),
            fingerprint=game_fingerprint(mode, round_ids),
        )
        try:
            # Rank counts strictly higher scores, so it is the same before and
            # after this insert; asking first means a failure stores nothing.
            rank = board.rank(mode, score)
            score_id = board.insert(entry)
        except DuplicateGame:
            raise duplicate_game() from None
        except LeaderboardUnavailable:
            raise leaderboard_unavailable() from None
        log.info("score_submitted mode=%s score=%d rank=%d", mode, score, rank)
        return jsonify({"id": score_id, "score": score, "rank": rank})

    @bp.get("/api/leaderboard")
    @reads_limit
    def leaderboard():
        board = _require_leaderboard()
        mode = request.args.get("mode", "type")
        if mode not in MODES:
            raise bad_request('mode must be "type" or "choice".')
        period = request.args.get("period", "all")
        if period not in PERIODS:
            raise bad_request('period must be "all", "week" or "day".')
        raw_limit = request.args.get("limit", str(DEFAULT_LEADERBOARD_LIMIT))
        if not raw_limit.isdigit() or not 1 <= int(raw_limit) <= MAX_LEADERBOARD_LIMIT:
            raise bad_request(f"limit must be 1 to {MAX_LEADERBOARD_LIMIT}.")
        try:
            rows = board.top(mode, since_for(period), int(raw_limit))
        except LeaderboardUnavailable:
            raise leaderboard_unavailable() from None
        return jsonify(
            {
                "entries": [
                    {
                        "rank": rank,
                        "name": row.name,
                        "score": row.score,
                        "correct": row.correct,
                        "rounds": row.rounds,
                        "createdAt": row.created_at.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
                    }
                    for rank, row in ranked(rows)
                ]
            }
        )

    return bp
