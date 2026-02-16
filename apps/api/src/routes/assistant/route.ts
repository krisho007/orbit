import { Hono } from "hono";
import { eq, and, desc, asc, lt } from "drizzle-orm";
import { authMiddleware } from "../../middleware/auth";
import type { ChatMessage } from "./types";
import { chatSchema } from "./types";
import { processMessageLLM } from "./process-message";
import {
  db,
  users,
  assistantConversations,
  assistantMessages,
  contacts,
  conversations,
  events,
  reminders,
} from "../../db";

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

  const { messages, conversationId } = validation.data;

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
    // Resolve or create assistant conversation
    let assistantConvId: string;

    if (conversationId) {
      // Verify ownership
      const [existing] = await db
        .select({ id: assistantConversations.id })
        .from(assistantConversations)
        .where(
          and(
            eq(assistantConversations.id, conversationId),
            eq(assistantConversations.userId, userId)
          )
        )
        .limit(1);

      if (!existing) {
        return c.json({ error: "Conversation not found" }, 404);
      }
      assistantConvId = existing.id;

      // Update updatedAt timestamp
      await db
        .update(assistantConversations)
        .set({ updatedAt: new Date() })
        .where(eq(assistantConversations.id, assistantConvId));
    } else {
      // Create new conversation with auto-title from first user message
      const title = lastUserMessage.content.substring(0, 100);
      const [newConv] = await db
        .insert(assistantConversations)
        .values({ userId, title })
        .returning();
      assistantConvId = newConv.id;
    }

    // Save user message
    await db.insert(assistantMessages).values({
      assistantConversationId: assistantConvId,
      role: "user",
      content: lastUserMessage.content,
    });

    const response = await processMessageLLM(
      userId,
      messages as ChatMessage[],
      undefined,
      assistantConvId
    );

    // Save assistant response
    await db.insert(assistantMessages).values({
      assistantConversationId: assistantConvId,
      role: "assistant",
      content: response.text,
      ui: response.ui ? JSON.stringify(response.ui) : null,
    });

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
      conversationId: assistantConvId,
    });
  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`[assistant] ❌ Error after ${elapsed}ms:`, error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ error: `Failed to process message: ${message}` }, 500);
  }
});

// GET /api/assistant/conversations - List conversations (cursor-paginated)
app.get("/conversations", async (c) => {
  const userId = c.get("userId");
  const cursor = c.req.query("cursor");
  const limit = Math.min(parseInt(c.req.query("limit") || "20", 10), 50);

  let cursorDate: Date | undefined;
  if (cursor) {
    const [cursorConv] = await db
      .select({ updatedAt: assistantConversations.updatedAt })
      .from(assistantConversations)
      .where(
        and(
          eq(assistantConversations.id, cursor),
          eq(assistantConversations.userId, userId)
        )
      )
      .limit(1);
    if (cursorConv) {
      cursorDate = cursorConv.updatedAt;
    }
  }

  const conditions = [eq(assistantConversations.userId, userId)];
  if (cursorDate) {
    conditions.push(lt(assistantConversations.updatedAt, cursorDate));
  }

  const rows = await db
    .select()
    .from(assistantConversations)
    .where(and(...conditions))
    .orderBy(desc(assistantConversations.updatedAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  // Fetch last message preview for each conversation
  const conversationsWithPreview = await Promise.all(
    items.map(async (conv) => {
      const [lastMsg] = await db
        .select({
          content: assistantMessages.content,
          role: assistantMessages.role,
        })
        .from(assistantMessages)
        .where(eq(assistantMessages.assistantConversationId, conv.id))
        .orderBy(desc(assistantMessages.createdAt))
        .limit(1);

      return {
        id: conv.id,
        title: conv.title,
        updatedAt: conv.updatedAt.toISOString(),
        lastMessage: lastMsg
          ? { content: lastMsg.content.substring(0, 100), role: lastMsg.role }
          : null,
      };
    })
  );

  return c.json({
    conversations: conversationsWithPreview,
    nextCursor: hasMore ? items[items.length - 1].id : null,
  });
});

// GET /api/assistant/conversations/:id - Get conversation with all messages
app.get("/conversations/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");

  const [conv] = await db
    .select()
    .from(assistantConversations)
    .where(
      and(
        eq(assistantConversations.id, id),
        eq(assistantConversations.userId, userId)
      )
    )
    .limit(1);

  if (!conv) {
    return c.json({ error: "Conversation not found" }, 404);
  }

  const msgs = await db
    .select()
    .from(assistantMessages)
    .where(eq(assistantMessages.assistantConversationId, id))
    .orderBy(asc(assistantMessages.createdAt));

  return c.json({
    id: conv.id,
    title: conv.title,
    createdAt: conv.createdAt.toISOString(),
    updatedAt: conv.updatedAt.toISOString(),
    messages: msgs.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      ui: m.ui ? JSON.parse(m.ui) : null,
      createdAt: m.createdAt.toISOString(),
    })),
  });
});

// PATCH /api/assistant/conversations/:id - Update conversation title
app.patch("/conversations/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const body = await c.req.json();

  const [conv] = await db
    .select({ id: assistantConversations.id })
    .from(assistantConversations)
    .where(
      and(
        eq(assistantConversations.id, id),
        eq(assistantConversations.userId, userId)
      )
    )
    .limit(1);

  if (!conv) {
    return c.json({ error: "Conversation not found" }, 404);
  }

  const [updated] = await db
    .update(assistantConversations)
    .set({
      title: typeof body.title === "string" ? body.title.substring(0, 100) : undefined,
      updatedAt: new Date(),
    })
    .where(eq(assistantConversations.id, id))
    .returning();

  return c.json({
    id: updated.id,
    title: updated.title,
    updatedAt: updated.updatedAt.toISOString(),
  });
});

// DELETE /api/assistant/conversations/:id - Delete conversation and its messages
app.delete("/conversations/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");

  const [conv] = await db
    .select({ id: assistantConversations.id })
    .from(assistantConversations)
    .where(
      and(
        eq(assistantConversations.id, id),
        eq(assistantConversations.userId, userId)
      )
    )
    .limit(1);

  if (!conv) {
    return c.json({ error: "Conversation not found" }, 404);
  }

  // Null out FK on linked entities (don't delete the CRM objects)
  await Promise.all([
    db
      .update(contacts)
      .set({ assistantConversationId: null })
      .where(eq(contacts.assistantConversationId, id)),
    db
      .update(conversations)
      .set({ assistantConversationId: null })
      .where(eq(conversations.assistantConversationId, id)),
    db
      .update(events)
      .set({ assistantConversationId: null })
      .where(eq(events.assistantConversationId, id)),
    db
      .update(reminders)
      .set({ assistantConversationId: null })
      .where(eq(reminders.assistantConversationId, id)),
  ]);

  // Delete messages then conversation
  await db
    .delete(assistantMessages)
    .where(eq(assistantMessages.assistantConversationId, id));
  await db
    .delete(assistantConversations)
    .where(eq(assistantConversations.id, id));

  return c.json({ success: true });
});

export default app;
