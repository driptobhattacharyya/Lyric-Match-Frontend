"""Minimal Supabase (PostgREST) access over HTTP: snippet store and leaderboard.

Server-side only: it uses the service-role key, which bypasses RLS (both tables
have RLS enabled with no policies, so nothing else can touch them). The key is
never logged or sent to clients. Short timeouts throughout; callers decide how
to degrade on ``DatabaseError``.

Uses ``httpx2`` (the maintained continuation of httpx, already required by the
google-genai and openai SDKs).
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

import httpx2

from .leaderboard import DuplicateGame, LeaderboardUnavailable, ScoreEntry, ScoreRow
from .llm import clean_snippet
from .songs import Song

log = logging.getLogger(__name__)

SNIPPETS_PER_SONG = 3


class DatabaseError(Exception):
    """Any PostgREST/network failure. The message never contains secrets."""


class Conflict(DatabaseError):
    pass


class PostgrestClient:
    def __init__(
        self,
        url: str,
        service_key: str,
        timeout_seconds: float = 3.0,
        transport: httpx2.BaseTransport | None = None,
    ):
        headers = {"apikey": service_key, "Accept": "application/json"}
        if service_key.startswith("eyJ"):
            # Legacy JWT service_role key; new sb_secret_ keys go in apikey only.
            headers["Authorization"] = f"Bearer {service_key}"
        self._client = httpx2.Client(
            base_url=url.rstrip("/") + "/rest/v1/",
            headers=headers,
            timeout=httpx2.Timeout(timeout_seconds, connect=min(timeout_seconds, 2.0)),
            transport=transport,
        )

    def request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, str] | None = None,
        json: Any = None,
        prefer: str | None = None,
    ) -> Any:
        headers = {"Prefer": prefer} if prefer else None
        try:
            response = self._client.request(method, path, params=params, json=json, headers=headers)
        except httpx2.HTTPError as exc:
            raise DatabaseError(f"{method} {path}: {type(exc).__name__}") from None
        if response.status_code >= 400:
            code = None
            try:
                body = response.json()
                code = body.get("code") if isinstance(body, dict) else None
            except ValueError:
                pass
            if response.status_code == 409 or code == "23505":
                raise Conflict(f"{method} {path}: conflict")
            raise DatabaseError(f"{method} {path}: status {response.status_code} code {code}")
        if not response.content:
            return None
        try:
            return response.json()
        except ValueError:
            raise DatabaseError(f"{method} {path}: invalid JSON") from None


class SupabaseSnippetStore:
    """Persistent snippet cache (table ``snippets``)."""

    def __init__(self, client: PostgrestClient):
        self._db = client

    def fetch(self, song: Song, limit: int = SNIPPETS_PER_SONG) -> list[str]:
        """Stored snippets for ``song``; [] on any error."""
        try:
            rows = self._db.request(
                "GET",
                "snippets",
                params={
                    "select": "lyrics",
                    "song_key": f"eq.{song.cache_key}",
                    "order": "created_at.desc",
                    "limit": str(limit),
                },
            )
        except DatabaseError as exc:
            log.warning("snippet_store_fetch_failed song_id=%s error=%s", song.id, exc)
            return []
        if not isinstance(rows, list):
            return []
        texts = [clean_snippet(r.get("lyrics")) for r in rows if isinstance(r, dict)]
        return [t for t in texts if t]

    def save(self, song: Song, text: str, provider: str) -> bool:
        try:
            self._db.request(
                "POST",
                "snippets",
                params={"on_conflict": "song_key,lyrics_hash"},
                json={
                    "song_key": song.cache_key,
                    "title": song.title,
                    "artist": song.artist,
                    "language": song.language,
                    "pack_id": song.pack_id,
                    "lyrics": text,
                    "provider": provider,
                },
                prefer="resolution=ignore-duplicates,return=minimal",
            )
        except DatabaseError as exc:
            log.warning("snippet_store_save_failed song_id=%s error=%s", song.id, exc)
            return False
        return True


def _parse_time(value: Any) -> datetime:
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return datetime.now(UTC)
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


class SupabaseLeaderboard:
    """Leaderboard on table ``scores``; rank via the ``score_rank`` SQL function."""

    def __init__(self, client: PostgrestClient):
        self._db = client

    def insert(self, entry: ScoreEntry) -> str:
        try:
            rows = self._db.request(
                "POST",
                "scores",
                params={"select": "id"},
                json={
                    "name": entry.name,
                    "mode": entry.mode,
                    "score": entry.score,
                    "correct": entry.correct,
                    "rounds": entry.rounds,
                    "fingerprint": entry.fingerprint,
                },
                prefer="return=representation",
            )
        except Conflict:
            raise DuplicateGame from None
        except DatabaseError as exc:
            log.warning("leaderboard_insert_failed error=%s", exc)
            raise LeaderboardUnavailable from None
        try:
            return str(rows[0]["id"])
        except (TypeError, KeyError, IndexError):
            raise LeaderboardUnavailable from None

    def rank(self, mode: str, score: int) -> int:
        try:
            value = self._db.request(
                "POST", "rpc/score_rank", json={"p_mode": mode, "p_score": score}
            )
            return int(value)
        except (DatabaseError, TypeError, ValueError) as exc:
            log.warning("leaderboard_rank_failed error=%s", exc)
            raise LeaderboardUnavailable from None

    def top(self, mode: str, since: datetime | None, limit: int) -> list[ScoreRow]:
        params = {
            "select": "name,score,correct,rounds,created_at",
            "mode": f"eq.{mode}",
            "order": "score.desc,created_at.asc",
            "limit": str(limit),
        }
        if since is not None:
            params["created_at"] = f"gte.{since.astimezone(UTC).isoformat()}"
        try:
            rows = self._db.request("GET", "scores", params=params)
            return [
                ScoreRow(
                    name=str(r["name"]),
                    score=int(r["score"]),
                    correct=int(r["correct"]),
                    rounds=int(r["rounds"]),
                    created_at=_parse_time(r["created_at"]),
                )
                for r in rows
            ]
        except (DatabaseError, TypeError, KeyError, ValueError) as exc:
            log.warning("leaderboard_read_failed error=%s", exc)
            raise LeaderboardUnavailable from None
