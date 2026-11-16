# Lyric Match backend

Flask API that issues lyric rounds, checks guesses, scores games and serves the leaderboard. See the [root README](../README.md) for the overview, [docs/api.md](../docs/api.md) for endpoints and [docs/deploy.md](../docs/deploy.md) for deployment.

- `app.py` is the WSGI entry (`gunicorn app:app`); `lyric_match/` holds the code and the song catalogue (`lyric_match/catalog/`, rules in its README).
- `supabase/schema.sql` creates the `snippets` and `scores` tables (RLS on, no policies).
- Run on a single worker: rate limits, the snippet cache and the LLM budget live in process memory.

## Commands

```bash
python -m venv .venv && source .venv/bin/activate   # Python 3.13 (.python-version)
pip install -r requirements-dev.txt
cp .env.example .env                                # then set SECRET_KEY, FAKE_LLM=1, FAKE_DB=1 for a keyless run
flask --app app run --port 5000                     # dev server
ruff check .
pytest
python scripts/validate_catalog.py                  # check the catalogue packs
python scripts/pregenerate.py --pack hi-indie --limit 50 --variants 2 --max-calls 100
```

`pregenerate.py` fills the snippet cache ahead of time (local file `data/snippets.json`, and Supabase if configured; `--no-supabase` to skip). It refuses to run with `FAKE_LLM` set.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `SECRET_KEY` | none | Key material for round tokens and receipts. Required in production. |
| `GEMINI_API_KEY` | none | Primary LLM provider. |
| `GEMINI_MODEL` | `gemini-3.8-flash` | Gemini model name. |
| `OPENAI_API_KEY` | none | Fallback LLM provider. |
| `OPENAI_MODEL` | `gpt-5.4-mini` | OpenAI model name. |
| `OPENAI_REASONING_EFFORT` | `low` | Sent to OpenAI; empty to omit. |
| `SUPABASE_URL` | none | Project URL (optional: leaderboard and snippet cache). |
| `SUPABASE_SERVICE_ROLE_KEY` | none | Server-only key for Supabase. |
| `ALLOWED_ORIGINS` | `http://localhost:5173` | Comma-separated CORS allowlist. |
| `MAX_LLM_CALLS_PER_DAY` | `200` | Global LLM call cap per UTC day, then cached snippets only. |
| `FAKE_LLM` | `0` | `1` = deterministic placeholder lyrics, no LLM calls. |
| `FAKE_DB` | `0` | `1` = in-memory leaderboard, Supabase never called. |
| `SNIPPET_CACHE_PATH` | `data/snippets.json` | Optional pre-generated snippet file. |
| `RATELIMIT_ENABLED` | `1` | `0` disables rate limiting (local use). |
| `RATE_LIMIT_ROUNDS` / `_ACTIONS` / `_SCORES` / `_READS` | `20 per minute;300 per day` / `60 per minute` / `6 per minute;60 per day` / `60 per minute` | Per-IP limits. |

Further tunables (timeouts, `CACHE_HIT_PROBABILITY`, `CATALOG_DIR`) are in `lyric_match/config.py`.
