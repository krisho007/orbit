# Orbit

Personal CRM application built with a modern stack.

## Architecture

```
orbit/
├── apps/
│   ├── api/      # Bun + Hono + Drizzle backend
│   └── mobile/   # Expo React Native app (iOS, Android, Web)
```

## Tech Stack

- **API**: Bun, Hono, Drizzle ORM, PostgreSQL (Supabase)
- **Mobile**: Expo, React Native, NativeWind (Tailwind CSS)
- **Auth**: Supabase Auth
- **Deployment**: fly.io (API), EAS (Mobile)

## Getting Started

### API

```bash
cd apps/api
cp .env.example .env
# Configure your .env
bun install
bun run dev
```

### Mobile

```bash
cd apps/mobile
cp .env.example .env
# Configure your .env
npm install
npm start
```

## Development

- API runs on `http://localhost:3000`
- OAuth is not supported in Expo Go. For local OAuth testing, use `npx expo run:android` (or an iOS simulator build) instead of Expo Go.

## Deployment

See `apps/api/README.md` for API deployment instructions.
