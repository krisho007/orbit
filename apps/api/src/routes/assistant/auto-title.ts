import { generateText } from "ai";
import { eq, and, asc } from "drizzle-orm";
import { db, assistantConversations, assistantMessages } from "../../db";
import { getTitleModel } from "./model";

export async function maybeAutoTitle(conversationId: string, userId: string): Promise<void> {
  try {
    const [conv] = await db
      .select({ id: assistantConversations.id, titleGenerated: assistantConversations.titleGenerated })
      .from(assistantConversations)
      .where(and(eq(assistantConversations.id, conversationId), eq(assistantConversations.userId, userId)))
      .limit(1);
    if (!conv || conv.titleGenerated) return;

    const rows = await db
      .select({ role: assistantMessages.role, content: assistantMessages.content })
      .from(assistantMessages)
      .where(eq(assistantMessages.assistantConversationId, conversationId))
      .orderBy(asc(assistantMessages.createdAt))
      .limit(4);
    if (rows.length < 2) return;
    const firstUser = rows.find((r) => r.role === "user")?.content?.trim();
    const firstAssistant = rows.find((r) => r.role === "assistant")?.content?.trim();
    if (!firstUser || !firstAssistant) return;

    const { text } = await generateText({
      model: getTitleModel(),
      prompt: [
        "Summarize this assistant conversation in at most 5 words. No punctuation, no quotes, Title Case.",
        "",
        `User: ${firstUser}`,
        `Assistant: ${firstAssistant}`,
      ].join("\n"),
    });
    const title = (text || "").replace(/["\n]/g, "").trim().slice(0, 80);
    if (!title) return;

    await db
      .update(assistantConversations)
      .set({ title, titleGenerated: true, updatedAt: new Date() })
      .where(eq(assistantConversations.id, conversationId));
  } catch (err) {
    console.warn("[assistant:auto-title] skipped:", err instanceof Error ? err.message : err);
  }
}
