"""Uniform JSON error envelope: {"error": {"code": ..., "message": ...}}."""

from __future__ import annotations

import logging

from flask import Flask, jsonify
from werkzeug.exceptions import HTTPException

log = logging.getLogger(__name__)


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


def bad_request(message: str) -> ApiError:
    return ApiError(400, "bad_request", message)


def invalid_token(
    message: str = "This round has expired or is invalid. Start a new round.",
) -> ApiError:
    return ApiError(400, "invalid_token", message)


def llm_unavailable() -> ApiError:
    return ApiError(
        503, "llm_unavailable", "Couldn't get lyrics right now. Please try again later."
    )


def leaderboard_unavailable() -> ApiError:
    return ApiError(503, "leaderboard_unavailable", "The leaderboard is unavailable right now.")


def duplicate_game() -> ApiError:
    return ApiError(409, "duplicate_game", "This game has already been submitted.")


def error_response(status: int, code: str, message: str):
    return jsonify({"error": {"code": code, "message": message}}), status


_HTTP_ERRORS = {
    404: ("not_found", "Not found."),
    405: ("bad_request", "Method not allowed."),
    413: ("bad_request", "Request body too large."),
    415: ("bad_request", "Request body must be JSON."),
    429: ("rate_limited", "Too many requests. Please slow down."),
}


def register_error_handlers(app: Flask) -> None:
    @app.errorhandler(ApiError)
    def _api_error(err: ApiError):
        return error_response(err.status, err.code, err.message)

    @app.errorhandler(HTTPException)
    def _http_error(err: HTTPException):
        status = err.code or 500
        if status >= 500:
            return error_response(status, "internal_error", "Something went wrong.")
        code, message = _HTTP_ERRORS.get(status, ("bad_request", "Bad request."))
        return error_response(status, code, message)

    @app.errorhandler(Exception)
    def _unexpected(err: Exception):
        log.exception("unhandled_error")
        return error_response(500, "internal_error", "Something went wrong.")
