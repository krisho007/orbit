import { z } from "zod";
import { tool } from "ai";
import { eq, and, desc, sql, ilike, inArray, isNotNull } from "drizzle-orm";
import {
  db,
  contacts,
  conversations,
  conversationParticipants,
  reminders,
  events,
} from "../../../db";
import type { ToolResult } from "../types";
import { PAGE_SIZE } from "../types";
import { assertValidMedium } from "../enums";
import { getOwnedConversation, getOwnedEvent } from "../ownership";
import { findBestContactMatch } from "../db-helpers";
import { enrichConversations, syncConversationFollowUpReminder } from "../enrichment";
import {
  generateEmbedding,
  generateQueryEmbedding,
  buildEmbeddingText,
} from "../../../lib/embeddings";
import type { EnumSchemas } from "./contacts";

// ── Helpers ──────────────────────────────────────────────────────────

/** Fire-and-forget: generate embedding for a conversation and store it. */
function generateAndStoreEmbedding(
  conversationId: string,
  content: string | null | undefined,
  medium: string,
  participantIds: string[]
) {
  (async () => {
    try {
      let participantNames: string[] = [];
      if (participantIds.length > 0) {
        const rows = await db
          .select({ displayName: contacts.displayName })
          .from(contacts)
          .where(inArray(contacts.id, participantIds));
        participantNames = rows.map((r) => r.displayName);
      }

      const text = buildEmbeddingText({ content, medium, participantNames });
      if (!text || text.length < 5) return;

      const embedding = await generateEmbedding(text);
      await db
        .update(conversations)
        .set({ embedding })
        .where(eq(conversations.id, conversationId));
    } catch (err) {
      console.error(`[embeddings] Failed to generate embedding for conversation ${conversationId}:`, err);
    }
  })();
}

/** Semantic vector search for conversations. */
async function semanticSearchConversations(
  userId: string,
  query: string,
  medium?: string,
  limit?: number
): Promise<ToolResult> {
  const takeLimit = Math.min(limit || 10, 20);
  console.log(`[assistant:tool] semanticSearchConversations — query="${query}", limit=${takeLimit}`);

  try {
    const queryEmbedding = await generateQueryEmbedding(query);
    const embeddingStr = JSON.stringify(queryEmbedding);

    const conditions = [
      eq(conversations.userId, userId),
      isNotNull(conversations.embedding),
      sql`(${conversations.embedding} <=> ${embeddingStr}::vector) < 0.6`,
    ];

    if (medium) {
      conditions.push(eq(conversations.medium, assertValidMedium(medium)));
    }

    const conversationsList = await db
      .select({
        id: conversations.id,
        medium: conversations.medium,
        happenedAt: conversations.happenedAt,
        content: conversations.content,
        similarity: sql<number>`1 - (${conversations.embedding} <=> ${embeddingStr}::vector)`,
      })
      .from(conversations)
      .where(and(...conditions))
      .orderBy(sql`${conversations.embedding} <=> ${embeddingStr}::vector`)
      .limit(takeLimit);

    // Fetch participants for results
    const convIds = conversationsList.map((c) => c.id);
    let participants: any[] = [];
    if (convIds.length > 0) {
      participants = await db
        .select()
        .from(conversationParticipants)
        .innerJoin(contacts, eq(conversationParticipants.contactId, contacts.id))
        .where(inArray(conversationParticipants.conversationId, convIds));
    }

    console.log(`[assistant:tool] semanticSearchConversations — returning ${conversationsList.length} result(s)`);

    return {
      type: "conversations_found",
      count: conversationsList.length,
      conversations: conversationsList.map((c) => ({
        id: c.id,
        medium: c.medium,
        happenedAt: c.happenedAt,
        content: c.content,
        similarity: c.similarity,
        participants: participants
          .filter((p: any) => p.conversation_participants.conversationId === c.id)
          .map((p: any) => p.contacts.displayName),
      })),
    };
  } catch (err) {
    console.error(`[assistant:tool] semanticSearchConversations — error:`, err);
    // Fallback to keyword search if vector search fails
    return listConversations(userId, undefined, query, medium, limit);
  }
}

// ── Implementation functions ─────────────────────────────────────────

export async function createConversation(
  userId: string,
  participantIds: string[],
  medium: string,
  content?: string,
  happenedAt?: string,
  followUpAt?: string,
  eventId?: string,
  assistantConversationId?: string
): Promise<ToolResult> {
  try {
  let resolvedParticipantIds: string[] = [];

  if (participantIds.length > 0) {
    const ownedContacts = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.userId, userId), inArray(contacts.id, participantIds)));

    const ownedIds = ownedContacts.map((c) => c.id);
    const missingIds = participantIds.filter((id) => !ownedIds.includes(id));

    if (missingIds.length > 0) {
      return {
        type: "error",
        message: `Could not find contacts with ids: ${missingIds.join(", ")}`,
      };
    }

    resolvedParticipantIds = [...new Set(participantIds)];
  }

  if (resolvedParticipantIds.length === 0) {
    return {
      type: "error",
      message: "At least one participant is required.",
    };
  }

  if (eventId) {
    const existingEvent = await getOwnedEvent(userId, eventId);
    if (!existingEvent) {
      return {
        type: "error",
        message: `Could not find event with id: ${eventId}`,
      };
    }
  }

  const [conversation] = await db
    .insert(conversations)
    .values({
      content: content || null,
      medium: assertValidMedium(medium),
      happenedAt: happenedAt ? new Date(happenedAt) : new Date(),
      followUpAt: followUpAt ? new Date(followUpAt) : null,
      eventId: eventId || null,
      userId,
      updatedAt: new Date(),
      assistantConversationId: assistantConversationId || null,
    })
    .returning();

  if (!conversation) {
    return { type: "error", message: "Failed to create conversation" };
  }

  if (resolvedParticipantIds.length > 0) {
    await db.insert(conversationParticipants).values(
      resolvedParticipantIds.map((contactId) => ({
        conversationId: conversation.id,
        contactId,
      }))
    );
  }

  await syncConversationFollowUpReminder(
    userId,
    conversation.id,
    conversation.followUpAt,
    resolvedParticipantIds,
    conversation.content
  );

  // Fire-and-forget embedding generation
  generateAndStoreEmbedding(
    conversation.id,
    conversation.content,
    conversation.medium,
    resolvedParticipantIds
  );

  const participantContacts = await db
    .select({ displayName: contacts.displayName })
    .from(contacts)
    .where(inArray(contacts.id, resolvedParticipantIds));

  return {
    type: "conversation_created",
    id: conversation.id,
    medium: conversation.medium,
    happenedAt: conversation.happenedAt,
    content: conversation.content,
    participants: participantContacts.map((p) => p.displayName),
  };
  } catch (err) {
    console.error(`[assistant:tool] createConversation FAILED:`, err);
    return { type: "error", message: `Failed to create conversation: ${String(err)}` };
  }
}

export async function queryConversations(
  userId: string,
  participantName?: string,
  medium?: string,
  limit?: number
): Promise<ToolResult> {
  console.log(`[assistant:tool] queryConversations — participant="${participantName || "any"}", medium="${medium || "any"}", limit=${limit || 10}`);
  const takeLimit = Math.min(limit || 10, 10);
  const conditions = [eq(conversations.userId, userId)];

  let contactFilter: string | null = null;
  if (participantName) {
    const contact = await findBestContactMatch(userId, participantName);
    if (contact) {
      contactFilter = contact.id;
      console.log(`[assistant:tool] queryConversations — filtering by contact: ${contact.displayName} (${contact.id})`);
    } else {
      console.log(`[assistant:tool] queryConversations — no contact found for "${participantName}", returning unfiltered`);
    }
  }

  if (medium) {
    conditions.push(eq(conversations.medium, assertValidMedium(medium)));
  }

  if (contactFilter) {
    const participantConvIds = db
      .select({ conversationId: conversationParticipants.conversationId })
      .from(conversationParticipants)
      .where(eq(conversationParticipants.contactId, contactFilter));

    conditions.push(inArray(conversations.id, participantConvIds));
  }

  const conversationsList = await db
    .select()
    .from(conversations)
    .where(and(...conditions))
    .orderBy(desc(conversations.happenedAt))
    .limit(takeLimit);

  const convIds = conversationsList.map((c) => c.id);
  let participants: any[] = [];
  try {
    participants =
      convIds.length > 0
        ? await db
            .select()
            .from(conversationParticipants)
            .innerJoin(contacts, eq(conversationParticipants.contactId, contacts.id))
            .where(inArray(conversationParticipants.conversationId, convIds))
        : [];
  } catch (err) {
    console.error(`[assistant:tool] queryConversations — error fetching participants:`, err);
  }

  console.log(`[assistant:tool] queryConversations — returning ${conversationsList.length} conversation(s)`);

  return {
    type: "conversations_found",
    count: conversationsList.length,
    conversations: conversationsList.map((c) => ({
      id: c.id,
      medium: c.medium,
      happenedAt: c.happenedAt,
      content: c.content,
      participants: participants
        .filter((p: any) => p.conversation_participants.conversationId === c.id)
        .map((p: any) => p.contacts.displayName),
    })),
  };
}

export async function listConversations(
  userId: string,
  cursor?: string,
  search?: string,
  medium?: string,
  limit?: number
): Promise<ToolResult> {
  const conditions = [eq(conversations.userId, userId)];
  if (medium) {
    conditions.push(eq(conversations.medium, assertValidMedium(medium)));
  }
  if (search) {
    conditions.push(ilike(conversations.content, `%${search}%`));
  }

  const takeLimit = limit || PAGE_SIZE;
  let conversationsList;
  if (cursor) {
    conversationsList = await db
      .select()
      .from(conversations)
      .where(
        and(
          ...conditions,
          sql`${conversations.happenedAt} < (SELECT "happenedAt" FROM conversations WHERE id = ${cursor})`
        )
      )
      .orderBy(desc(conversations.happenedAt))
      .limit(takeLimit + 1);
  } else {
    conversationsList = await db
      .select()
      .from(conversations)
      .where(and(...conditions))
      .orderBy(desc(conversations.happenedAt))
      .limit(takeLimit + 1);
  }

  let nextCursor: string | null = null;
  if (conversationsList.length > takeLimit) {
    const nextItem = conversationsList.pop();
    nextCursor = nextItem?.id || null;
  }

  const enrichedConversations = await enrichConversations(conversationsList);

  let stats = null;
  if (!cursor && !search && !medium) {
    const [totalResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(conversations)
      .where(eq(conversations.userId, userId));

    stats = { totalCount: Number(totalResult?.count || 0) };
  }

  return {
    type: "conversations_found",
    count: enrichedConversations.length,
    conversations: enrichedConversations,
    nextCursor,
    stats,
  };
}

export async function getConversationById(
  userId: string,
  conversationId: string
): Promise<ToolResult> {
  const conversation = await getOwnedConversation(userId, conversationId);

  if (!conversation) {
    return { type: "error", message: "Conversation not found" };
  }

  const participantsData = await db
    .select()
    .from(conversationParticipants)
    .innerJoin(contacts, eq(conversationParticipants.contactId, contacts.id))
    .where(eq(conversationParticipants.conversationId, conversationId));

  let event = null;
  if (conversation.eventId) {
    const [eventData] = await db
      .select({ id: events.id, title: events.title })
      .from(events)
      .where(eq(events.id, conversation.eventId));
    event = eventData || null;
  }

  return {
    type: "conversation_details",
    ...conversation,
    participants: participantsData.map((p) => ({
      ...p.conversation_participants,
      contact: p.contacts,
    })),
    event,
  };
}

export async function createConversationByIds(
  userId: string,
  payload: {
    content?: string;
    medium: string;
    happenedAt: string;
    followUpAt?: string;
    eventId?: string;
    participantIds: string[];
  },
  assistantConversationId?: string
): Promise<ToolResult> {
  try {
  const participantIds = [...new Set(payload.participantIds)];

  const [newConversation] = await db
    .insert(conversations)
    .values({
      userId,
      content: payload.content || null,
      medium: assertValidMedium(payload.medium),
      happenedAt: new Date(payload.happenedAt),
      followUpAt: payload.followUpAt ? new Date(payload.followUpAt) : null,
      eventId: payload.eventId || null,
      updatedAt: new Date(),
      assistantConversationId: assistantConversationId || null,
    })
    .returning();

  if (!newConversation) {
    return { type: "error", message: "Failed to create conversation" };
  }

  if (participantIds.length > 0) {
    await db.insert(conversationParticipants).values(
      participantIds.map((contactId) => ({
        conversationId: newConversation.id,
        contactId,
      }))
    );
  }

  await syncConversationFollowUpReminder(
    userId,
    newConversation.id,
    newConversation.followUpAt,
    participantIds,
    newConversation.content
  );

  // Fire-and-forget embedding generation
  generateAndStoreEmbedding(
    newConversation.id,
    newConversation.content,
    newConversation.medium,
    participantIds
  );

  const participantContacts =
    participantIds.length > 0
      ? await db
          .select({ displayName: contacts.displayName })
          .from(contacts)
          .where(inArray(contacts.id, participantIds))
      : [];

  return {
    type: "conversation_created",
    id: newConversation.id,
    medium: newConversation.medium,
    happenedAt: newConversation.happenedAt,
    content: newConversation.content,
    participants: participantContacts.map((p) => p.displayName),
  };
  } catch (err) {
    console.error(`[assistant:tool] createConversationByIds FAILED:`, err);
    return { type: "error", message: `Failed to create conversation: ${String(err)}` };
  }
}

export async function updateConversationById(
  userId: string,
  conversationId: string,
  updates: {
    content?: string;
    medium?: string;
    happenedAt?: string;
    followUpAt?: string;
    eventId?: string;
    participantIds?: string[];
  }
): Promise<ToolResult> {
  const existing = await getOwnedConversation(userId, conversationId);

  if (!existing) {
    return { type: "error", message: "Conversation not found" };
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (updates.content !== undefined) updateData.content = updates.content || null;
  if (updates.medium !== undefined) updateData.medium = assertValidMedium(updates.medium);
  if (updates.happenedAt !== undefined)
    updateData.happenedAt = new Date(updates.happenedAt);
  if (updates.followUpAt !== undefined)
    updateData.followUpAt = updates.followUpAt ? new Date(updates.followUpAt) : null;
  if (updates.eventId !== undefined) updateData.eventId = updates.eventId || null;

  const [updatedConversation] = await db
    .update(conversations)
    .set(updateData)
    .where(eq(conversations.id, conversationId))
    .returning();

  let participantIdsForReminder: string[] | null = null;
  if (updates.participantIds !== undefined) {
    participantIdsForReminder = [...new Set(updates.participantIds)];
    await db
      .delete(conversationParticipants)
      .where(eq(conversationParticipants.conversationId, conversationId));

    if (participantIdsForReminder.length > 0) {
      await db.insert(conversationParticipants).values(
        participantIdsForReminder.map((contactId) => ({
          conversationId,
          contactId,
        }))
      );
    }
  }

  if (!participantIdsForReminder) {
    const existingParticipants = await db
      .select({ contactId: conversationParticipants.contactId })
      .from(conversationParticipants)
      .where(eq(conversationParticipants.conversationId, conversationId));
    participantIdsForReminder = existingParticipants.map((row) => row.contactId);
  }

  await syncConversationFollowUpReminder(
    userId,
    conversationId,
    updatedConversation?.followUpAt || null,
    participantIdsForReminder,
    updatedConversation?.content || null
  );

  // Regenerate embedding if content, medium, or participants changed
  if (updates.content !== undefined || updates.medium !== undefined || updates.participantIds !== undefined) {
    generateAndStoreEmbedding(
      conversationId,
      updatedConversation?.content,
      updatedConversation?.medium || "OTHER",
      participantIdsForReminder
    );
  }

  return { type: "conversation_updated", id: conversationId };
}

export async function deleteConversationById(
  userId: string,
  conversationId: string
): Promise<ToolResult> {
  const existing = await getOwnedConversation(userId, conversationId);

  if (!existing) {
    return { type: "error", message: "Conversation not found" };
  }

  await db
    .update(reminders)
    .set({
      status: "CANCELED",
      conversationId: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(reminders.userId, userId),
        eq(reminders.conversationId, conversationId),
        eq(reminders.isAutoFromConversation, true)
      )
    );
  await db.delete(conversations).where(eq(conversations.id, conversationId));
  return { type: "conversation_deleted", id: conversationId };
}

export async function listConversationsByContacts(
  userId: string,
  contactIds: string[],
  cursor?: string,
  search?: string,
  medium?: string,
  limit?: number
): Promise<ToolResult> {
  const uniqueContactIds = [...new Set(contactIds.map((id) => id.trim()).filter(Boolean))];

  if (uniqueContactIds.length === 0) {
    return { type: "error", message: "contactIds are required" };
  }

  const ownedContacts = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.userId, userId), inArray(contacts.id, uniqueContactIds)));

  if (ownedContacts.length !== uniqueContactIds.length) {
    return { type: "error", message: "Contact not found" };
  }

  const convIdsResult = await db
    .select({ conversationId: conversationParticipants.conversationId })
    .from(conversationParticipants)
    .where(inArray(conversationParticipants.contactId, uniqueContactIds))
    .groupBy(conversationParticipants.conversationId)
    .having(
      sql`COUNT(DISTINCT ${conversationParticipants.contactId}) = ${uniqueContactIds.length}`
    );

  const convIds = convIdsResult.map((row) => row.conversationId);

  if (convIds.length === 0) {
    return { type: "conversations_found", count: 0, conversations: [], nextCursor: null };
  }

  const conditions = [
    eq(conversations.userId, userId),
    inArray(conversations.id, convIds),
  ];

  if (medium) {
    conditions.push(eq(conversations.medium, assertValidMedium(medium)));
  }

  if (search) {
    conditions.push(ilike(conversations.content, `%${search}%`));
  }

  const takeLimit = limit || PAGE_SIZE;
  let conversationsList;
  if (cursor) {
    conversationsList = await db
      .select()
      .from(conversations)
      .where(
        and(
          ...conditions,
          sql`${conversations.happenedAt} < (SELECT "happenedAt" FROM conversations WHERE id = ${cursor})`
        )
      )
      .orderBy(desc(conversations.happenedAt))
      .limit(takeLimit + 1);
  } else {
    conversationsList = await db
      .select()
      .from(conversations)
      .where(and(...conditions))
      .orderBy(desc(conversations.happenedAt))
      .limit(takeLimit + 1);
  }

  let nextCursor: string | null = null;
  if (conversationsList.length > takeLimit) {
    const nextItem = conversationsList.pop();
    nextCursor = nextItem?.id || null;
  }

  const enrichedConversations = await enrichConversations(conversationsList);

  return {
    type: "conversations_found",
    count: enrichedConversations.length,
    conversations: enrichedConversations,
    nextCursor,
  };
}

// ── Tool definitions ─────────────────────────────────────────────────

export function createConversationTools(userId: string, schemas: EnumSchemas, assistantConversationId?: string) {
  return {
    create_conversation: tool({
      description: "Create a new conversation record with participant contact IDs",
      inputSchema: z.object({
        participantIds: z.array(z.string()).min(1).describe("Participant contact IDs"),
        medium: schemas.mediumSchema.describe("Conversation medium value"),
        content: z.string().optional().describe("Notes about the conversation"),
        happenedAt: z.string().optional().describe("When it happened in ISO date format"),
        followUpAt: z.string().optional().describe("Follow-up date/time in ISO format"),
        eventId: z.string().optional().describe("Linked event ID, if any"),
      }),
      execute: async ({ participantIds, medium, content, happenedAt, followUpAt, eventId }) =>
        createConversation(userId, participantIds, medium as string, content, happenedAt, followUpAt, eventId, assistantConversationId),
    }),

    query_conversations: tool({
      description: "Search and retrieve conversations",
      inputSchema: z.object({
        participantName: z.string().optional().describe("Name of participant to filter by"),
        medium: schemas.optionalMediumSchema.describe("Conversation medium filter"),
        limit: z.number().optional().describe("Number of results to return, defaults to 10"),
      }),
      execute: async ({ participantName, medium, limit }) =>
        queryConversations(userId, participantName, medium, limit),
    }),

    searchConversations: tool({
      description: "Search conversations by meaning (semantic search). Best for natural language queries like 'discussions about finances' or 'planning meetings'.",
      inputSchema: z.object({
        searchTerm: z.string().optional().describe("Natural language search query — finds conceptually related conversations"),
        participantName: z.string().optional().describe("Participant name"),
        medium: schemas.optionalMediumSchema.describe("Conversation medium filter"),
        limit: z.number().optional().describe("Maximum results"),
      }),
      execute: async ({ searchTerm, participantName, medium, limit }) => {
        if (participantName) {
          const result = await queryConversations(userId, participantName, medium, limit);
          if (searchTerm && result.type === "conversations_found" && Array.isArray((result as any).conversations)) {
            const filtered = (result as any).conversations.filter((conversation: any) =>
              typeof conversation?.content === "string"
                ? conversation.content.toLowerCase().includes(searchTerm.toLowerCase())
                : false
            );
            return {
              type: "conversations_found",
              count: filtered.length,
              conversations: filtered,
            };
          }
          return result;
        }
        // Use semantic search when no participant filter — finds conceptually related conversations
        if (searchTerm) {
          return semanticSearchConversations(userId, searchTerm, medium, limit);
        }
        return listConversations(userId, undefined, undefined, medium, limit);
      },
    }),

    list_conversations: tool({
      description: "List conversations with optional pagination and filters",
      inputSchema: z.object({
        cursor: z.string().optional().describe("Pagination cursor (conversation id)"),
        search: z.string().optional().describe("Search term"),
        medium: schemas.optionalMediumSchema.describe("Conversation medium"),
        limit: z.number().optional().describe("Number of results to return"),
      }),
      execute: async ({ cursor, search, medium, limit }) =>
        listConversations(userId, cursor, search, medium, limit),
    }),

    get_conversation: tool({
      description: "Get a single conversation by id",
      inputSchema: z.object({
        conversationId: z.string().describe("Conversation id"),
      }),
      execute: async ({ conversationId }) => getConversationById(userId, conversationId),
    }),

    create_conversation_by_ids: tool({
      description: "Create a conversation using participant ids",
      inputSchema: z.object({
        content: z.string().optional().describe("Notes about the conversation"),
        medium: schemas.mediumSchema.describe("Conversation medium"),
        happenedAt: z.string().describe("When it happened in ISO date format"),
        followUpAt: z.string().optional().describe("Follow up date in ISO format"),
        eventId: z.string().optional().describe("Linked event id"),
        participantIds: z.array(z.string()).describe("Participant contact ids"),
      }),
      execute: async ({ content, medium, happenedAt, followUpAt, eventId, participantIds }) =>
        createConversationByIds(userId, { content, medium, happenedAt, followUpAt, eventId, participantIds }, assistantConversationId),
    }),

    update_conversation_by_id: tool({
      description: "Update a conversation by id",
      inputSchema: z.object({
        conversationId: z.string().describe("Conversation id"),
        content: z.string().optional().describe("Conversation content"),
        medium: schemas.optionalMediumSchema.describe("Conversation medium"),
        happenedAt: z.string().optional().describe("When it happened in ISO date format"),
        followUpAt: z.string().optional().describe("Follow up date in ISO format"),
        eventId: z.string().optional().describe("Linked event id"),
        participantIds: z.array(z.string()).optional().describe("Participant contact ids"),
      }),
      execute: async ({ conversationId, content, medium, happenedAt, followUpAt, eventId, participantIds }) =>
        updateConversationById(userId, conversationId, { content, medium, happenedAt, followUpAt, eventId, participantIds }),
    }),

    list_conversations_by_contacts: tool({
      description: "List conversations that include all provided contacts",
      inputSchema: z.object({
        contactIds: z.array(z.string()).describe("Contact ids"),
        cursor: z.string().optional().describe("Pagination cursor (conversation id)"),
        search: z.string().optional().describe("Search term"),
        medium: schemas.optionalMediumSchema.describe("Conversation medium"),
        limit: z.number().optional().describe("Number of results to return"),
      }),
      execute: async ({ contactIds, cursor, search, medium, limit }) =>
        listConversationsByContacts(userId, contactIds, cursor, search, medium, limit),
    }),
  };
}
