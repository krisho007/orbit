import { z } from "zod";
import { tool } from "ai";
import { and, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import {
  db,
  contacts,
  conversations,
  conversationParticipants,
} from "../../../db";
import { getOwnedConversation } from "../ownership";
import { enrichConversations } from "../enrichment";

type Ctx = { userId: string; timezone?: string };

const mediumEnum = z.enum([
  "PHONE_CALL",
  "WHATSAPP",
  "EMAIL",
  "CHANCE_ENCOUNTER",
  "ONLINE_MEETING",
  "IN_PERSON_MEETING",
  "OTHER",
]);

function parseIso(v?: string): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d;
}

async function verifyOwnedContacts(userId: string, contactIds: string[]): Promise<string[]> {
  if (contactIds.length === 0) return [];
  const rows = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.userId, userId), inArray(contacts.id, contactIds)));
  return rows.map((r) => r.id);
}

export function conversationTools({ userId }: Ctx) {
  return {
    search_conversations: tool({
      description:
        "Search conversations by content keywords, medium, participant, or date range. Returns most recent first.",
      inputSchema: z.object({
        query: z.string().optional().describe("Keyword in content"),
        medium: mediumEnum.optional(),
        participantId: z.string().optional(),
        since: z.string().optional().describe("ISO date/time lower bound"),
        until: z.string().optional().describe("ISO date/time upper bound"),
        limit: z.number().int().min(1).max(50).default(10),
      }),
      execute: async ({ query, medium, participantId, since, until, limit }) => {
        const conditions = [eq(conversations.userId, userId)];
        if (medium) conditions.push(eq(conversations.medium, medium));
        if (query) conditions.push(ilike(conversations.content, `%${query}%`));
        const sinceDate = parseIso(since);
        const untilDate = parseIso(until);
        if (sinceDate) conditions.push(sql`${conversations.happenedAt} >= ${sinceDate}`);
        if (untilDate) conditions.push(sql`${conversations.happenedAt} <= ${untilDate}`);
        if (participantId) {
          const convIds = await db
            .select({ id: conversationParticipants.conversationId })
            .from(conversationParticipants)
            .where(eq(conversationParticipants.contactId, participantId));
          const ids = convIds.map((r) => r.id);
          if (ids.length === 0) return { count: 0, conversations: [] };
          conditions.push(inArray(conversations.id, ids));
        }
        const rows = await db
          .select()
          .from(conversations)
          .where(and(...conditions))
          .orderBy(desc(conversations.happenedAt))
          .limit(limit);
        const enriched = await enrichConversations(rows);
        return { count: enriched.length, conversations: enriched };
      },
    }),

    get_conversation: tool({
      description: "Get a single conversation by id with participants.",
      inputSchema: z.object({ conversationId: z.string() }),
      execute: async ({ conversationId }) => {
        const row = await getOwnedConversation(userId, conversationId);
        if (!row) return { error: "Conversation not found" };
        const [enriched] = await enrichConversations([row]);
        return { conversation: enriched };
      },
    }),

    create_conversation: tool({
      description:
        "Log a conversation the user had with one or more contacts. Use when the user gives enough detail to record it now.",
      inputSchema: z.object({
        content: z.string().min(1).describe("Free-text notes about what was discussed"),
        medium: mediumEnum,
        happenedAt: z.string().describe("ISO date/time the conversation happened"),
        followUpAt: z.string().optional().describe("Optional ISO date/time for follow-up"),
        participantIds: z.array(z.string()).min(1).describe("Contact ids of participants"),
        eventId: z.string().optional().describe("Link to an event id, if any"),
      }),
      execute: async ({ content, medium, happenedAt, followUpAt, participantIds, eventId }) => {
        const happened = parseIso(happenedAt);
        if (!happened) return { error: "Invalid happenedAt" };
        const followUp = parseIso(followUpAt);
        const owned = await verifyOwnedContacts(userId, participantIds);
        if (owned.length === 0) return { error: "No owned participants resolved" };
        const [row] = await db
          .insert(conversations)
          .values({
            userId,
            content,
            medium,
            happenedAt: happened,
            followUpAt: followUp ?? null,
            eventId: eventId ?? null,
          })
          .returning();
        if (row && owned.length > 0) {
          await db
            .insert(conversationParticipants)
            .values(owned.map((cid) => ({ conversationId: row.id, contactId: cid })))
            .onConflictDoNothing();
        }
        return { conversation: row, participantIds: owned };
      },
    }),

    update_conversation: tool({
      description: "Update a conversation's fields by id.",
      inputSchema: z.object({
        conversationId: z.string(),
        content: z.string().optional(),
        medium: mediumEnum.optional(),
        happenedAt: z.string().optional(),
        followUpAt: z.string().nullable().optional(),
        participantIds: z.array(z.string()).optional().describe("Replace participant list"),
      }),
      execute: async ({ conversationId, content, medium, happenedAt, followUpAt, participantIds }) => {
        const owned = await getOwnedConversation(userId, conversationId);
        if (!owned) return { error: "Conversation not found" };
        const patch: Record<string, unknown> = { updatedAt: new Date() };
        if (content !== undefined) patch.content = content;
        if (medium !== undefined) patch.medium = medium;
        if (happenedAt !== undefined) patch.happenedAt = parseIso(happenedAt);
        if (followUpAt !== undefined) patch.followUpAt = followUpAt ? parseIso(followUpAt) : null;
        await db.update(conversations).set(patch).where(eq(conversations.id, conversationId));
        if (participantIds !== undefined) {
          const ownedIds = await verifyOwnedContacts(userId, participantIds);
          await db
            .delete(conversationParticipants)
            .where(eq(conversationParticipants.conversationId, conversationId));
          if (ownedIds.length > 0) {
            await db
              .insert(conversationParticipants)
              .values(ownedIds.map((cid) => ({ conversationId, contactId: cid })));
          }
        }
        return { ok: true, conversationId };
      },
    }),

    delete_conversation: tool({
      description: "Delete a conversation by id.",
      inputSchema: z.object({ conversationId: z.string() }),
      execute: async ({ conversationId }) => {
        const owned = await getOwnedConversation(userId, conversationId);
        if (!owned) return { error: "Conversation not found" };
        await db.delete(conversations).where(eq(conversations.id, conversationId));
        return { ok: true, conversationId };
      },
    }),
  };
}
