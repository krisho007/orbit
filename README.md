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
- Mobile dev server uses Expo Go or simulators

## Deployment

See `apps/api/README.md` for API deployment instructions.
