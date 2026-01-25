# Orbit Deployment Guide (fly.io)

This guide explains how to deploy the Orbit app (API + Web UI) to fly.io.

## Architecture

```
┌─────────────────────────────────────────┐
│            fly.io (single app)          │
│  ┌───────────────────────────────────┐  │
│  │         Bun + Hono Server         │  │
│  │                                   │  │
│  │  /api/*  → API Routes             │  │
│  │  /*      → Expo Web (static)      │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
                    │
                    ▼
         ┌──────────────────┐
         │ Supabase Cloud   │
         │ - PostgreSQL     │
         │ - Auth           │
         │ - Storage        │
         └──────────────────┘
```

## Prerequisites

1. [fly.io account](https://fly.io) (free tier available)
2. [flyctl CLI](https://fly.io/docs/hands-on/install-flyctl/)
3. Supabase project with:
   - Database URL
   - Anon Key
   - Google OAuth configured

## Deployment Steps

### 1. Install flyctl

```bash
# macOS
brew install flyctl

# Linux
curl -L https://fly.io/install.sh | sh

# Windows
powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"
```

### 2. Login to fly.io

```bash
flyctl auth login
```

### 3. Launch the App (First Time)

From the repository root:

```bash
# Create the app (choose a unique name)
flyctl launch --name your-orbit-app --no-deploy

# This will detect fly.toml and configure your app
```

### 4. Set Environment Variables (Secrets)

```bash
# Database connection (from Supabase)
flyctl secrets set DATABASE_URL="postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true"

# Supabase Auth (from Supabase dashboard → Settings → API)
flyctl secrets set SUPABASE_URL="https://[project-ref].supabase.co"
flyctl secrets set SUPABASE_ANON_KEY="your-anon-key"
```

### 5. Deploy

```bash
flyctl deploy
```

This will:
1. Build Expo Web (static files)
2. Build Hono API with Bun
3. Combine them into a single container
4. Deploy to fly.io

### 6. Open Your App

```bash
flyctl open
```

Your app is now live at `https://your-orbit-app.fly.dev`

## Subsequent Deployments

After the initial setup, just run:

```bash
flyctl deploy
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | Supabase PostgreSQL connection string | Yes |
| `SUPABASE_URL` | Supabase project URL | Yes |
| `SUPABASE_ANON_KEY` | Supabase anonymous key | Yes |
| `PORT` | Server port (set automatically) | No |

## Custom Domain

To add a custom domain:

```bash
# Add certificate
flyctl certs create yourdomain.com

# Add DNS records as instructed
```

## Scaling

```bash
# Scale to 2 machines
flyctl scale count 2

# Increase memory
flyctl scale memory 1024
```

## Monitoring

```bash
# View logs
flyctl logs

# Check app status
flyctl status

# SSH into container
flyctl ssh console
```

## Troubleshooting

### Build fails
- Check that all dependencies are installed
- Ensure Expo Web builds locally: `cd apps/mobile && npx expo export --platform web`

### Database connection errors
- Verify DATABASE_URL is correct
- Ensure Supabase allows connections from fly.io IPs

### Auth not working
- Check SUPABASE_URL and SUPABASE_ANON_KEY are set correctly
- Verify Google OAuth is configured in Supabase dashboard

## Local Development

To test the production build locally:

```bash
# Build the Docker image
docker build -f apps/api/Dockerfile -t orbit .

# Run with environment variables
docker run -p 3000:3000 \
  -e DATABASE_URL="your-db-url" \
  -e SUPABASE_URL="your-supabase-url" \
  -e SUPABASE_ANON_KEY="your-anon-key" \
  orbit
```

Visit `http://localhost:3000`
