# Deployment Guide

## Architecture

The API and web app are bundled into a single Docker image deployed to Fly.io:
1. **Stage 1** (Node): Builds the Expo Web static export (`npx expo export --platform web`) from `apps/app`, then generates the PWA service worker with Workbox (`npx workbox generateSW workbox-config.js`)
2. **Stage 2** (Bun): Copies the built static files (incl. `sw.js`, `manifest.json`) into `/app/public`, installs API deps, runs `bun run src/index.ts`

Hono serves the API at `/api/*` and the Expo Web static files at `/*` with SPA fallback, applying PWA cache headers (immutable for content-hashed `/_expo/static/*`, `no-cache` for HTML/`sw.js`/`manifest.json`).

## Deploying

### API + Web UI (Fly.io)

```bash
# From repo root
fly deploy
```

Uses `apps/api/Dockerfile` and the `fly.toml` config at the repo root.

### Database Migrations

Migrations are **never run automatically** during deploy.

```bash
cd apps/api
# 1. Edit apps/api/src/db/schema.ts
# 2. Generate migration SQL
bun run db:generate
# 3. Review the generated SQL in apps/api/drizzle/
# 4. Run migration against database
bun run db:migrate
# 5. Deploy API (if code changes too)
cd ../..
fly deploy
```

**Always run migrations BEFORE deploying** new API code that depends on schema changes.

### Required Postgres Extensions

Orbit depends on two Postgres extensions. **If you ever move the database to a new
provider (or spin up a fresh Neon branch/project), these must be enabled or parts of
the app will 500 at runtime** — a plain `CREATE DATABASE` does not include them.

| Extension | Enabled by | Used for | Symptom if missing |
|---|---|---|---|
| `pg_trgm` | `drizzle/0019_enable_pg_trgm.sql` | Fuzzy contact search (`similarity()` / `word_similarity()`) in `GET /api/contacts?search=` and the assistant contact tools | `function similarity(text, text) does not exist` → every contact search returns **500** |
| `vector` (pgvector) | `drizzle/0005_conversation_embeddings.sql` | Semantic search over conversation & event embeddings (cosine `<=>`) | `type "vector" does not exist` → embedding writes/queries fail |

Both are turned on via `CREATE EXTENSION IF NOT EXISTS ...` inside normal migrations,
so **running `bun run db:migrate` against the new database enables them automatically**.
On a brand-new database, run the full migration set (not just the latest) so the
`CREATE EXTENSION` statements execute. To verify afterwards:

```bash
psql "$DATABASE_URL" -c "SELECT extname FROM pg_extension;"
# expect: plpgsql, pg_trgm, vector
```

If a managed provider blocks `CREATE EXTENSION` (some do for non-superusers), enable
`pg_trgm` and `vector` from the provider console/allowlist before migrating. Neon
allows both without extra steps.

### Web build & PWA (local)

The web build runs inside the Docker image, but you can reproduce it locally:

```bash
cd apps/app
bun run build:web        # expo export --platform web && workbox generateSW workbox-config.js
```

This produces `dist/` (static bundle + `sw.js` + `manifest.json`). There are no native (Android/iOS / EAS) builds — Orbit ships as a web PWA only.

## Deployment Decision Matrix

| Changed... | Action |
|---|---|
| Web UI only | `fly deploy` (rebuilds web + API image; the content-hash + service worker bust the cache automatically) |
| API code only | `fly deploy` |
| DB schema only | `cd apps/api && bun run db:generate && bun run db:migrate` |
| Schema + API | Migrate first, then deploy |

## Environment Setup

### API (`apps/api/.env`)

Copy from `apps/api/.env.example`. Required:
- `DATABASE_URL` - Neon Postgres connection string (pooled, `?sslmode=require`)
- `BETTER_AUTH_SECRET` - Session signing secret (`openssl rand -base64 32`)
- `BETTER_AUTH_URL` - Public API base URL (OAuth callback + image URLs)
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` - Google OAuth (sign-in + Contacts import)

Optional:
- `GOOGLE_GENERATIVE_AI_API_KEY` - For AI assistant
- `CORS_ALLOWED_ORIGINS` - Comma-separated allowed origins
- `PORT` - Default 3001

### Web app (`apps/app/.env`)

Copy from `apps/app/.env.example`. Required:
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

Development:
- `EXPO_PUBLIC_API_URL` - Set to local API for dev, leave empty for production

### API URL (development)

| Where | `EXPO_PUBLIC_API_URL` |
|----------|----------------------|
| Local web (`bun run web:local`) | `http://localhost:3001` |
| Another device on your LAN | `http://<your-wifi-ip>:3001` |
| Production | empty (same origin as the Hono server) |

### Fly.io Production Variables

Set via `fly secrets set`:
- `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_GENERATIVE_AI_API_KEY`

Build args in `fly.toml` provide Expo public vars at Docker build time.
