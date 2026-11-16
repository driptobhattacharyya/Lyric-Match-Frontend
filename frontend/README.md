# Lyric Match frontend

React 19 + TypeScript + Vite + Tailwind CSS 4 single-page app, built with Bun and served as static assets by a Cloudflare Worker (`wrangler.jsonc`, assets from `dist/`). See the [root README](../README.md) for the overview and [docs/deploy.md](../docs/deploy.md) for deployment.

- `src/game/` game rules, reducer and progression (XP, badges, daily streak, saved in localStorage).
- `src/lib/api.ts` API client, including cold-start warm-up via `/healthz`.
- `tests/mock-api/server.mjs` standalone mock API for UI work (`node tests/mock-api/server.mjs`, port 5055).

## Commands

```bash
bun install
bun run dev          # Vite dev server on http://localhost:5173
bun run lint
bun test
bun run typecheck
bun run build        # tsc -b && vite build, output in dist/
bun run preview      # build, then wrangler dev
bun run deploy       # build, then wrangler deploy
```

## Configuration

`VITE_API_URL` is the base URL of the backend, without a trailing slash (default `http://localhost:5000`). It is baked in at build time and is public; copy `.env.example` to `.env` to change it locally.
