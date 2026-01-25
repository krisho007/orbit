// Hono API Server - Orbit Personal CRM
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { HTTPException } from "hono/http-exception";

// Import routes
import contactsRouter from "./routes/contacts";
import conversationsRouter from "./routes/conversations";
import eventsRouter from "./routes/events";
import tagsRouter from "./routes/tags";
import relationshipsRouter from "./routes/relationships";
import assistantRouter from "./routes/assistant";

const app = new Hono();

// Middleware
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: "*", // Configure for production
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    exposeHeaders: ["Content-Length"],
    maxAge: 86400,
    credentials: true,
  })
);

// Health check endpoint
app.get("/", (c) => {
  return c.json({
    name: "Orbit API",
    version: "1.0.0",
    status: "healthy",
    timestamp: new Date().toISOString(),
  });
});

app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

// API Routes
app.route("/api/contacts", contactsRouter);
app.route("/api/conversations", conversationsRouter);
app.route("/api/events", eventsRouter);
app.route("/api/tags", tagsRouter);
app.route("/api/relationships", relationshipsRouter);
app.route("/api/assistant", assistantRouter);

// Global error handler
app.onError((err, c) => {
  console.error("Unhandled error:", err);

  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }

  return c.json({ error: "Internal server error" }, 500);
});

// 404 handler
app.notFound((c) => {
  return c.json({ error: "Not found" }, 404);
});

// Export for Bun
export default {
  port: process.env.PORT || 3001,
  fetch: app.fetch,
};

console.log(`🚀 Orbit API server running on port ${process.env.PORT || 3001}`);
