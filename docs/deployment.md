# Deployment Guide

## Architecture

The API and Web UI are bundled into a single Docker image deployed to Fly.io:
1. **Stage 1** (Node): Builds Expo Web (`npx expo export --platform web`) from `apps/mobile`
2. **Stage 2** (Bun): Copies built static files into `/app/public`, installs API deps, runs `bun run src/index.ts`

Hono serves the API at `/api/*` and the Expo Web static files at `/*` with SPA fallback.

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

### Mobile Builds (EAS)

| Profile | Output | Command |
|---------|--------|---------|
| `development` | APK with dev tools | `eas build --profile development --platform android` |
| `preview` | Standalone APK | `eas build --profile preview --platform android` |
| `preview` (local) | APK built on Mac | `eas build --profile preview --platform android --local` |
| `production` | AAB for Play Store | `eas build --profile production --platform android` |

All profiles connect to the same backend. The difference is build type only.

## Deployment Decision Matrix

| Changed... | Action |
|---|---|
| Mobile UI only | `fly deploy` (rebuilds web + API image) |
| API code only | `fly deploy` |
| DB schema only | `cd apps/api && bun run db:generate && bun run db:migrate` |
| Schema + API | Migrate first, then deploy |
| Mobile native deps | `eas build --profile development --platform android` |

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

### Mobile (`apps/mobile/.env`)

Copy from `apps/mobile/.env.example`. Required:
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

Development:
- `EXPO_PUBLIC_API_URL` - Set to local API for dev, leave empty for production

### API URL by platform (development)

| Platform | `EXPO_PUBLIC_API_URL` |
|----------|----------------------|
| Web | `http://localhost:3001` |
| Android emulator | `http://10.0.2.2:3001` |
| iOS simulator | `http://127.0.0.1:3001` |
| Physical device | `http://<your-wifi-ip>:3001` |
| Production (web) | empty (same origin) |
| Production (mobile) | `https://orbit-app.fly.dev` |

### Fly.io Production Variables

Set via `fly secrets set`:
- `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_GENERATIVE_AI_API_KEY`

Build args in `fly.toml` provide Expo public vars at Docker build time.
