// Better Auth — Google OAuth for Orbit.
//
// Replaces Supabase Auth. Owns everything under /api/auth/* (sign-in, OAuth
// callback, session, sign-out) via `auth.handler`, mounted in src/index.ts.
// Sessions are verified per-request in middleware/auth.ts through
// `auth.api.getSession`, which transparently accepts both the web session
// cookie and the native `Authorization: Bearer` token (Expo plugin).
//
// Google provider tokens (access + refresh) are persisted by Better Auth in the
// `accounts` table with the requested Contacts scope, and refreshed on demand
// via `auth.api.getAccessToken` (see utils/google-token.ts) — this is what keeps
// the Google Contacts import working after the Supabase removal.
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { expo } from "@better-auth/expo";
import { db } from "../db";

// The extra Google scope Orbit needs beyond openid/email/profile: read-only
// access to the user's Google Contacts, used by the Contacts import flow.
export const GOOGLE_CONTACTS_SCOPE =
  "https://www.googleapis.com/auth/contacts.readonly";

// Origins allowed to initiate/complete auth. Includes the web app origins and
// the mobile deep-link scheme so the Expo native flow can round-trip back into
// the app. The Expo plugin also contributes the scheme automatically.
const trustedOrigins = (
  process.env.CORS_ALLOWED_ORIGINS ||
  "http://localhost:8081,http://localhost:3001,http://localhost:19006,https://orbit-app.fly.dev,https://www.myorbit360.com,https://myorbit360.com"
)
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean)
  .concat(["orbit://", "orbit://*"]);

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    // Orbit's tables are plural (users/sessions/accounts/verifications); Better
    // Auth resolves them from the full drizzle schema passed to drizzle().
    usePlural: true,
  }),
  secret:
    process.env.BETTER_AUTH_SECRET ??
    (() => {
      if (process.env.NODE_ENV === "production") {
        throw new Error("BETTER_AUTH_SECRET is required in production");
      }
      console.warn(
        "[auth] BETTER_AUTH_SECRET is unset — using an insecure dev placeholder"
      );
      return "dev-placeholder-secret-do-not-ship";
    })(),
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3001",
  trustedOrigins,
  // In production the app is reachable at both the apex and www
  // (myorbit360.com / www.myorbit360.com). Set COOKIE_DOMAIN=".myorbit360.com"
  // so the session cookie is shared across both and sign-in works either way.
  // Unset in dev (host-only cookie on localhost).
  ...(process.env.COOKIE_DOMAIN
    ? {
        advanced: {
          crossSubDomainCookies: { enabled: true, domain: process.env.COOKIE_DOMAIN },
        },
      }
    : {}),
  // Link a Google sign-in to the pre-existing user row with the same email,
  // preserving the owner's existing userId (and therefore all their CRM data)
  // across the Supabase → Better Auth migration.
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["google"],
    },
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      // Extra scope beyond the defaults so the Contacts import keeps working.
      scope: [GOOGLE_CONTACTS_SCOPE],
      // Ask for a refresh token (offline) and force the consent screen so Google
      // actually returns one — without this refresh tokens are only issued on the
      // very first consent and the stored token can't be refreshed later.
      accessType: "offline",
      prompt: "select_account consent",
    },
  },
  plugins: [expo()],
});

export type AuthSession = typeof auth.$Infer.Session;
