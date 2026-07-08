// Better Auth session-verification middleware.
//
// Replaces the old Supabase JWT verification. `auth.api.getSession` reads the
// session from either the web cookie or the native `Authorization: Bearer`
// token (Expo plugin) — no branching needed. On success it exposes the
// authenticated user's id (and the user object) on the Hono context.
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { auth, type AuthSession } from "../lib/auth";

// Extend Hono context with the authenticated user.
declare module "hono" {
  interface ContextVariableMap {
    user: AuthSession["user"];
    userId: string;
  }
}

export const authMiddleware = createMiddleware(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });

  if (session?.user) {
    c.set("user", session.user);
    c.set("userId", session.user.id);
    return next();
  }

  // Local-dev / e2e fallback. Never active in production. Lets test scripts and
  // local tooling authenticate as a seeded user without the Google OAuth flow.
  if (process.env.NODE_ENV !== "production") {
    const devUserId = c.req.header("x-dev-user-id");
    if (devUserId) {
      c.set("userId", devUserId);
      return next();
    }
  }

  throw new HTTPException(401, { message: "Invalid or expired session" });
});

/**
 * Optional auth middleware - doesn't throw if there is no session.
 * Useful for routes that work with or without auth.
 */
export const optionalAuthMiddleware = createMiddleware(async (c, next) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (session?.user) {
      c.set("user", session.user);
      c.set("userId", session.user.id);
    }
  } catch {
    // Silently ignore auth errors for optional auth
  }

  await next();
});
