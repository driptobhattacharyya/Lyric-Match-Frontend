"""A tiny in-memory PostgREST stand-in for httpx2.MockTransport."""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from urllib.parse import parse_qsl

import httpx2


class FakePostgrest:
    def __init__(self):
        self.snippets: list[dict] = []
        self.scores: list[dict] = []
        self.requests: list[httpx2.Request] = []
        self.fail: str | None = None  # None | "500" | "network"

    @property
    def transport(self) -> httpx2.MockTransport:
        return httpx2.MockTransport(self.handle)

    def handle(self, request: httpx2.Request) -> httpx2.Response:
        self.requests.append(request)
        if self.fail == "network":
            raise httpx2.ConnectError("connection refused", request=request)
        if self.fail == "500":
            return httpx2.Response(500, json={"message": "boom"})
        path = request.url.path.removeprefix("/rest/v1/")
        params = dict(parse_qsl(request.url.query.decode()))
        body = json.loads(request.content) if request.content else None
        route = (request.method, path)
        if route == ("GET", "snippets"):
            key = params["song_key"].removeprefix("eq.")
            rows = [r for r in reversed(self.snippets) if r["song_key"] == key]
            return httpx2.Response(200, json=[{"lyrics": r["lyrics"]} for r in rows][: int(params["limit"])])
        if route == ("POST", "snippets"):
            assert params["on_conflict"] == "song_key,lyrics_hash"
            if not any(
                r["song_key"] == body["song_key"] and r["lyrics"] == body["lyrics"]
                for r in self.snippets
            ):
                self.snippets.append(body)
            return httpx2.Response(201)
        if route == ("POST", "scores"):
            if any(r["fingerprint"] == body["fingerprint"] for r in self.scores):
                return httpx2.Response(409, json={"code": "23505", "message": "duplicate key"})
            row = {**body, "id": str(uuid.uuid4()), "created_at": datetime.now(UTC).isoformat()}
            self.scores.append(row)
            return httpx2.Response(201, json=[{"id": row["id"]}])
        if route == ("POST", "rpc/score_rank"):
            higher = [
                r for r in self.scores if r["mode"] == body["p_mode"] and r["score"] > body["p_score"]
            ]
            return httpx2.Response(200, json=1 + len(higher))
        if route == ("GET", "scores"):
            mode = params["mode"].removeprefix("eq.")
            rows = [r for r in self.scores if r["mode"] == mode]
            if "created_at" in params:
                since = datetime.fromisoformat(params["created_at"].removeprefix("gte."))
                rows = [r for r in rows if datetime.fromisoformat(r["created_at"]) >= since]
            assert params["order"] == "score.desc,created_at.asc"
            rows.sort(key=lambda r: (-r["score"], r["created_at"]))
            fields = params["select"].split(",")
            return httpx2.Response(
                200, json=[{f: r[f] for f in fields} for r in rows][: int(params["limit"])]
            )
        return httpx2.Response(404, json={"message": "no route"})
