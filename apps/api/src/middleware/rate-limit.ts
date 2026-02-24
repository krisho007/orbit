import { createMiddleware } from "hono/factory";

/**
 * In-memory sliding-window rate limiter.
 * Tracks request timestamps per key and rejects when the window limit is exceeded.
 */

interface WindowEntry {
  timestamps: number[];
}

const windows = new Map<string, WindowEntry>();

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of windows) {
    entry.timestamps = entry.timestamps.filter((t) => now - t < 120_000);
    if (entry.timestamps.length === 0) windows.delete(key);
  }
}, 5 * 60_000);

function isRateLimited(
  key: string,
  windowMs: number,
  maxRequests: number
): { limited: boolean; retryAfterMs: number } {
  const now = Date.now();
  let entry = windows.get(key);

  if (!entry) {
    entry = { timestamps: [] };
    windows.set(key, entry);
  }

  // Remove timestamps outside the window
  entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);

  if (entry.timestamps.length >= maxRequests) {
    const oldest = entry.timestamps[0]!;
    const retryAfterMs = oldest + windowMs - now;
    return { limited: true, retryAfterMs };
  }

  entry.timestamps.push(now);
  return { limited: false, retryAfterMs: 0 };
}

/**
 * Extract client identifier: userId if authenticated, otherwise IP.
 */
function getClientKey(c: any): string {
  // Prefer userId (set by auth middleware)
  try {
    const userId = c.get("userId");
    if (userId) return `user:${userId}`;
  } catch {
    // userId not set yet (middleware ordering)
  }

  // Fall back to IP (X-Forwarded-For on Fly.io, then remote address)
  const forwarded = c.req.header("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0]!.trim() : "unknown";
  return `ip:${ip}`;
}

/**
 * General rate limiter: 200 requests per minute per user/IP.
 */
export const rateLimiter = createMiddleware(async (c, next) => {
  const key = getClientKey(c);
  const { limited, retryAfterMs } = isRateLimited(
    `general:${key}`,
    60_000,
    200
  );

  if (limited) {
    c.header("Retry-After", String(Math.ceil(retryAfterMs / 1000)));
    return c.json({ error: "Too many requests" }, 429);
  }

  await next();
});

/**
 * Strict rate limiter for expensive endpoints (assistant, speech): 20 requests per minute.
 */
export const strictRateLimiter = createMiddleware(async (c, next) => {
  const key = getClientKey(c);
  const { limited, retryAfterMs } = isRateLimited(
    `strict:${key}`,
    60_000,
    20
  );

  if (limited) {
    c.header("Retry-After", String(Math.ceil(retryAfterMs / 1000)));
    return c.json({ error: "Too many requests" }, 429);
  }

  await next();
});
