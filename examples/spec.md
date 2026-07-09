# Spec — Tally v1

A single Cloudflare Worker with Static Assets (settled policy S-001), D1-backed storage.
Small enough to read in one sitting. Not multi-tenant, no accounts, no auth — the
tenant/billing/limit patterns explicitly do not apply here and should be declared
not-applicable, not silently skipped.

Scaffold profile: `{ "name": "tally", "flags": ["d1"] }`.

## Endpoints

### `POST /api/links`
- Body: JSON `{ "url": "<destination>" }`.
- Validates the destination: must parse as a URL with protocol `http:` or `https:`.
- On success: `201` with `{ "id": "<short id>", "url": "<destination>", "clicks": 0 }`.
  Short id: 6 chars, URL-safe, generated with `crypto.getRandomValues`.
- On invalid body or URL: `400` with `{ "error": "<what is wrong>", "next_steps": "<how to fix the request>" }`.

### `GET /l/:id`
- Known id: `302` redirect to the destination, click count incremented by exactly 1 —
  a single atomic `UPDATE links SET clicks = clicks + 1` (no read-modify-write).
- Unknown id: `404` with `{ "error": "unknown link id", "next_steps": "create one via POST /api/links" }`.

### `GET /api/links/:id`
- Known id: `200` with `{ "id", "url", "clicks" }`.
- Unknown id: `404`, same shape as above.

### `GET /health`
- `200` with `{ "status": "ok" }` (the scaffold's smoke endpoint).

## Storage

- D1 table `links`: `id TEXT PRIMARY KEY`, `url TEXT NOT NULL`,
  `clicks INTEGER NOT NULL DEFAULT 0`, `created_at TIMESTAMP NOT NULL`.
- Migration in `migrations/` applied via `wrangler d1 migrations apply`.
- The D1 database is the single source of truth. No in-memory state may be treated as
  authoritative — Worker isolates are ephemeral by design.

## Error behavior

- Every error response is JSON with `error` and `next_steps` fields. No stack traces,
  no HTML error pages, no silent fallbacks.
- Malformed JSON body → `400`, not a crash.

## Constraints

- Files (the Workers-first canonical layout):
  - `src/index.js` — entrypoint: `fetch`, `/health`, route dispatch — thin
  - `src/routes/links.js` — create + stats handlers (thin: extract, call service, respond)
  - `src/routes/redirect.js` — `GET /l/:id`
  - `src/services/store.js` — D1 access: create, click, get
  - `src/lib/id.js` — short-id generation
  - `migrations/0001_links.sql` — the links table
- `public/` keeps the scaffold's static shell; no product UI in v1.
- Vanilla JavaScript, no frameworks, no npm runtime dependencies (S-004).
- Tests in `tests/` run in the Workers pool (`vitest`), including the scaffold's
  `/health` smoke test.
