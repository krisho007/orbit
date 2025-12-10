# Orbit - Personal CRM SaaS

Orbit is a production-ready, multi-tenant personal CRM application that helps users manage their contacts, conversations, events, and relationships.

> **💡 Cloud-First Architecture**: Orbit connects to **Supabase for everything** (database + storage), even during local development. No local PostgreSQL installation required! This ensures consistency across all environments and makes setup a breeze.

## Tech Stack

- **Frontend**: Next.js 15 (App Router), TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes, Server Actions
- **Database**: PostgreSQL (Supabase) with Prisma ORM
- **Authentication**: Auth.js v5 (NextAuth) with Google OAuth
- **Storage**: Supabase Storage for images
- **AI**: OpenAI API for intelligent assistant
- **Deployment**: Vercel-ready
- **PWA**: Manifest + Service Worker for installability

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                   Your Computer                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Next.js App (localhost:3000)                     │  │
│  │                                                   │  │
│  │  • React Components                               │  │
│  │  • Server Actions                                 │  │
│  │  • API Routes                                     │  │
│  └───────────────┬────────────────┬──────────────────┘  │
│                  │                │                      │
└──────────────────┼────────────────┼──────────────────────┘
                   │                │
                   │ HTTPS          │ HTTPS
                   ▼                ▼
   ┌───────────────────────┐  ┌──────────────────────┐
   │   Supabase Cloud      │  │   OpenAI API         │
   │                       │  │                      │
   │ • PostgreSQL Database │  │ • GPT-4              │
   │ • File Storage        │  │ • Assistant API      │
   │ • Connection Pooler   │  └──────────────────────┘
   └───────────────────────┘
```

**Key Points:**
- **No local database** - connects directly to Supabase PostgreSQL
- **Same setup** for development and production
- **Prisma ORM** manages database schema and queries
- **Supabase Storage** handles file uploads (contact images)

## Features

### Core Features
- ✅ **Authentication**: Google OAuth with secure session management
- ✅ **Contacts Management**: Full CRUD with search, filtering, and tagging
- ✅ **Conversations**: Track interactions with medium types (phone, WhatsApp, email, etc.)
- ✅ **Events**: Calendar events with participants and linked conversations
- ✅ **Relationships**: Define connections between contacts (family, colleagues, friends)
- ✅ **Tags**: Organize contacts with custom tags
- ✅ **Social Links**: Store LinkedIn, Facebook, website links per contact
- ✅ **Images**: Upload up to 2 images per contact (Supabase Storage)
- ✅ **AI Assistant**: Natural language interface to create/query data
- ✅ **Settings**: Profile management and tag customization
- ✅ **Legal Pages**: Public privacy policy and terms of service pages

### Architecture Features
- ✅ **Multi-tenancy**: All data scoped by userId
- ✅ **Mobile-first**: Responsive design with bottom nav on mobile, sidebar on desktop
- ✅ **PWA Support**: Installable on mobile devices
- ✅ **Security**: Protected routes, server-side validation, ownership checks
- ✅ **Type Safety**: Full TypeScript coverage
- ✅ **Production Ready**: Error boundaries, 404 pages, proper logging

## 🚀 Getting Started

**New to Orbit?** Start here → [`GETTING_STARTED.md`](./GETTING_STARTED.md)

### Quick Setup (15 minutes)

1. **Create Supabase project** (free)
2. **Setup Google OAuth**
3. **Configure `.env.local`**
4. **Run migrations**
5. **Start app!**

📖 **Detailed guide:** [`QUICKSTART.md`](./QUICKSTART.md)

### Prerequisites

- Node.js 18+ and npm
- Supabase account and project (for both database and storage)
- Google OAuth credentials
- OpenAI API key

**📘 Important**: This project uses Supabase for the database even in local development - **no local PostgreSQL installation needed!** See [`SUPABASE_SETUP.md`](./SUPABASE_SETUP.md) for detailed configuration guide.

### 2. Clone and Install

```bash
git clone <your-repo>
cd orbit
npm install
```

### 3. Environment Variables

Create `.env.local` and fill in your Supabase credentials:

```env
# Supabase Database (from Settings → Database → Connection String)
# Use the connection pooler URL for better performance
DATABASE_URL="postgresql://postgres.xxxxx:password@aws-0-region.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"

# Auth.js v5
AUTH_SECRET="generate-with-openssl-rand-base64-32"  # Run: openssl rand -base64 32
AUTH_GOOGLE_ID="your-google-oauth-client-id"
AUTH_GOOGLE_SECRET="your-google-oauth-client-secret"

# Supabase API & Storage (from Settings → API)
NEXT_PUBLIC_SUPABASE_URL="https://xxxxx.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-supabase-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-supabase-service-role-key"

# OpenAI
OPENAI_API_KEY="your-openai-api-key"

# App URL (local development)
NEXTAUTH_URL="http://localhost:3000"
```

### 4. Database Setup

```bash
# Generate Prisma client
npx prisma generate

# Create and run migrations
npx prisma migrate dev --name init

# Optional: Open Prisma Studio to view data
npx prisma studio
```

### 5. Supabase Setup

**Database is already configured** via the `DATABASE_URL` above. For storage:

1. Go to your Supabase project
2. Navigate to Storage section
3. Create a storage bucket named `orbit`
4. Set bucket to **public**
5. No additional policies needed for basic functionality

### 6. Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Google+ API
4. Create OAuth 2.0 credentials
5. Add authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
6. For production, add your production URL

### 7. PWA Icons

Replace placeholder icon files with actual PNG images:
- `/public/icon-192.png` - 192x192px
- `/public/icon-512.png` - 512x512px

### 8. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Project Structure

```
orbit/
├── app/
│   ├── (auth)/                 # Public routes (landing page)
│   ├── (app)/                  # Protected routes
│   │   ├── contacts/           # Contacts CRUD
│   │   ├── conversations/      # Conversations CRUD
│   │   ├── events/             # Events CRUD
│   │   ├── assistant/          # AI Assistant
│   │   └── settings/           # Settings & tags
│   ├── api/
│   │   ├── auth/               # NextAuth handlers
│   │   └── assistant/          # AI assistant endpoint
│   ├── privacy/                # Privacy policy (public)
│   ├── terms/                  # Terms of service (public)
│   ├── layout.tsx              # Root layout with PWA
│   └── globals.css             # Tailwind styles
├── components/
│   ├── app-shell.tsx           # Main navigation layout
│   ├── contacts/               # Contact components
│   ├── conversations/          # Conversation components
│   ├── events/                 # Event components
│   ├── settings/               # Settings components
│   └── assistant/              # Assistant chat UI
├── lib/
│   ├── prisma.ts               # Prisma client singleton
│   └── supabase.ts             # Supabase storage utilities
├── prisma/
│   └── schema.prisma           # Database schema
├── public/
│   ├── manifest.json           # PWA manifest
│   └── sw.js                   # Service worker
├── auth.ts                     # Auth.js configuration
└── middleware.ts               # Route protection
```

## Database Schema

### Core Models
- **User**: NextAuth user with email/OAuth
- **Contact**: People in your network
- **Tag**: Custom labels for contacts
- **ContactTag**: Many-to-many join table
- **Conversation**: Interaction records
- **ConversationParticipant**: Who was in the conversation
- **Event**: Calendar events
- **EventParticipant**: Who attended the event
- **Relationship**: Connections between contacts
- **SocialLink**: External links per contact
- **ContactImage**: Images for contacts

### Multi-Tenancy
Every model (except NextAuth models) includes `userId` field. All queries are scoped by `session.user.id` to ensure complete data isolation.

## API Routes

### Authentication
- `GET/POST /api/auth/*` - NextAuth handlers (managed by Auth.js)

### AI Assistant
- `POST /api/assistant` - Process natural language requests
  - Body: `{ messages: Message[] }`
  - Returns: `{ message: string, actions: Action[] }`

Supported intents:
- Create conversations
- Query conversations
- Create events
- Query events

## Deployment

### Vercel (Recommended)

1. Push code to GitHub
2. Import project in Vercel
3. Add environment variables
4. Deploy

See [`DEPLOYMENT.md`](./DEPLOYMENT.md) for complete deployment instructions.

### Environment Variables in Production

Make sure to set all production URLs:
- `NEXTAUTH_URL` = your production domain
- Google OAuth redirect URI = `https://yourdomain.com/api/auth/callback/google`
- Use separate Supabase project for production

### Database

**Recommended**: Use Supabase for production (same as development)
- Already configured and tested
- Easy to scale
- Built-in backups
- Monitoring included

See [`SUPABASE_SETUP.md`](./SUPABASE_SETUP.md) for details.

## Security Features

✅ All routes protected by middleware (except landing page and legal pages)
✅ Public access to Privacy Policy and Terms of Service
✅ Server-side session validation
✅ userId scoping on all database queries
✅ Ownership verification before updates/deletes
✅ Input validation with Zod
✅ SQL injection protection via Prisma
✅ CSRF protection via NextAuth
✅ Rate limiting consideration (add as needed)

## AI Assistant Usage

Example queries:
- "I had a phone call with John yesterday about the project"
- "Create a meeting with Sarah next Friday at 2pm"
- "What conversations did I have with Mike?"
- "Show me my recent events"

The assistant will:
1. Parse natural language
2. Extract entities (names, dates, mediums)
3. Fuzzy match contact names
4. Create/query database records
5. Return structured results

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - feel free to use for personal or commercial projects

## Support

For issues or questions:
- Check the code documentation
- Review Prisma schema for data model
- Check Auth.js v5 docs for authentication issues
- Review OpenAI function calling docs for assistant modifications
