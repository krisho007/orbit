# Orbit

Personal CRM application built with a modern stack.

## Architecture

```
orbit/
├── apps/
│   ├── api/        # Bun + Hono + Drizzle backend
│   └── mobile/     # Expo React Native app (iOS, Android, Web)
├── docs/           # Architecture, deployment, API reference
```

**How it all fits together:**

- The **API** (Hono on Bun) serves REST endpoints at `/api/*`
- The **Web UI** (Expo Web export) is bundled as static files into the same Docker image and served at `/` by Hono
- The **Mobile app** (Expo React Native) is a standalone Android/iOS app that talks to the API
- The **Database** is PostgreSQL hosted on Supabase, managed via Drizzle ORM
- **Auth** is handled by Supabase Auth (the mobile app and API both use Supabase tokens)

```
┌─────────────────────┐      ┌────────────────────────────────────┐
│  Mobile App (Expo)  │─────▶│  Fly.io Container                  │
│  Android / iOS      │      │  ┌──────────────────────────────┐  │
└─────────────────────┘      │  │  Hono API   (/api/*)         │  │
                             │  ├──────────────────────────────┤  │
┌─────────────────────┐      │  │  Expo Web   (/* static)      │  │
│  Browser (Web UI)   │─────▶│  └──────────────────────────────┘  │
└─────────────────────┘      └──────────────┬─────────────────────┘
                                            │
                                            ▼
                             ┌──────────────────────────────┐
                             │  Supabase (PostgreSQL + Auth) │
                             └──────────────────────────────┘
```

## Tech Stack

- **API**: Bun, Hono, Drizzle ORM, PostgreSQL (Supabase)
- **Mobile**: Expo, React Native, NativeWind (Tailwind CSS)
- **Auth**: Supabase Auth
- **Deployment**: Fly.io (API + Web UI), EAS Build (Mobile)

---

## Getting Started (Local Development)

### API

```bash
cd apps/api
cp .env.example .env    # then fill in DATABASE_URL, SUPABASE_URL, etc.
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

Orbit ships as a web app only (installable PWA); there are no native builds.

---

## Deployment

The API and Web UI are bundled into a single Docker image and deployed together:

```bash
fly deploy                # from repo root — deploys API + Web UI to Fly.io
```

For database migrations, mobile builds, environment setup, and the full deployment guide, see **[docs/deployment.md](docs/deployment.md)**.
