# Orbit Modern Stack - TODO

## ✅ Completed

- [x] Bun + Hono API backend with Drizzle ORM
- [x] All API routes (contacts, conversations, events, tags, relationships, assistant)
- [x] Supabase JWT auth middleware
- [x] Expo universal app (iOS, Android, Web)
- [x] Expo Router with file-based navigation
- [x] NativeWind (Tailwind CSS) styling
- [x] Supabase Auth integration
- [x] Contacts, Conversations, Events, Settings screens
- [x] AI Assistant chat interface
- [x] fly.io deployment configuration (Dockerfile, fly.toml)
- [x] Static file serving for Expo Web

## 🚧 Next Steps

### 1. Environment Setup
- [ ] Create `.env` files for both `apps/api` and `apps/mobile`
- [ ] Set up Supabase Auth with Google OAuth provider
- [ ] Configure Supabase redirect URLs for mobile app

### 2. Testing & Development
- [ ] Test API locally: `cd apps/api && bun run dev`
- [ ] Test mobile app locally: `cd apps/mobile && npm start`
- [ ] Test web build: `cd apps/mobile && npx expo export --platform web`
- [ ] Verify API endpoints work with Supabase Auth

### 3. Database Migration
- [ ] Run Drizzle migrations: `cd apps/api && bun run db:push`
- [ ] Verify schema matches Prisma schema
- [ ] Test all CRUD operations

### 4. Deployment
- [ ] Install flyctl: `brew install flyctl`
- [ ] Login to fly.io: `flyctl auth login`
- [ ] Launch app: `flyctl launch --name orbit-app --no-deploy`
- [ ] Set secrets:
  ```bash
  flyctl secrets set DATABASE_URL="..."
  flyctl secrets set SUPABASE_URL="..."
  flyctl secrets set SUPABASE_ANON_KEY="..."
  ```
- [ ] Deploy: `flyctl deploy`
- [ ] Test deployed app: `flyctl open`

### 5. Mobile App Features (Missing)
- [ ] Contact detail/edit screens
- [ ] Conversation create/edit forms
- [ ] Event create/edit forms
- [ ] Image upload for contacts
- [ ] Tag management UI
- [ ] Relationship management UI

### 6. Mobile App Deployment
- [ ] Set up EAS: `npm install -g eas-cli && eas login`
- [ ] Configure EAS: `eas build:configure`
- [ ] Build iOS: `eas build --platform ios`
- [ ] Build Android: `eas build --platform android`
- [ ] Submit to stores (requires developer accounts)

### 7. Web App Deployment (Alternative)
- [ ] Export web: `cd apps/mobile && npx expo export --platform web`
- [ ] Deploy to Vercel: `npx vercel dist/`
- [ ] Configure custom domain (optional)

### 8. Polish & Production
- [ ] Add error boundaries
- [ ] Add loading states everywhere
- [ ] Add pull-to-refresh on all lists
- [ ] Optimize images
- [ ] Add analytics (optional)
- [ ] Set up monitoring/logging

## 📝 Notes

- **API URL**: In production, API and Web are same origin (fly.io), so API client auto-detects
- **Auth**: Using Supabase Auth with Google OAuth (no NextAuth migration needed for new users)
- **Database**: Same Supabase PostgreSQL, just using Drizzle instead of Prisma
- **Storage**: Supabase Storage for contact images (already configured)

## 🔗 Useful Commands

```bash
# API Development
cd apps/api
bun run dev

# Mobile Development
cd apps/mobile
npm start          # Dev server
npm run web        # Web browser
npm run ios        # iOS simulator
npm run android    # Android emulator

# Database
cd apps/api
bun run db:push    # Push schema changes
bun run db:studio  # Open Drizzle Studio

# Deployment
flyctl deploy      # Deploy to fly.io
flyctl logs        # View logs
flyctl status      # Check status
```

## 🐛 Known Issues

- None yet (report as you find them!)

---

**Last Updated**: January 27, 2026
**Branch**: `modern-stack`
