# Orbit

Personal CRM application built with a modern stack.

## Architecture

```
orbit/
├── apps/
│   ├── api/        # Bun + Hono + Drizzle backend
│   └── app/        # Expo (React Native Web) app — shipped as an installable web PWA
├── docs/           # Architecture, deployment, API reference
```

**How it all fits together:**

- The **API** (Hono on Bun) serves REST endpoints at `/api/*`
- The **Web app** (Expo Web static export) is bundled into the same Docker image and served at `/` by Hono, as an installable **PWA** (service worker + manifest)
- The **Database** is PostgreSQL hosted on Neon, managed via Drizzle ORM
- **Auth** is handled by Better Auth (Google OAuth); the API owns `/api/auth/*`

```
┌─────────────────────┐      ┌────────────────────────────────────┐
│  Browser / PWA      │─────▶│  Fly.io Container                  │
│  (installable)      │      │  ┌──────────────────────────────┐  │
└─────────────────────┘      │  │  Hono API   (/api/*)         │  │
                             │  ├──────────────────────────────┤  │
                             │  │  Expo Web   (/* static, PWA) │  │
                             │  └──────────────────────────────┘  │
                             └──────────────┬─────────────────────┘
                                            │
                                            ▼
                             ┌──────────────────────────────┐
                             │  Neon (PostgreSQL)            │
                             └──────────────────────────────┘
```

## Tech Stack

- **API**: Bun, Hono, Drizzle ORM, PostgreSQL (Neon)
- **Web app**: Expo (React Native Web), Expo Router, NativeWind (Tailwind CSS), installable PWA
- **Auth**: Better Auth (Google OAuth)
- **Deployment**: Fly.io (single image: API + Expo Web static export)

---

## Getting Started (Local Development)

### API

```bash
cd apps/api
cp .env.example .env    # then fill in DATABASE_URL, BETTER_AUTH_SECRET, GOOGLE_CLIENT_ID, etc.
bun install
bun run dev             # starts on http://localhost:3001 with hot reload
```

### Web app

```bash
cd apps/app
cp .env.example .env    # then fill in EXPO_PUBLIC_API_URL, EXPO_PUBLIC_SUPABASE_URL, etc.
bun install
bun run dev             # starts the web dev server against the local API
```

Orbit ships as a web app only (installable PWA); there are no native (Android/iOS) builds.

---

## Deployment

The API and web app are bundled into a single Docker image and deployed together:

```bash
fly deploy                # from repo root — deploys API + Web app to Fly.io
```

For database migrations, the PWA/web build, environment setup, and the full deployment guide, see **[docs/deployment.md](docs/deployment.md)**.
