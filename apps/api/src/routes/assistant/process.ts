import { streamText, stepCountIs, convertToModelMessages, type UIMessage } from "ai";
import { eq, and, sql, gte } from "drizzle-orm";
import { db, assistantConversations, assistantMessages, users } from "../../db";
import { PLAN_LIMITS, getMonthStart, type PlanName } from "../../lib/plan-limits";
import { getModel, getModelName, getProviderApiKeyEnvGuard } from "./model";
import { buildSystemPrompt } from "./prompt";
import { getUserContext } from "./db-helpers";
import { buildAllTools } from "./tools";
import { maybeAutoTitle } from "./auto-title";

export type AssistantLimitError = {
  error: string;
  code: string;
  limit?: number | null;
  usage?: number;
};

export async function assertConsentAndBudget(userId: string): Promise<AssistantLimitError | null> {
  const [userRow] = await db
    .select({ thirdPartyConsentGranted: users.thirdPartyConsentGranted, plan: users.plan })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!userRow?.thirdPartyConsentGranted) {
    return { error: "AI consent required", code: "CONSENT_REQUIRED" };
  }

  const plan = (userRow.plan || "free") as PlanName;
  const limits = PLAN_LIMITS[plan];

  if (limits.maxTokensPerMonth !== null) {
    const monthStart = getMonthStart();
    const [row] = await db
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
    const total = Number(row?.total || 0);
    if (total >= limits.maxTokensPerMonth) {
      return {
        error: "Monthly token limit reached. Please upgrade your plan or wait until next month.",
        code: "TOKEN_LIMIT_REACHED",
        limit: limits.maxTokensPerMonth,
        usage: total,
      };
    }
  }
  return null;
}

export async function upsertConversation(
  userId: string,
  conversationId: string,
  firstUserText: string
): Promise<AssistantLimitError | { ok: true }> {
  const [existing] = await db
    .select({ id: assistantConversations.id, userId: assistantConversations.userId })
    .from(assistantConversations)
    .where(eq(assistantConversations.id, conversationId))
    .limit(1);

  if (existing) {
    if (existing.userId !== userId) {
      return { error: "Forbidden", code: "FORBIDDEN" };
    }
    await db
      .update(assistantConversations)
      .set({ updatedAt: new Date() })
      .where(eq(assistantConversations.id, conversationId));
    return { ok: true };
  }

  const [userRow] = await db
    .select({ plan: users.plan })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const plan = (userRow?.plan || "free") as PlanName;
  const limits = PLAN_LIMITS[plan];
  if (limits.maxConversationsPerMonth !== null) {
    const monthStart = getMonthStart();
    const [row] = await db
      .select({ count: sql<number>`count(*)` })
      .from(assistantConversations)
      .where(
        and(
          eq(assistantConversations.userId, userId),
          gte(assistantConversations.createdAt, monthStart)
        )
      );
    const count = Number(row?.count || 0);
    if (count >= limits.maxConversationsPerMonth) {
      return {
        error: "Monthly conversation limit reached. Please upgrade your plan or wait until next month.",
        code: "CONVERSATION_LIMIT_REACHED",
        limit: limits.maxConversationsPerMonth,
        usage: count,
      };
    }
  }

  const title = firstUserText.slice(0, 100) || "New conversation";
  await db.insert(assistantConversations).values({ id: conversationId, userId, title });
  return { ok: true };
}

function extractText(parts: unknown): string {
  if (!Array.isArray(parts)) return "";
  return parts
    .filter((p): p is { type: string; text: string } => !!p && (p as { type?: string }).type === "text")
    .map((p) => p.text)
    .join("\n")
    .trim();
}

export async function persistUserMessage(conversationId: string, uiMessage: UIMessage) {
  await db.insert(assistantMessages).values({
    id: uiMessage.id,
    assistantConversationId: conversationId,
    role: "user",
    content: extractText(uiMessage.parts),
    parts: uiMessage.parts as unknown as Record<string, unknown>,
  });
}

export type ProcessChatParams = {
  userId: string;
  conversationId: string;
  messages: UIMessage[];
  timezone?: string;
};

export async function processAssistantChat({ userId, conversationId, messages, timezone }: ProcessChatParams) {
  const guard = getProviderApiKeyEnvGuard();
  if (!guard.configured) throw new Error(guard.message);

  const userCtx = await getUserContext(userId);
  const modelName = getModelName();
  const startTime = Date.now();
  const modelMessages = await convertToModelMessages(messages);

  const result = streamText({
    model: getModel(),
    system: buildSystemPrompt(userCtx, new Date(), timezone),
    messages: modelMessages,
    tools: buildAllTools({ userId, timezone }),
    stopWhen: stepCountIs(8),
    onError: ({ error }) => {
      console.error("[assistant] streamText error", error);
    },
  });

  return result.toUIMessageStreamResponse({
    onFinish: async ({ messages: finishedMessages }) => {
      try {
        const usage = await result.totalUsage;
        const inputTokens = Number(usage?.inputTokens ?? 0);
        const outputTokens = Number(usage?.outputTokens ?? 0);
        const responseTimeMs = Date.now() - startTime;

        for (const msg of finishedMessages) {
          if (msg.role !== "assistant") continue;
          await db.insert(assistantMessages).values({
            id: msg.id,
            assistantConversationId: conversationId,
            role: "assistant",
            content: extractText(msg.parts),
            parts: msg.parts as unknown as Record<string, unknown>,
            modelName,
            inputTokens,
            outputTokens,
            responseTimeMs,
          });
        }
        await db
          .update(assistantConversations)
          .set({ updatedAt: new Date() })
          .where(eq(assistantConversations.id, conversationId));
        void maybeAutoTitle(conversationId, userId);
      } catch (err) {
        console.error("[assistant] onFinish persistence error", err);
      }
    },
  });
}
