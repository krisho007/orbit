// Supabase Auth JWT Verification Middleware
import { createMiddleware } from "hono/factory";
import { createClient, User } from "@supabase/supabase-js";
import { HTTPException } from "hono/http-exception";
import { db, users } from "../db";
import { eq } from "drizzle-orm";

// Extend Hono context with user
declare module "hono" {
  interface ContextVariableMap {
    user: User;
    userId: string;
  }
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase URL or Anon Key not configured. Auth middleware will fail.");
}

/**
 * Auth middleware that verifies Supabase JWT tokens
 * Extracts user from the Authorization header and sets it in context
 * 
 * Important: This middleware resolves the user by email to support
 * both Supabase Auth (UUIDs) and NextAuth (CUIDs) user IDs.
 */
export const authMiddleware = createMiddleware(async (c, next) => {
  const authHeader = c.req.header("Authorization");

  if (!authHeader) {
    throw new HTTPException(401, { message: "Missing Authorization header" });
  }

  if (!authHeader.startsWith("Bearer ")) {
    throw new HTTPException(401, { message: "Invalid Authorization header format" });
  }

  const token = authHeader.slice(7);

  if (!token) {
    throw new HTTPException(401, { message: "Missing token" });
  }

  try {
    const supabase = createClient(supabaseUrl!, supabaseAnonKey!);
    
    // Verify the JWT and get user
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error) {
      console.error("Auth error:", error.message);
      throw new HTTPException(401, { message: "Invalid or expired token" });
    }

    if (!user || !user.email) {
      throw new HTTPException(401, { message: "User not found" });
    }

    // Look up the user by email in our database to get the correct userId
    // This supports both Supabase Auth (UUID) and NextAuth (CUID) users
    let userId = user.id;
    
    const [dbUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, user.email))
      .limit(1);

    if (dbUser) {
      // Use the existing user's ID (CUID from NextAuth)
      userId = dbUser.id;
    } else {
      // Create a new user record with Supabase's UUID
      const [newUser] = await db
        .insert(users)
        .values({
          id: user.id,
          email: user.email,
          name: user.user_metadata?.full_name || user.user_metadata?.name || null,
          image: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
        })
        .returning({ id: users.id });
      
      if (newUser) {
        userId = newUser.id;
      }
    }

    // Set user in context for route handlers
    c.set("user", user);
    c.set("userId", userId);

    await next();
  } catch (err) {
    if (err instanceof HTTPException) {
      throw err;
    }
    console.error("Auth middleware error:", err);
    throw new HTTPException(500, { message: "Authentication failed" });
  }
});

/**
 * Optional auth middleware - doesn't throw if no token
 * Useful for routes that work with or without auth
 */
export const optionalAuthMiddleware = createMiddleware(async (c, next) => {
  const authHeader = c.req.header("Authorization");

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);

    if (token && supabaseUrl && supabaseAnonKey) {
      try {
        const supabase = createClient(supabaseUrl, supabaseAnonKey);
        const { data: { user } } = await supabase.auth.getUser(token);

        if (user) {
          c.set("user", user);
          c.set("userId", user.id);
        }
      } catch {
        // Silently ignore auth errors for optional auth
      }
    }
  }

  await next();
});
