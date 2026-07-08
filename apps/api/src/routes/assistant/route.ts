import { Hono } from "hono";
import { z } from "zod";
import { and, asc, desc, eq } from "drizzle-orm";
import { authMiddleware } from "../../middleware/auth";
import { formatValidationErrors } from "../../utils/validation";
import { db, assistantConversations, assistantMessages } from "../../db";
import { assertConsentAndBudget, persistUserMessage, processAssistantChat, upsertConversation } from "./process";
import { getProviderApiKeyEnvGuard } from "./model";

const app = new Hono();

app.use("/*", authMiddleware);

// ── Chat endpoint (UI-message stream) ───────────────────────────────
const chatSchema = z.object({
  conversationId: z.string().min(1),
  messages: z.array(z.any()).min(1),
  timezone: z.string().optional(),
});

app.post("/chat", async (c) => {
  const userId = c.get("userId") as string;
  const guard = getProviderApiKeyEnvGuard();
  if (!guard.configured) {
    return c.json({ error: guard.message, code: "PROVIDER_NOT_CONFIGURED" }, 503);
  }

  const body = await c.req.json();
  const parsed = chatSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: formatValidationErrors(parsed.error) }, 400);
  }
  const { conversationId, messages, timezone } = parsed.data;

  const budget = await assertConsentAndBudget(userId);
  if (budget) {
    const status = budget.code === "CONSENT_REQUIRED" ? 403 : 402;
    return c.json(budget, status);
  }

  const lastUserMessage = [...messages].reverse().find((m: any) => m?.role === "user");
  if (!lastUserMessage) {
    return c.json({ error: "No user message" }, 400);
  }
  const firstUserText = Array.isArray(lastUserMessage.parts)
    ? lastUserMessage.parts
        .filter((p: any) => p?.type === "text")
        .map((p: any) => p.text)
        .join("\n")
        .trim()
    : "";

  const upsert = await upsertConversation(userId, conversationId, firstUserText);
  if ("error" in upsert) {
    const status = upsert.code === "FORBIDDEN" ? 403 : 402;
    return c.json(upsert, status);
  }

  await persistUserMessage(conversationId, lastUserMessage as any);
  return processAssistantChat({ userId, conversationId, messages: messages as any, timezone });
});

// ── Conversations CRUD ──────────────────────────────────────────────

app.get("/conversations", async (c) => {
  const userId = c.get("userId") as string;
  const rows = await db
    .select({
      id: assistantConversations.id,
      title: assistantConversations.title,
      titleGenerated: assistantConversations.titleGenerated,
      createdAt: assistantConversations.createdAt,
      updatedAt: assistantConversations.updatedAt,
    })
    .from(assistantConversations)
    .where(eq(assistantConversations.userId, userId))
    .orderBy(desc(assistantConversations.updatedAt))
    .limit(50);
  return c.json({ conversations: rows });
});

app.get("/conversations/:id", async (c) => {
  const userId = c.get("userId") as string;
  const id = c.req.param("id");
  const [conv] = await db
    .select()
    .from(assistantConversations)
    .where(and(eq(assistantConversations.id, id), eq(assistantConversations.userId, userId)))
    .limit(1);
  if (!conv) return c.json({ error: "Not found" }, 404);
  const msgs = await db
    .select({
      id: assistantMessages.id,
      role: assistantMessages.role,
      parts: assistantMessages.parts,
      content: assistantMessages.content,
      createdAt: assistantMessages.createdAt,
    })
    .from(assistantMessages)
    .where(eq(assistantMessages.assistantConversationId, id))
    .orderBy(asc(assistantMessages.createdAt));
  return c.json({ conversation: conv, messages: msgs });
});

const renameSchema = z.object({ title: z.string().min(1).max(200) });

app.patch("/conversations/:id", async (c) => {
  const userId = c.get("userId") as string;
  const id = c.req.param("id");
  const body = await c.req.json();
  const parsed = renameSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: formatValidationErrors(parsed.error) }, 400);
  const [conv] = await db
    .select({ id: assistantConversations.id })
    .from(assistantConversations)
    .where(and(eq(assistantConversations.id, id), eq(assistantConversations.userId, userId)))
    .limit(1);
  if (!conv) return c.json({ error: "Not found" }, 404);
  await db
    .update(assistantConversations)
    .set({ title: parsed.data.title, titleGenerated: true, updatedAt: new Date() })
    .where(eq(assistantConversations.id, id));
  return c.json({ ok: true });
});

app.delete("/conversations/:id", async (c) => {
  const userId = c.get("userId") as string;
  const id = c.req.param("id");
  const [conv] = await db
    .select({ id: assistantConversations.id })
    .from(assistantConversations)
    .where(and(eq(assistantConversations.id, id), eq(assistantConversations.userId, userId)))
    .limit(1);
  if (!conv) return c.json({ error: "Not found" }, 404);
  await db.delete(assistantMessages).where(eq(assistantMessages.assistantConversationId, id));
  await db.delete(assistantConversations).where(eq(assistantConversations.id, id));
  return c.json({ ok: true });
});

// ── Feedback ────────────────────────────────────────────────────────
const feedbackSchema = z.object({ thumbsUp: z.boolean().optional(), thumbsDown: z.boolean().optional() });

app.patch("/messages/:id/feedback", async (c) => {
  const userId = c.get("userId") as string;
  const id = c.req.param("id");
  const body = await c.req.json();
  const parsed = feedbackSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: formatValidationErrors(parsed.error) }, 400);

  const [msg] = await db
    .select({
      id: assistantMessages.id,
      convUserId: assistantConversations.userId,
    })
    .from(assistantMessages)
    .innerJoin(
      assistantConversations,
      eq(assistantMessages.assistantConversationId, assistantConversations.id)
    )
    .where(eq(assistantMessages.id, id))
    .limit(1);
  if (!msg || msg.convUserId !== userId) return c.json({ error: "Not found" }, 404);

  const patch: Record<string, unknown> = {};
  if (parsed.data.thumbsUp !== undefined) patch.thumbsUp = parsed.data.thumbsUp;
  if (parsed.data.thumbsDown !== undefined) patch.thumbsDown = parsed.data.thumbsDown;
  if (Object.keys(patch).length === 0) return c.json({ ok: true });
  await db.update(assistantMessages).set(patch).where(eq(assistantMessages.id, id));
  return c.json({ ok: true });
});

export default app;
