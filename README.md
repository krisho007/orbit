# Orbit

Personal CRM application built with a modern stack.

## Architecture

```
orbit/
├── apps/
│   ├── api/        # Bun + Hono + Drizzle backend
│   └── mobile/     # Expo React Native app (iOS, Android, Web)
├── scripts/
│   └── deploy-fly.sh
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

### Mobile

```bash
cd apps/mobile
cp .env.example .env    # then fill in EXPO_PUBLIC_API_URL, EXPO_PUBLIC_SUPABASE_URL, etc.
bun install
bun run start           # starts Expo dev server
```

> **Note:** OAuth is not supported in Expo Go. For local OAuth testing, use
> `bun run android` (or `bun run ios` for an iOS simulator build) instead of Expo Go.

---

## Deployment Guide

### 1. Deploying UI (Web) Changes

The Web UI is the Expo Web export of `apps/mobile`. It is **bundled into the same Docker image** as the API during the Fly.io deploy. So deploying UI changes means redeploying to Fly.io.

```bash
# From the repo root
./scripts/deploy-fly.sh
```

**What happens under the hood:**
1. Docker Stage 1: Builds Expo Web (`npx expo export --platform web`) from `apps/mobile`
2. Docker Stage 2: Copies the built static files into `/app/public` alongside the API
3. Hono serves them via `serveStatic({ root: "./public" })`

**When to do this:** Whenever you change anything in `apps/mobile/` that should be reflected on the web version.

---

### 2. Deploying Backend (API) Changes

The API lives in `apps/api` and is also deployed to Fly.io. Same command:

```bash
# From the repo root
./scripts/deploy-fly.sh
```

**What happens:** Docker rebuilds the API image and deploys it to Fly.io. The API starts with `bun run src/index.ts`.

> Since both the Web UI and API are in the same Docker image, **any deploy updates both**.
> This is fine — the build is fast, and it keeps them in sync.

---

### 3. Deploying Database (Schema) Changes

Database migrations are **never run automatically** during deploy. This is intentional — you want full control over when schema changes hit production.

#### Workflow

```
Edit schema.ts → Generate migration → Review SQL → Run migration → Deploy API
```

#### Step-by-step

**Step 1: Make your schema changes**

Edit `apps/api/src/db/schema.ts` as needed.

**Step 2: Generate the migration**

```bash
cd apps/api
bun run db:generate
```

This creates a new SQL file in `apps/api/drizzle/` (e.g. `0001_some_name.sql`).

**Step 3: Review the generated SQL**

Open the generated file and verify the SQL looks correct. This is your chance to catch issues before they hit production.

**Step 4: Run the migration against Supabase**

```bash
cd apps/api
bun run db:migrate
```

This runs all pending migrations against the database specified by `DATABASE_URL` in your `.env`.

> Make sure your `DATABASE_URL` points to your **production Supabase** database when you want to migrate production.

**Step 5: Deploy the API** (if you also changed API code)

```bash
./scripts/deploy-fly.sh
```

#### Important Notes

- **Always run migrations BEFORE deploying** new API code that depends on the schema changes.
  If you deploy API code that references new columns/tables before the migration runs, the API will crash.
- **Order matters:**
  1. Run `bun run db:migrate` (schema is updated)
  2. Run `./scripts/deploy-fly.sh` (API code that uses new schema goes live)
- Migrations are incremental. Once `0000_spooky_blade.sql` is recorded as applied,
  Drizzle will only run newer migrations (e.g. `0001_...`, `0002_...`).
- If you only changed the schema (no API code changes), you only need step 4 — no Fly.io deploy needed.

#### Quick Reference

| Command | What it does |
|---|---|
| `bun run db:generate` | Creates a new migration SQL file from schema diff |
| `bun run db:migrate` | Runs all pending migrations against the database |
| `bun run db:push` | Pushes schema directly (no migration file — dev only) |
| `bun run db:studio` | Opens Drizzle Studio to browse your database |

---

### 4. Mobile App Builds

#### Build Profiles Overview

| Profile | Purpose | Output | Use Case |
|---------|---------|--------|----------|
| `development` | Testing with Expo dev tools | APK | Debug issues, test new features with dev menu |
| `preview` | Clean testing build | APK | Share with testers, install directly on phone |
| `production` | Play Store release | AAB | Submit to Google Play Store |

All profiles connect to the **same backend** (Fly.io) and **same database** (Supabase). The difference is only in the build type, not the environment.

---

#### Development Build

Use development builds when actively developing the mobile app. They enable **instant hot reload** — you can edit code on your computer and see changes on your phone immediately without rebuilding.

**How it works:** The development APK is a "shell" containing only the native runtime (React Native engine, native modules, Expo SDK). Your JavaScript/TypeScript code is **not bundled into the APK**. Instead, it's streamed from your local Expo dev server each time the app loads. This is why:
- Code changes appear instantly (hot reload)
- You need the dev server running to use the app
- You only rebuild the APK when native dependencies change

**Step 1: Configure environment**

Ensure `apps/mobile/.env` has your Fly.io URL:
```
EXPO_PUBLIC_API_URL="https://orbit-app.fly.dev"
```

**Step 2: Build and install the development APK**

```bash
cd apps/mobile
eas build --profile development --platform android
```

Once the build completes, scan the QR code shown in the terminal to download and install the APK on your phone. You may need to allow "Install from unknown sources" in Android settings.

**Step 3: Start the local Expo dev server**

```bash
cd apps/mobile
bun run start
```

This starts the Metro bundler and displays a QR code in the terminal.

**Step 4: Connect the app to the dev server**

1. Open the development build app on your phone
2. On the home screen, tap to select a development server
3. Use the in-app scanner to scan the QR code from Step 3

Your phone must be on the same WiFi network as your computer.

**Step 5: Start developing**

The app will load and connect to the Fly.io backend (per your `.env`). Any code changes you make will hot-reload automatically.

> **Note:** You only need to rebuild the APK (Step 2) when you change native code or dependencies. For JavaScript changes, just save and the app will reload.

**Switching to local API server**

To test against your local API instead of Fly.io, change `apps/mobile/.env`:

```bash
# Comment out the Fly.io URL
# EXPO_PUBLIC_API_URL="https://orbit-app.fly.dev"

# For physical device on same WiFi (use your computer's WiFi IP):
EXPO_PUBLIC_API_URL="http://192.168.x.x:3001"

# For Android emulator only (10.0.2.2 = host machine's localhost):
# EXPO_PUBLIC_API_URL="http://10.0.2.2:3001"
```

> **Tip:** Find your computer's WiFi IP with: `ipconfig getifaddr en0` (macOS)

Then start your local API server:

```bash
cd apps/api
bun run dev
```

With development builds, **no rebuild is needed**. Restart the Expo dev server with cache cleared and force-close/reopen the app on your phone:

```bash
cd apps/mobile
bun run start --clear
```

Then **force-close the app on your phone** (swipe it away from recent apps) and reopen it. A simple reload is not enough — the app must be fully restarted to pick up `.env` changes.

> **Important:** For preview/production builds, changing `.env` requires a full rebuild since the values are baked into the APK at build time.

---

#### Preview Build

Use preview builds to test the app as a **standalone APK** without needing a dev server. This is ideal for:
- Sharing with testers who don't have a development environment
- Testing on your own phone without running anything on your computer
- Verifying the app works correctly before a production release

**How it works:** Unlike development builds, preview builds **bundle all JavaScript code into the APK**. The app is fully self-contained and connects directly to your Fly.io backend. No local server required.

```bash
# 1. Deploy any pending backend changes (from repo root)
fly deploy

# 2. Build preview APK (from apps/mobile)
cd apps/mobile
eas build --profile preview --platform android
```

Scan the QR code to download and install. The app will work immediately.

---

#### Production Build (Play Store)

Use production builds for **publishing to the Google Play Store**.

**How it works:** Like preview builds, production builds bundle all JavaScript into the app. The difference is the output format (AAB instead of APK) and optimizations for release:
- **AAB format**: Required by Play Store, allows Google to optimize delivery for each device
- **Code signing**: Uses your upload key for Play Store verification
- **Optimizations**: Minified, tree-shaken, no dev tools or debug code

```bash
cd apps/mobile

# Build production AAB
eas build --profile production --platform android

# Submit to Play Store (requires service account setup)
eas submit --platform android --profile production
```

See [apps/mobile/PLAY_STORE_DEPLOYMENT.md](apps/mobile/PLAY_STORE_DEPLOYMENT.md) for the full Play Store submission guide.

---

#### Local Development (Android Studio Emulator)

For testing with hot reload against your local API server (no EAS build needed).

**1. Update `.env` to point to local API:**

In `apps/mobile/.env`, change the API URL:

```bash
# 10.0.2.2 is the Android emulator's special address for host machine's localhost
EXPO_PUBLIC_API_URL="http://10.0.2.2:3001"
```

**2. Start the local API server:**

```bash
cd apps/api
bun run dev
```

**3. Run the app in the emulator:**

```bash
cd apps/mobile
bun run android
```

> **Switching back to production:** When done with local testing, change `.env` back to:
> ```
> EXPO_PUBLIC_API_URL="https://orbit-app.fly.dev"
> ```

> **Note:** Local development on a physical phone is possible if your phone is on the same WiFi network as your computer. Use your computer's local IP (e.g., `http://192.168.1.100:3001`). However, for physical device testing, it's usually easier to just deploy to Fly.io and use a development or preview build.

---

## Typical Deployment Scenarios

| I changed... | What to do |
|---|---|
| Only mobile UI code | `fly deploy` (rebuilds web + API image) |
| Only API code | `fly deploy` |
| Only DB schema | `cd apps/api && bun run db:generate && bun run db:migrate` |
| DB schema + API code | Migrate first, then deploy: `cd apps/api && bun run db:migrate && cd ../.. && fly deploy` |
| Mobile app (testing) | `fly deploy` then `cd apps/mobile && eas build --profile development --platform android` |
| Mobile app (release) | `fly deploy` then `cd apps/mobile && eas build --profile production --platform android` |
| Everything | Migrate → `fly deploy` → `eas build` |

## Quick Reference: Build Commands

```bash
# Backend + Web UI (from repo root)
fly deploy

# Mobile - Development build (from apps/mobile)
eas build --profile development --platform android

# Mobile - Preview build (from apps/mobile)
eas build --profile preview --platform android

# Mobile - Production build (from apps/mobile)
eas build --profile production --platform android
```
