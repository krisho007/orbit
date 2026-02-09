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

### 4. Running on Your Personal Mobile Phone

You have two options depending on what you need:

#### Option A: Development Build (recommended for testing)

This creates an APK you can install directly on your phone.

```bash
cd apps/mobile

# Build a preview APK (installable directly, no Play Store needed)
eas build --platform android --profile preview
```

Once the build completes:
1. Open the link that EAS prints, or go to [expo.dev](https://expo.dev) → your project → Builds
2. Download the `.apk` file to your phone
3. Open it to install (you may need to allow "Install from unknown sources" in Android settings)

> **Make sure** your `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_SUPABASE_URL` EAS secrets point
> to your production Fly.io and Supabase URLs:
> ```bash
> eas secret:create --name EXPO_PUBLIC_API_URL --value "https://orbit-app.fly.dev"
> eas secret:create --name EXPO_PUBLIC_SUPABASE_URL --value "https://your-project.supabase.co"
> eas secret:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "your-anon-key"
> ```

#### Option B: Production Build (Play Store)

See [apps/mobile/PLAY_STORE_DEPLOYMENT.md](apps/mobile/PLAY_STORE_DEPLOYMENT.md) for the full Play Store submission guide.

```bash
cd apps/mobile

# Build production AAB
eas build --platform android --profile production

# Submit to Play Store (requires service account setup)
eas submit --platform android --profile production
```

#### Option C: Local Development on Phone

If you want to run the dev version on your phone (with hot reload):

1. Connect your phone via USB and enable USB debugging
2. Run:
   ```bash
   cd apps/mobile
   bun run android
   ```
3. This installs a development build on your phone that connects to your local dev server

> Your phone and computer must be on the same network. The mobile app's `EXPO_PUBLIC_API_URL`
> should point to your computer's local IP (e.g. `http://192.168.1.100:3001`).

---

## Typical Deployment Scenarios

| I changed... | What to do |
|---|---|
| Only mobile UI code | `./scripts/deploy-fly.sh` (rebuilds web + API image) |
| Only API code | `./scripts/deploy-fly.sh` |
| Only DB schema | `cd apps/api && bun run db:generate && bun run db:migrate` |
| DB schema + API code | Migrate first, then deploy: `cd apps/api && bun run db:migrate && cd ../.. && ./scripts/deploy-fly.sh` |
| Mobile-only features (no web) | `cd apps/mobile && eas build --platform android --profile preview` |
| Everything | Migrate → Deploy Fly.io → Build mobile |
