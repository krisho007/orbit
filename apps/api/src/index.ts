// Hono API Server - Orbit Personal CRM
import { Hono } from "hono";
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
import { rateLimiter, strictRateLimiter } from "./middleware/rate-limit";

const app = new Hono();

// Middleware
app.use("*", logger());
app.use(
  "*",
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://*.supabase.co", "https://api.sarvam.ai"],
      fontSrc: ["'self'", "data:"],
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

// Serve Expo Web static files (after API routes)
// This serves the web UI for all non-API routes
app.use("*", serveStatic({ root: "./public" }));

// SPA fallback - serve index.html for client-side routing
app.use("*", serveStatic({ root: "./public", path: "index.html" }));

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
