import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { authMiddleware } from "../../middleware/auth";
import type { ChatMessage } from "./types";
import { chatSchema } from "./types";
import { processMessageLLM } from "./process-message";
import { db, users } from "../../db";

const app = new Hono();

app.use("/*", authMiddleware);

// POST /api/assistant - Process chat message
app.post("/", async (c) => {
  const userId = c.get("userId");

  // Check third-party consent before processing
  const [user] = await db
    .select({ thirdPartyConsentGranted: users.thirdPartyConsentGranted })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user?.thirdPartyConsentGranted) {
    return c.json({ error: "AI consent required", code: "CONSENT_REQUIRED" }, 403);
  }

  const body = await c.req.json();

  const validation = chatSchema.safeParse(body);
  if (!validation.success) {
    console.warn("[assistant] Invalid request body:", JSON.stringify(validation.error.issues));
    return c.json({ error: validation.error.issues }, 400);
  }

  const { messages } = validation.data;

  // Get the last user message
  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");

  if (!lastUserMessage) {
    console.warn("[assistant] No user message found in request");
    return c.json({ error: "No user message provided" }, 400);
  }

  console.log(`\n${"=".repeat(70)}`);
  console.log(`[assistant] 💬 User question: "${lastUserMessage.content}"`);
  console.log(`[assistant] Chat history: ${messages.length} message(s)`);
  console.log(`${"=".repeat(70)}`);

  const startTime = Date.now();

  try {
    const response = await processMessageLLM(userId, messages as ChatMessage[]);

    const elapsed = Date.now() - startTime;
    console.log(`[assistant] ✅ Response (${elapsed}ms): "${response.text.substring(0, 200)}${response.text.length > 200 ? "..." : ""}"`);
    if (response.ui) {
      console.log(`[assistant] 🎨 UI attached: kind=${response.ui.kind}`);
    }
    console.log(`${"=".repeat(70)}\n`);

    return c.json({
      role: "assistant",
      content: response.text,
      ui: response.ui,
    });
  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`[assistant] ❌ Error after ${elapsed}ms:`, error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ error: `Failed to process message: ${message}` }, 500);
  }
});

export default app;
