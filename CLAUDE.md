# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Orbit is a multi-tenant personal CRM with a Bun/Hono REST API and an Expo (React Native Web) app shipped as an installable web PWA. All data is scoped by `userId` for tenant isolation.

## Monorepo Structure

```
apps/
  api/       # Bun + Hono + Drizzle backend (REST API)
  mobile/    # Expo app shipped as a web PWA (Expo Web static export)
docs/        # Detailed docs (see links below)
scripts/     # deploy-fly.sh
```

## Development Commands

### API (`apps/api`)

```bash
cd apps/api
bun install
bun run dev             # Hot-reload server on :3001
bun test                # Run all tests
bun test src/routes/assistant.test.ts  # Run single test
bun run db:generate     # Generate migration SQL from schema diff
bun run db:migrate      # Run pending migrations (ALWAYS use this, never db:push)
bun run db:studio       # Open Drizzle Studio
```

### Web app (`apps/app`)

Orbit is web-only (installable PWA); there are no native builds.

```bash
cd apps/app
bun install
bun run dev             # Web dev server pointing to local API (:3001)
bun run web             # Web dev server (default API)
bun run web:local       # Web pointing to local API
bun run build:web       # Static export + Workbox service worker → dist/
bun run lint            # ESLint
```

### Deployment

```bash
./scripts/deploy-fly.sh              # Deploy API + Web (single Fly app)
```

The Docker build runs `expo export --platform web` then `workbox generateSW` and copies
`dist/` into the API's `./public`, which the Hono server serves (with PWA cache headers).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Bun |
| API Framework | Hono |
| ORM | Drizzle ORM |
| Database | PostgreSQL (Neon) |
| Auth | Better Auth (Google OAuth) |
| Web app | Expo (React Native Web) + Expo Router, shipped as an installable PWA |
| Styling | NativeWind (Tailwind CSS for RN) |
| UI Components | Gluestack UI |
| AI | Google Gemini via `@ai-sdk/google` (Vercel AI SDK) |
| Deployment | Fly.io (single app: Hono API + Expo Web static export served from `./public`) |

## Key Conventions

- **Use Bun everywhere** - `bun install`, `bun run`, `bun test`. Never npm/yarn/node.
- **Drizzle ORM, not Prisma** - Schema at `apps/api/src/db/schema.ts`, migrations in `apps/api/drizzle/`. **Always use `db:migrate`, never `db:push`** (`db:push` crashes on CHECK constraints due to a drizzle-kit bug)
- **Better Auth (Google OAuth)** - Auth config at `apps/api/src/lib/auth.ts`; Better Auth owns `/api/auth/*`. Sessions are verified in `apps/api/src/middleware/auth.ts` via `auth.api.getSession(...)` (accepts the web cookie or a native bearer token). Google provider access/refresh tokens live in the `accounts` table and are read via `auth.api.getAccessToken(...)` for the Contacts import.
- **Every query must filter by `userId`** - Multi-tenancy isolation is enforced at the application layer (no DB row-level security)
- **Expo Router for navigation** - File-based routing in `apps/app/app/`
- **All API types are defined in `apps/app/lib/api.ts`** - Client-side types and API wrapper methods
- **Path aliases**: `@/` is not used; imports use relative paths in both apps
- **Web-only** - Orbit ships as a web app (installable PWA) via the Expo Web static export; there are no Android/iOS builds. Prefer web-safe APIs; residual `Platform.OS` branches must have a working web (`default`) path.
- **Custom fonts — never use bare `font-bold`/`font-semibold`/`font-medium`** - The app uses Inter (body) and Lora (headings) custom fonts. React Native requires font-family + weight coupled together. Use these Tailwind classes instead:
  - Body text: `font-body` (regular), `font-body-medium`, `font-body-semibold`, `font-body-bold`
  - Headings (page titles, entity names, section headers): `font-heading`, `font-heading-semibold`, `font-heading-bold`
  - The `<Text>` UI component already applies `font-body` by default; the `<Heading>` component applies `font-heading-bold`
  - For inline styles (e.g. React Navigation headers), use `fontFamily: Platform.select({ ios: "Lora_700Bold", android: "Lora_700Bold", default: "Lora, Georgia, serif" })`

## Detailed Documentation

- **[docs/architecture.md](docs/architecture.md)** - How the web app and API connect, PWA/caching setup, auth flow, data layer patterns
- **[docs/api.md](docs/api.md)** - Full REST API reference (endpoints, payloads, enums)
- **[docs/web.md](docs/web.md)** - Web app structure, navigation, UI patterns
- **[docs/deployment.md](docs/deployment.md)** - Deployment workflows, web/PWA build, environment variables
