// Hono API Server - Orbit Personal CRM
import { Hono } from "hono";
import type { Context } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { serveStatic } from "hono/bun";
import { secureHeaders } from "hono/secure-headers";

// Import routes
import contactsRouter from "./routes/contacts";
import conversationsRouter from "./routes/conversations";
import eventsRouter from "./routes/events";
import tagsRouter from "./routes/tags";
import relationshipsRouter from "./routes/relationships";
import assistantRouter from "./routes/assistant";
import remindersRouter from "./routes/reminders";
import usersRouter from "./routes/users";
import speechRouter from "./routes/speech";
import imagesRouter from "./routes/images";
import { rateLimiter, strictRateLimiter } from "./middleware/rate-limit";
import { auth } from "./lib/auth";

const app = new Hono();

// Middleware
app.use("*", logger());
app.use(
  "*",
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.sarvam.ai"],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
      frameAncestors: ["'none'"],
    },
    xFrameOptions: "DENY",
    xContentTypeOptions: "nosniff",
    referrerPolicy: "strict-origin-when-cross-origin",
    crossOriginOpenerPolicy: "same-origin",
  })
);
app.use("/api/*", bodyLimit({ maxSize: 8 * 1024 * 1024 })); // 8MB body limit

const ALLOWED_ORIGINS = (
  process.env.CORS_ALLOWED_ORIGINS ||
  "http://localhost:8081,http://localhost:3001,http://localhost:19006,https://orbit-app.fly.dev,https://www.myorbit360.com,https://myorbit360.com"
).split(",");

app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) return origin;
      return null;
    },
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    exposeHeaders: ["Content-Length"],
    maxAge: 86400,
    credentials: true,
  })
);

// Health check endpoint
app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

// API info endpoint (kept off "/" so web UI can serve there)
app.get("/api", (c) => {
  return c.json({
    name: "Orbit API",
    version: "1.0.0",
    status: "healthy",
    timestamp: new Date().toISOString(),
  });
});

// Better Auth owns everything under /api/auth/* — sign-in, OAuth callback,
// session, sign-out. Mounted BEFORE the rate limiter and the auth-gated routes
// so unauthenticated users can complete sign-in (Better Auth has its own rate
// limiting, so we deliberately don't apply orbit's limiter here).
app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

// Rate limiting
app.use("/api/*", rateLimiter); // 200 req/min general
app.use("/api/assistant/*", strictRateLimiter); // 20 req/min for LLM endpoints
app.use("/api/speech/*", strictRateLimiter); // 20 req/min for speech endpoints

// API Routes
app.route("/api/contacts", contactsRouter);
app.route("/api/conversations", conversationsRouter);
app.route("/api/events", eventsRouter);
app.route("/api/tags", tagsRouter);
app.route("/api/relationships", relationshipsRouter);
app.route("/api/assistant", assistantRouter);
app.route("/api/reminders", remindersRouter);
app.route("/api/users", usersRouter);
app.route("/api/speech", speechRouter);
// Public image bytes (no auth — capability URL by unguessable id)
app.route("/api/images", imagesRouter);

// Global error handler
app.onError((err, c) => {
  console.error("Unhandled error:", err);

  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }

  return c.json({ error: "Internal server error" }, 500);
});

// Landing page (skip if OAuth callback with ?code= so the SPA can handle it)
const landingHtml = await Bun.file(import.meta.dir + "/landing.html").text();
app.get("/", (c, next) => {
  if (c.req.query("code")) return next();
  return c.html(landingHtml);
});

// Privacy policy page
const privacyHtml = await Bun.file(import.meta.dir + "/privacy.html").text();
app.get("/privacy", (c) => c.html(privacyHtml));

// Cache-Control for the Expo Web + PWA static assets.
// - Content-hashed bundles under /_expo/static/* never change for a given URL →
//   cache them forever (immutable). A UI change produces a new hashed URL.
// - Everything else (index.html, sw.js, manifest.json, icons) must revalidate so a
//   new deploy — and a new service worker — is picked up on the very next load.
const IMMUTABLE = "public, max-age=31536000, immutable";
const REVALIDATE = "no-cache, must-revalidate";
const setStaticCacheHeaders = (path: string, c: Context) => {
  c.header("Cache-Control", path.includes("/_expo/static/") ? IMMUTABLE : REVALIDATE);
};

// Serve Expo Web static files (after API routes)
// This serves the web UI for all non-API routes
app.use("*", serveStatic({ root: "./public", onFound: setStaticCacheHeaders }));

// SPA fallback - serve index.html for client-side routing
app.use(
  "*",
  serveStatic({ root: "./public", path: "index.html", onFound: setStaticCacheHeaders })
);

// 404 handler (only for API routes that don't exist)
app.notFound((c) => {
  // If it's an API request, return JSON error
  if (c.req.path === "/api" || c.req.path.startsWith("/api/")) {
    return c.json({ error: "Not found" }, 404);
  }
  // For other routes, the static file handler above should catch them
  return c.json({ error: "Not found" }, 404);
});

// Export for Bun
export default {
  port: process.env.PORT || 3001,
  fetch: app.fetch,
  idleTimeout: 120, // seconds — LLM streaming responses need >10s default
};

console.log(`🚀 Orbit API server running on port ${process.env.PORT || 3001}`);
