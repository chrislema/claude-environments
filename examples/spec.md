# Spec — Tally v1

A single Node.js HTTP service (standard library only — `node:http`; no npm
dependencies), file-backed storage. Small enough to read in one sitting.

## Endpoints

### `POST /api/links`
- Body: JSON `{ "url": "<destination>" }`.
- Validates the destination: must parse as a URL with protocol `http:` or `https:`.
- On success: `201` with `{ "id": "<short id>", "url": "<destination>", "clicks": 0 }`.
  Short id: 6 chars, URL-safe.
- On invalid body or URL: `400` with `{ "error": "<what is wrong>", "next_steps": "<how to fix the request>" }`.

### `GET /l/:id`
- Known id: `302` redirect to the destination, click count incremented by exactly 1.
- Unknown id: `404` with `{ "error": "unknown link id", "next_steps": "create one via POST /api/links" }`.

### `GET /api/links/:id`
- Known id: `200` with `{ "id", "url", "clicks" }`.
- Unknown id: `404`, same shape as above.

### `GET /api/health`
- `200` with `{ "ok": true }`.

## Storage

- JSON file `data/links.json` — a map of id → `{ url, clicks, created_at }`.
- Written synchronously on every mutation (create, click). The file is the single
  source of truth; no in-memory-only state survives a restart.
- Missing or empty file on boot = empty store, not an error.

## Error behavior

- Every error response is JSON with `error` and `next_steps` fields. No stack traces,
  no HTML error pages, no silent fallbacks.
- Malformed JSON body → `400`, not a crash.

## Constraints

- Files: `workers/server.js` (HTTP layer — thin: parse, route, respond),
  `workers/store.js` (storage: load, create, click, get), `workers/id.js` (id generation).
- Server starts with `node workers/server.js` on `PORT` env var, default 3000.
- No frameworks, no dependencies, no build step.
