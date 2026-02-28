import { Hono } from "hono";
import { eq, and, desc, asc, lt, sql, gte } from "drizzle-orm";
import { authMiddleware } from "../../middleware/auth";
import { formatValidationErrors } from "../../utils/validation";
import type { ChatMessage } from "./types";
import { chatSchema, MAX_USER_MESSAGES_PER_CONVERSATION } from "./types";
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
import { PLAN_LIMITS, getMonthStart, type PlanName } from "../../lib/plan-limits";

const app = new Hono();

app.use("/*", authMiddleware);

// Shared validation & setup for both streaming and non-streaming paths
async function validateAndSetup(c: any) {
  const userId = c.get("userId");
  const body = await c.req.json();

  const validation = chatSchema.safeParse(body);
  if (!validation.success) {
    console.warn("[assistant] Invalid request body");
    return { error: c.json({ error: formatValidationErrors(validation.error) }, 400) };
  }

  const { messages, conversationId, timezone } = validation.data;
  const lastUserMessage = [...messages].reverse().find((m: any) => m.role === "user");

  if (!lastUserMessage) {
    console.warn("[assistant] No user message found in request");
    return { error: c.json({ error: "No user message provided" }, 400) };
  }

  console.log(`\n${"=".repeat(70)}`);
  console.log(`[assistant] 💬 User question: "${lastUserMessage.content}"`);
  console.log(`[assistant] Chat history: ${messages.length} message(s)`);
  console.log(`${"=".repeat(70)}`);

  // ── Step 1: Load user (consent + plan) ──────────────────────────
  const [userRow] = await db
    .select({
      thirdPartyConsentGranted: users.thirdPartyConsentGranted,
      plan: users.plan,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!userRow?.thirdPartyConsentGranted) {
    return { error: c.json({ error: "AI consent required", code: "CONSENT_REQUIRED" }, 403) };
  }

  const plan = (userRow.plan || "free") as PlanName;
  const limits = PLAN_LIMITS[plan];
  const monthStart = getMonthStart();

  // ── Step 2: Check monthly token budget ──────────────────────────
  if (limits.maxTokensPerMonth !== null) {
    const [tokenResult] = await db
      .select({
        total: sql<number>`coalesce(sum(coalesce(${assistantMessages.inputTokens}, 0) + coalesce(${assistantMessages.outputTokens}, 0)), 0)`,
      })
      .from(assistantMessages)
      .innerJoin(
        assistantConversations,
        eq(assistantMessages.assistantConversationId, assistantConversations.id)
      )
      .where(
        and(
          eq(assistantConversations.userId, userId),
          gte(assistantMessages.createdAt, monthStart)
        )
      );

    const totalTokens = Number(tokenResult?.total || 0);
    if (totalTokens >= limits.maxTokensPerMonth) {
      console.log(`[assistant] Token limit reached: ${totalTokens}/${limits.maxTokensPerMonth} (${plan})`);
      return {
        error: c.json({
          error: "Monthly token limit reached. Please upgrade your plan or wait until next month.",
          code: "TOKEN_LIMIT_REACHED",
          limit: limits.maxTokensPerMonth,
          usage: totalTokens,
        }, 403),
      };
    }
  }

  // ── Step 3: Resolve or create conversation ──────────────────────
  let assistantConvId: string;

  if (conversationId) {
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
      return { error: c.json({ error: "Conversation not found" }, 404) };
    }
    db.update(assistantConversations)
      .set({ updatedAt: new Date() })
      .where(eq(assistantConversations.id, existing.id))
      .then(() => {}, () => {});
    assistantConvId = existing.id;
  } else {
    // New conversation — check monthly conversation limit first
    if (limits.maxConversationsPerMonth !== null) {
      const [convCountResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(assistantConversations)
        .where(
          and(
            eq(assistantConversations.userId, userId),
            gte(assistantConversations.createdAt, monthStart)
          )
        );

      const convCount = Number(convCountResult?.count || 0);
      if (convCount >= limits.maxConversationsPerMonth) {
        console.log(`[assistant] Conversation limit reached: ${convCount}/${limits.maxConversationsPerMonth} (${plan})`);
        return {
          error: c.json({
            error: "Monthly conversation limit reached. Please upgrade your plan or wait until next month.",
            code: "CONVERSATION_LIMIT_REACHED",
            limit: limits.maxConversationsPerMonth,
            usage: convCount,
          }, 403),
        };
      }
    }

    const title = lastUserMessage.content.substring(0, 100);
    const [newConv] = await db
      .insert(assistantConversations)
      .values({ userId, title })
      .returning();
    assistantConvId = newConv!.id;
  }

  // ── Step 4: Per-conversation user message limit ─────────────────
  if (conversationId) {
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(assistantMessages)
      .where(
        and(
          eq(assistantMessages.assistantConversationId, assistantConvId),
          eq(assistantMessages.role, "user")
        )
      );
    const userMessageCount = Number(countResult?.count || 0);
    if (userMessageCount >= MAX_USER_MESSAGES_PER_CONVERSATION) {
      return {
        error: c.json(
          { error: "Conversation limit reached (10 messages). Please start a new conversation." },
          400
        ),
      };
    }
  }

  return { userId, messages, lastUserMessage, assistantConvId, timezone };
}

// POST /api/assistant - Process chat message
app.post("/", async (c) => {
  const accept = c.req.header("Accept") || "";
  const wantsStream = accept.includes("text/x-ndjson");

  // ── Streaming (NDJSON) path ──────────────────────────────────────
  if (wantsStream) {
    const startTime = Date.now();

    try {
      const setup = await validateAndSetup(c);
      if ("error" in setup) return setup.error;
      const { userId, messages, lastUserMessage, assistantConvId, timezone } = setup;

      // Use a ReadableStream to emit NDJSON lines.
      // Bun's idle timeout or client disconnect can close the controller while
      // processMessageLLM is still running — guard all writes with a closed flag.
      const encoder = new TextEncoder();
      let streamClosed = false;
      const stream = new ReadableStream({
        async start(controller) {
          const writeLine = (obj: Record<string, unknown>) => {
            if (streamClosed) return;
            try {
              controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
            } catch {
              // Controller already closed (timeout / client disconnect)
              streamClosed = true;
            }
          };

          try {
            // Fire user message save concurrently
            const [response] = await Promise.all([
              processMessageLLM(
                userId,
                messages as ChatMessage[],
                undefined,
                assistantConvId,
                (message) => writeLine({ type: "status", message }),
                timezone
              ),
              db.insert(assistantMessages).values({
                assistantConversationId: assistantConvId,
                role: "user",
                content: lastUserMessage.content,
              }),
            ]);

            // Embed cached intents in stored UI for retrieval on confirmation turns
            const streamUiExtras: Record<string, unknown> = {};
            if (response.cachedIntents?.length) streamUiExtras._cachedIntents = response.cachedIntents;
            if (response.cachedOutput) streamUiExtras._cachedOutput = response.cachedOutput;
            const streamUiForStorage = Object.keys(streamUiExtras).length > 0
              ? JSON.stringify({ ...(response.ui || {}), ...streamUiExtras })
              : response.ui ? JSON.stringify(response.ui) : null;

            const elapsed = Date.now() - startTime;

            // Save assistant response
            await db.insert(assistantMessages).values({
              assistantConversationId: assistantConvId,
              role: "assistant",
              content: response.text,
              ui: streamUiForStorage,
              modelName: response.modelName,
              inputTokens: response.inputTokens,
              outputTokens: response.outputTokens,
              responseTimeMs: elapsed,
            });
            console.log(`[assistant] ✅ Stream response (${elapsed}ms): "${response.text.substring(0, 200)}${response.text.length > 200 ? "..." : ""}"`);

            writeLine({
              type: "result",
              role: "assistant",
              content: response.text,
              ui: response.ui,
              actions: response.actions,
              conversationId: assistantConvId,
            });
          } catch (error) {
            const elapsed = Date.now() - startTime;
            console.error(`[assistant] ❌ Stream error after ${elapsed}ms:`, error);
            const message = error instanceof Error ? error.message : "Unknown error";
            writeLine({ type: "error", error: `Failed to process message: ${message}` });
          } finally {
            if (!streamClosed) {
              try { controller.close(); } catch { /* already closed */ }
            }
            streamClosed = true;
          }
        },
        cancel() {
          streamClosed = true;
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/x-ndjson",
          "Cache-Control": "no-cache",
          "X-Accel-Buffering": "no",
        },
      });
    } catch (error) {
      const elapsed = Date.now() - startTime;
      console.error(`[assistant] ❌ Stream setup error after ${elapsed}ms:`, error);
      const message = error instanceof Error ? error.message : "Unknown error";
      return c.json({ error: `Failed to process message: ${message}` }, 500);
    }
  }

  // ── Non-streaming (JSON) path — unchanged ────────────────────────
  const startTime = Date.now();

  try {
    const setup = await validateAndSetup(c);
    if ("error" in setup) return setup.error;
    const { userId, messages, lastUserMessage, assistantConvId, timezone } = setup;

    // Fire user message save concurrently with LLM processing —
    // processMessageLLM doesn't depend on the message being persisted
    const [response] = await Promise.all([
      processMessageLLM(
        userId,
        messages as ChatMessage[],
        undefined,
        assistantConvId,
        undefined,
        timezone
      ),
      db.insert(assistantMessages).values({
        assistantConversationId: assistantConvId,
        role: "user",
        content: lastUserMessage.content,
      }),
    ]);

    // Embed cached intents in stored UI for retrieval on confirmation turns
    const uiExtras: Record<string, unknown> = {};
    if (response.cachedIntents?.length) uiExtras._cachedIntents = response.cachedIntents;
    if (response.cachedOutput) uiExtras._cachedOutput = response.cachedOutput;
    const uiForStorage = Object.keys(uiExtras).length > 0
      ? JSON.stringify({ ...(response.ui || {}), ...uiExtras })
      : response.ui ? JSON.stringify(response.ui) : null;

    const elapsed = Date.now() - startTime;

    // Save assistant response
    await db.insert(assistantMessages).values({
      assistantConversationId: assistantConvId,
      role: "assistant",
      content: response.text,
      ui: uiForStorage,
      modelName: response.modelName,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      responseTimeMs: elapsed,
    });
    console.log(`[assistant] ✅ Response (${elapsed}ms): "${response.text.substring(0, 200)}${response.text.length > 200 ? "..." : ""}"`);
    if (response.ui) {
      console.log(`[assistant] 🎨 UI attached: kind=${response.ui.kind}`);
    }
    console.log(`${"=".repeat(70)}\n`);

    return c.json({
      role: "assistant",
      content: response.text,
      ui: response.ui,
      actions: response.actions,
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
    nextCursor: hasMore ? items[items.length - 1]!.id : null,
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
    messages: msgs.map((m) => {
      let ui = m.ui ? JSON.parse(m.ui) : null;
      if (ui && ("_cachedIntents" in ui || "_cachedOutput" in ui)) {
        const { _cachedIntents, _cachedOutput, ...rest } = ui;
        ui = rest.kind ? rest : null;
      }
      return {
        id: m.id,
        role: m.role,
        content: m.content,
        ui,
        thumbsUp: m.thumbsUp,
        thumbsDown: m.thumbsDown,
        createdAt: m.createdAt.toISOString(),
      };
    }),
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

  if (!updated) {
    return c.json({ error: "Conversation not found" }, 404);
  }

  return c.json({
    id: updated.id,
    title: updated.title,
    updatedAt: updated.updatedAt.toISOString(),
  });
});

// PATCH /api/assistant/messages/:id/feedback - Update thumbs up/down on a message
app.patch("/messages/:id/feedback", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const body = await c.req.json();

  const { thumbsUp, thumbsDown } = body;
  if (typeof thumbsUp !== "boolean" && typeof thumbsDown !== "boolean") {
    return c.json({ error: "thumbsUp or thumbsDown (boolean) required" }, 400);
  }

  // Verify the message belongs to this user via its conversation
  const [msg] = await db
    .select({
      id: assistantMessages.id,
      convId: assistantMessages.assistantConversationId,
    })
    .from(assistantMessages)
    .where(eq(assistantMessages.id, id))
    .limit(1);

  if (!msg) {
    return c.json({ error: "Message not found" }, 404);
  }

  const [conv] = await db
    .select({ id: assistantConversations.id })
    .from(assistantConversations)
    .where(
      and(
        eq(assistantConversations.id, msg.convId),
        eq(assistantConversations.userId, userId)
      )
    )
    .limit(1);

  if (!conv) {
    return c.json({ error: "Message not found" }, 404);
  }

  const updates: Record<string, boolean> = {};
  if (typeof thumbsUp === "boolean") updates.thumbsUp = thumbsUp;
  if (typeof thumbsDown === "boolean") updates.thumbsDown = thumbsDown;

  await db
    .update(assistantMessages)
    .set(updates)
    .where(
      and(
        eq(assistantMessages.id, id),
        eq(assistantMessages.assistantConversationId, conv.id)
      )
    );

  return c.json({ success: true, ...updates });
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
