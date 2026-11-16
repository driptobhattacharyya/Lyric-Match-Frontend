# Lyric Match API

All bodies are JSON. Errors use one envelope with a proper 4xx/5xx status:

```json
{"error": {"code": "bad_request", "message": "Safe human-readable text"}}
```

Codes: `bad_request`, `invalid_token` (also expired), `rate_limited` (429), `llm_unavailable` (503),
`leaderboard_unavailable` (503), `duplicate_game` (409), `not_found`, `internal_error`.

The answer to a round is never sent to the client before the round ends.

## GET /healthz

`{"status": "ok"}`. Cheap, no LLM or database call. Used for cold-start warm-up and the Render health check.

## GET /api/meta

```json
{
  "languages": [
    {"id": "en", "name": "English", "packs": [{"id": "en-pop-2010s", "name": "Pop: 2010s to now", "count": 160}]},
    {"id": "hi", "name": "Hindi", "packs": [{"id": "hi-bollywood-90s", "name": "Bollywood: 90s", "count": 160}]}
  ],
  "leaderboard": true,
  "roundsPerGame": 8,
  "roundSeconds": {"type": 45, "choice": 20}
}
```

`leaderboard` is false when no database is configured; the game is fully playable without it.

## POST /api/rounds

Request (every field optional):

```json
{"mode": "type", "packs": ["en-pop-2010s", "hi-bollywood-90s"], "exclude": ["<songId>"]}
```

- `mode`: `type` (default) or `choice`.
- `packs`: pack ids to draw from, at most 30. Missing or empty means all packs. Unknown ids are a `bad_request`.
- `exclude`: song ids already seen this session, at most 200. Ignored if it would leave no songs.

Response:

```json
{
  "roundToken": "…",
  "lyrics": "two to four lines, always in Latin script",
  "mode": "type",
  "language": "en",
  "packId": "en-pop-2010s",
  "titleLength": 12,
  "titleMask": "_____ __ ___",
  "options": null,
  "timeLimitSeconds": 45
}
```

`titleMask` is the title with letters and digits replaced by `_`; spaces and punctuation are kept.
`options` is an array of four titles (the right one included, distractors from the same language) in
choice mode, otherwise null.

## POST /api/rounds/hint

Request: `{"roundToken": "…", "kind": "letters", "level": 2}` or `{"roundToken": "…", "kind": "artist"}`.

Response: `{"kind": "letters", "titleMask": "S____ I_ O__", "roundToken": "…"}` or
`{"kind": "artist", "artist": "…", "roundToken": "…"}`.

Letter hints have levels 1 to 3; each level reveals a superset of the previous one. The response
carries a **new `roundToken`** that records the hint. The client must use it for every later call
in that round.

## POST /api/rounds/check

Request: `{"roundToken": "…", "guess": "shake it off"}` (guess is 1 to 200 characters and not blank).
A token whose round was already revealed is an `invalid_token` here and in `/api/rounds/hint`.

Response when wrong: `{"correct": false, "answer": null, "points": 0, "receipt": null}`. The round continues.

Response when right:

```json
{
  "correct": true,
  "answer": {"songId": "…", "title": "…", "artist": "…", "year": 2014, "film": null},
  "points": 132,
  "receipt": "…"
}
```

## POST /api/rounds/reveal

Request: `{"roundToken": "…"}`. Ends the round as a miss (time up, gave up, out of hearts).

Response: `{"answer": {…}, "points": 0, "receipt": "…"}`.

## Scoring

The server computes the base points of a round and signs them into the `receipt`:

- Miss: 0.
- Correct: `100 + speedBonus - hintPenalty`, never below 10.
- `speedBonus = round(50 * max(0, 1 - elapsed / timeLimitSeconds))`, with `elapsed` measured by the
  server from when the round was issued.
- `hintPenalty = 15 * highestLetterLevel + (20 if the artist hint was used)`.

A game's score applies a streak multiplier to the base points, in play order: the n-th consecutive
correct round is multiplied by `min(1.5, 1 + 0.1 * (n - 1))`, rounded half up. A miss resets the streak.
Both sides compute this in exact integers, never floats (`105 * 1.3` must give 137):
`points = (base * (10 + k) + 5) // 10` with `k = min(5, n - 1)`.
The client shows this as it goes; the server recomputes it from the receipts when a score is submitted.

## POST /api/scores

Request: `{"name": "Dripto", "receipts": ["…", "…"]}`, receipts in play order.

- `name`: trimmed and inner runs of whitespace collapsed to one space, then 1 to 20 characters;
  ASCII letters `A-Z a-z`, digits, spaces, `_`, `-` and `.` only. Offensive names are a `bad_request`.
- 1 to `roundsPerGame` receipts, all the same mode, all for different rounds, all issued within the last hour.

Response: `{"id": "…", "score": 874, "rank": 12}`. Submitting the same game twice (the same set of
rounds, in any order) is a `duplicate_game`. A tampered or expired receipt is an `invalid_token`.

## GET /api/leaderboard?mode=type&period=all&limit=20

`mode` is `type` or `choice`. `period` is `all`, `week` or `day`. `limit` is 1 to 50.

```json
{"entries": [{"rank": 1, "name": "Dripto", "score": 1104, "correct": 8, "rounds": 8, "createdAt": "2026-11-15T14:00:00Z"}]}
```

Entries are sorted by score (ties: earliest first) with competition ranks ("1, 2, 2, 4"). The `rank`
returned by `POST /api/scores` is 1 + the number of strictly higher scores in that mode. Invalid
`mode`, `period` or `limit` is a `bad_request`.
