// Conversations API Routes
import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc, sql, ilike, or, inArray, isNotNull } from "drizzle-orm";
import {
  db,
  conversations,
  conversationParticipants,
  reminderParticipants,
  reminders,
  contacts,
  events,
} from "../db";
import { authMiddleware } from "../middleware/auth";
import {
  generateEmbedding,
  generateQueryEmbedding,
  generateEmbeddings,
  buildEmbeddingText,
} from "../lib/embeddings";

const app = new Hono();

app.use("/*", authMiddleware);

const PAGE_SIZE = 20;

/** Fire-and-forget: generate embedding for a conversation and store it. */
function generateAndStoreEmbedding(
  conversationId: string,
  content: string | null | undefined,
  medium: string,
  participantIds: string[]
) {
  (async () => {
    try {
      // Fetch participant names for enriched embedding text
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

// Validation schemas
const conversationMediums = [
  "PHONE_CALL",
  "WHATSAPP",
  "EMAIL",
  "CHANCE_ENCOUNTER",
  "ONLINE_MEETING",
  "IN_PERSON_MEETING",
  "OTHER",
] as const;

const createConversationSchema = z.object({
  content: z.string().optional(),
  medium: z.enum(conversationMediums),
  happenedAt: z.string(),
  followUpAt: z.string().optional(),
  eventId: z.string().optional(),
  participantIds: z.array(z.string()).min(1, "At least one participant required"),
});

const updateConversationSchema = createConversationSchema.partial();

async function verifyOwnedParticipantIds(userId: string, participantIds: string[]) {
  const uniqueIds = [...new Set(participantIds)];
  if (uniqueIds.length === 0) return { ok: false, ids: uniqueIds, missing: participantIds };

  const ownedContacts = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.userId, userId), inArray(contacts.id, uniqueIds)));

  const ownedIds = new Set(ownedContacts.map((row) => row.id));
  const missing = uniqueIds.filter((id) => !ownedIds.has(id));
  return { ok: missing.length === 0, ids: uniqueIds, missing };
}

async function buildAutoReminderTitle(participantIds: string[]) {
  if (participantIds.length === 0) return "Follow up";

  const participantNames = await db
    .select({ displayName: contacts.displayName })
    .from(contacts)
    .where(inArray(contacts.id, participantIds));

  const names = participantNames.map((row) => row.displayName).filter(Boolean);
  if (names.length === 0) return "Follow up";
  if (names.length === 1) return `Follow up with ${names[0]}`;
  if (names.length === 2) return `Follow up with ${names[0]} and ${names[1]}`;
  return `Follow up with ${names[0]} and ${names.length - 1} others`;
}

async function syncConversationFollowUpReminder(
  userId: string,
  conversationId: string,
  followUpAt: Date | null,
  participantIds: string[],
  content?: string | null
) {
  const uniqueParticipantIds = [...new Set(participantIds)];
  const title = await buildAutoReminderTitle(uniqueParticipantIds);

  const [existingAutoReminder] = await db
    .select()
    .from(reminders)
    .where(
      and(
        eq(reminders.userId, userId),
        eq(reminders.conversationId, conversationId),
        eq(reminders.isAutoFromConversation, true)
      )
    )
    .orderBy(desc(reminders.createdAt))
    .limit(1);

  if (!followUpAt) {
    if (existingAutoReminder) {
      await db
        .update(reminders)
        .set({
          status: "CANCELED",
          updatedAt: new Date(),
        })
        .where(eq(reminders.id, existingAutoReminder.id));
    }
    return;
  }

  let reminderId = existingAutoReminder?.id;

  if (existingAutoReminder) {
    await db
      .update(reminders)
      .set({
        title,
        notes: content || null,
        dueAt: followUpAt,
        status: "OPEN",
        updatedAt: new Date(),
      })
      .where(eq(reminders.id, existingAutoReminder.id));
  } else {
    const [newReminder] = await db
      .insert(reminders)
      .values({
        userId,
        title,
        notes: content || null,
        dueAt: followUpAt,
        status: "OPEN",
        conversationId,
        isAutoFromConversation: true,
      })
      .returning({ id: reminders.id });
    reminderId = newReminder?.id;
  }

  if (!reminderId) {
    return;
  }

  await db.delete(reminderParticipants).where(eq(reminderParticipants.reminderId, reminderId));
  if (uniqueParticipantIds.length > 0) {
    await db.insert(reminderParticipants).values(
      uniqueParticipantIds.map((contactId) => ({
        reminderId,
        contactId,
      }))
    );
  }
}

// GET /api/conversations/by-contacts - List conversations involving all provided contacts
app.get("/by-contacts", async (c) => {
  const userId = c.get("userId");
  const contactIdsRaw = c.req.query("contactIds") || "";
  const cursor = c.req.query("cursor");
  const search = c.req.query("search") || "";
  const medium = c.req.query("medium");
  const limit = parseInt(c.req.query("limit") || String(PAGE_SIZE));

  const contactIds = [
    ...new Set(
      contactIdsRaw
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id.length > 0)
    ),
  ];

  if (contactIds.length === 0) {
    return c.json({ error: "contactIds query param is required" }, 400);
  }

  try {
    // Verify contacts belong to user
    const ownedContacts = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.userId, userId), inArray(contacts.id, contactIds)));

    if (ownedContacts.length !== contactIds.length) {
      return c.json({ error: "Contact not found" }, 404);
    }

    // Find conversations that include all requested contacts.
    const convIdsResult = await db
      .select({
        conversationId: conversationParticipants.conversationId,
      })
      .from(conversationParticipants)
      .where(inArray(conversationParticipants.contactId, contactIds))
      .groupBy(conversationParticipants.conversationId)
      .having(
        sql`COUNT(DISTINCT ${conversationParticipants.contactId}) = ${contactIds.length}`
      );

    const convIds = convIdsResult.map((row) => row.conversationId);

    if (convIds.length === 0) {
      return c.json({ conversations: [], nextCursor: null });
    }

    const conditions = [
      eq(conversations.userId, userId),
      inArray(conversations.id, convIds),
    ];

    if (medium && conversationMediums.includes(medium as any)) {
      conditions.push(eq(conversations.medium, medium as any));
    }

    if (search) {
      conditions.push(ilike(conversations.content, `%${search}%`));
    }

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
        .limit(limit + 1);
    } else {
      conversationsList = await db
        .select()
        .from(conversations)
        .where(and(...conditions))
        .orderBy(desc(conversations.happenedAt))
        .limit(limit + 1);
    }

    let nextCursor: string | null = null;
    if (conversationsList.length > limit) {
      const nextItem = conversationsList.pop();
      nextCursor = nextItem?.id || null;
    }

    const conversationIds = conversationsList.map((conv) => conv.id);

    const [participantsData, eventsData] = await Promise.all([
      conversationIds.length > 0
        ? db
            .select()
            .from(conversationParticipants)
            .innerJoin(contacts, eq(conversationParticipants.contactId, contacts.id))
            .where(inArray(conversationParticipants.conversationId, conversationIds))
        : [],
      conversationIds.length > 0
        ? db
            .select({ id: events.id, title: events.title, conversationEventId: conversations.id })
            .from(events)
            .innerJoin(conversations, eq(conversations.eventId, events.id))
            .where(inArray(conversations.id, conversationIds))
        : [],
    ]);

    const enrichedConversations = conversationsList.map((conv) => ({
      ...conv,
      participants: participantsData
        .filter((p: any) => p.conversation_participants.conversationId === conv.id)
        .map((p: any) => ({
          ...p.conversation_participants,
          contact: p.contacts,
        })),
      event: eventsData.find((e: any) => conv.eventId === e.id) || null,
    }));

    return c.json({
      conversations: enrichedConversations,
      nextCursor,
    });
  } catch (error) {
    console.error("Error fetching conversations by contacts:", error);
    return c.json({ error: "Failed to fetch conversations" }, 500);
  }
});

// GET /api/conversations - List conversations with pagination
app.get("/", async (c) => {
  const userId = c.get("userId");
  const cursor = c.req.query("cursor");
  const search = c.req.query("search") || "";
  const medium = c.req.query("medium");
  const semantic = c.req.query("semantic") === "true";
  const limit = parseInt(c.req.query("limit") || String(PAGE_SIZE));

  try {
    // Semantic search path
    if (semantic && search) {
      const queryEmbedding = await generateQueryEmbedding(search);
      const embeddingStr = JSON.stringify(queryEmbedding);
      const distance = sql`${conversations.embedding} <=> ${embeddingStr}::vector`;

      const conditions = [
        eq(conversations.userId, userId),
        isNotNull(conversations.embedding),
        sql`(${conversations.embedding} <=> ${embeddingStr}::vector) < 0.5`,
      ];

      if (medium && conversationMediums.includes(medium as any)) {
        conditions.push(eq(conversations.medium, medium as any));
      }

      const conversationsList = await db
        .select({
          id: conversations.id,
          userId: conversations.userId,
          content: conversations.content,
          medium: conversations.medium,
          happenedAt: conversations.happenedAt,
          followUpAt: conversations.followUpAt,
          eventId: conversations.eventId,
          assistantConversationId: conversations.assistantConversationId,
          createdAt: conversations.createdAt,
          updatedAt: conversations.updatedAt,
          similarity: sql<number>`1 - (${conversations.embedding} <=> ${embeddingStr}::vector)`,
        })
        .from(conversations)
        .where(and(...conditions))
        .orderBy(sql`${conversations.embedding} <=> ${embeddingStr}::vector`)
        .limit(limit);

      const conversationIds = conversationsList.map((conv) => conv.id);

      const [participantsData, eventsData] = await Promise.all([
        conversationIds.length > 0
          ? db
              .select()
              .from(conversationParticipants)
              .innerJoin(contacts, eq(conversationParticipants.contactId, contacts.id))
              .where(inArray(conversationParticipants.conversationId, conversationIds))
          : [],
        conversationIds.length > 0
          ? db
              .select({ id: events.id, title: events.title, conversationEventId: conversations.id })
              .from(events)
              .innerJoin(conversations, eq(conversations.eventId, events.id))
              .where(inArray(conversations.id, conversationIds))
          : [],
      ]);

      const enrichedConversations = conversationsList.map((conv) => ({
        ...conv,
        participants: participantsData
          .filter((p: any) => p.conversation_participants.conversationId === conv.id)
          .map((p: any) => ({
            ...p.conversation_participants,
            contact: p.contacts,
          })),
        event: eventsData.find((e: any) => conv.eventId === e.id) || null,
      }));

      return c.json({
        conversations: enrichedConversations,
        nextCursor: null,
      });
    }

    // Standard keyword search path
    const conditions = [eq(conversations.userId, userId)];

    if (medium && conversationMediums.includes(medium as any)) {
      conditions.push(eq(conversations.medium, medium as any));
    }

    if (search) {
      conditions.push(ilike(conversations.content, `%${search}%`));
    }

    // Fetch conversations
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
        .limit(limit + 1);
    } else {
      conversationsList = await db
        .select()
        .from(conversations)
        .where(and(...conditions))
        .orderBy(desc(conversations.happenedAt))
        .limit(limit + 1);
    }

    // Check for more results
    let nextCursor: string | null = null;
    if (conversationsList.length > limit) {
      const nextItem = conversationsList.pop();
      nextCursor = nextItem?.id || null;
    }

    // Get participants for each conversation
    const conversationIds = conversationsList.map((conv) => conv.id);

    const [participantsData, eventsData] = await Promise.all([
      conversationIds.length > 0
        ? db
            .select()
            .from(conversationParticipants)
            .innerJoin(contacts, eq(conversationParticipants.contactId, contacts.id))
            .where(inArray(conversationParticipants.conversationId, conversationIds))
        : [],
      conversationIds.length > 0
        ? db
            .select({ id: events.id, title: events.title, conversationEventId: conversations.id })
            .from(events)
            .innerJoin(conversations, eq(conversations.eventId, events.id))
            .where(inArray(conversations.id, conversationIds))
        : [],
    ]);

    // Enrich conversations
    const enrichedConversations = conversationsList.map((conv) => ({
      ...conv,
      participants: participantsData
        .filter((p: any) => p.conversation_participants.conversationId === conv.id)
        .map((p: any) => ({
          ...p.conversation_participants,
          contact: p.contacts,
        })),
      event: eventsData.find((e: any) => conv.eventId === e.id) || null,
    }));

    // Get stats on first load
    let stats = null;
    if (!cursor && !search && !medium) {
      const [totalResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(conversations)
        .where(eq(conversations.userId, userId));

      stats = {
        totalCount: Number(totalResult?.count || 0),
      };
    }

    return c.json({
      conversations: enrichedConversations,
      nextCursor,
      stats,
    });
  } catch (error) {
    console.error("Error fetching conversations:", error);
    return c.json({ error: "Failed to fetch conversations" }, 500);
  }
});

// GET /api/conversations/:id - Get single conversation
app.get("/:id", async (c) => {
  const userId = c.get("userId");
  const conversationId = c.req.param("id");

  try {
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(
        and(eq(conversations.id, conversationId), eq(conversations.userId, userId))
      );

    if (!conversation) {
      return c.json({ error: "Conversation not found" }, 404);
    }

    // Get participants
    const participantsData = await db
      .select()
      .from(conversationParticipants)
      .innerJoin(contacts, eq(conversationParticipants.contactId, contacts.id))
      .where(eq(conversationParticipants.conversationId, conversationId));

    // Get linked event if any
    let event = null;
    if (conversation.eventId) {
      const [eventData] = await db
        .select({ id: events.id, title: events.title })
        .from(events)
        .where(eq(events.id, conversation.eventId));
      event = eventData || null;
    }

    return c.json({
      ...conversation,
      participants: participantsData.map((p) => ({
        ...p.conversation_participants,
        contact: p.contacts,
      })),
      event,
    });
  } catch (error) {
    console.error("Error fetching conversation:", error);
    return c.json({ error: "Failed to fetch conversation" }, 500);
  }
});

// POST /api/conversations - Create conversation
app.post("/", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();

  const validation = createConversationSchema.safeParse(body);
  if (!validation.success) {
    return c.json({ error: validation.error.issues }, 400);
  }

  const data = validation.data;

  try {
    const participantOwnership = await verifyOwnedParticipantIds(userId, data.participantIds);
    if (!participantOwnership.ok) {
      return c.json({ error: `Contacts not found: ${participantOwnership.missing.join(", ")}` }, 404);
    }

    const [newConversation] = await db
      .insert(conversations)
      .values({
        userId,
        content: data.content || null,
        medium: data.medium,
        happenedAt: new Date(data.happenedAt),
        followUpAt: data.followUpAt ? new Date(data.followUpAt) : null,
        eventId: data.eventId || null,
        updatedAt: new Date(),
      })
      .returning();

    if (!newConversation) {
      return c.json({ error: "Failed to create conversation" }, 500);
    }

    // Add participants
    const uniqueParticipantIds = participantOwnership.ids;
    if (uniqueParticipantIds.length > 0) {
      await db.insert(conversationParticipants).values(
        uniqueParticipantIds.map((contactId) => ({
          conversationId: newConversation.id,
          contactId,
        }))
      );
    }

    await syncConversationFollowUpReminder(
      userId,
      newConversation.id,
      newConversation.followUpAt,
      uniqueParticipantIds,
      newConversation.content
    );

    // Fire-and-forget embedding generation
    generateAndStoreEmbedding(
      newConversation.id,
      newConversation.content,
      newConversation.medium,
      uniqueParticipantIds
    );

    return c.json(newConversation, 201);
  } catch (error) {
    console.error("Error creating conversation:", error);
    return c.json({ error: "Failed to create conversation" }, 500);
  }
});

// PUT /api/conversations/:id - Update conversation
app.put("/:id", async (c) => {
  const userId = c.get("userId");
  const conversationId = c.req.param("id");
  const body = await c.req.json();

  const validation = updateConversationSchema.safeParse(body);
  if (!validation.success) {
    return c.json({ error: validation.error.issues }, 400);
  }

  const data = validation.data;

  try {
    // Verify ownership
    const [existing] = await db
      .select({ userId: conversations.userId })
      .from(conversations)
      .where(eq(conversations.id, conversationId));

    if (!existing || existing.userId !== userId) {
      return c.json({ error: "Conversation not found" }, 404);
    }

    if (data.participantIds !== undefined) {
      const participantOwnership = await verifyOwnedParticipantIds(userId, data.participantIds);
      if (!participantOwnership.ok) {
        return c.json({ error: `Contacts not found: ${participantOwnership.missing.join(", ")}` }, 404);
      }
      data.participantIds = participantOwnership.ids;
    }

    // Build update object
    const updateData: any = { updatedAt: new Date() };
    if (data.content !== undefined) updateData.content = data.content || null;
    if (data.medium !== undefined) updateData.medium = data.medium;
    if (data.happenedAt !== undefined)
      updateData.happenedAt = new Date(data.happenedAt);
    if (data.followUpAt !== undefined)
      updateData.followUpAt = data.followUpAt ? new Date(data.followUpAt) : null;
    if (data.eventId !== undefined) updateData.eventId = data.eventId || null;

    const [updatedConversation] = await db
      .update(conversations)
      .set(updateData)
      .where(eq(conversations.id, conversationId))
      .returning();

    // Update participants if provided
    let participantIdsForReminder: string[] | null = null;
    if (data.participantIds !== undefined) {
      participantIdsForReminder = [...new Set(data.participantIds)];
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

    // Regenerate embedding if content or medium changed
    if (data.content !== undefined || data.medium !== undefined || data.participantIds !== undefined) {
      generateAndStoreEmbedding(
        conversationId,
        updatedConversation?.content,
        updatedConversation?.medium || "OTHER",
        participantIdsForReminder
      );
    }

    return c.json(updatedConversation);
  } catch (error) {
    console.error("Error updating conversation:", error);
    return c.json({ error: "Failed to update conversation" }, 500);
  }
});

// POST /api/conversations/embeddings/backfill - Generate embeddings for conversations that don't have one
app.post("/embeddings/backfill", async (c) => {
  const userId = c.get("userId");
  const BATCH_SIZE = 100;

  try {
    // Find conversations with content but no embedding
    const toEmbed = await db
      .select({
        id: conversations.id,
        content: conversations.content,
        medium: conversations.medium,
      })
      .from(conversations)
      .where(
        and(
          eq(conversations.userId, userId),
          isNotNull(conversations.content),
          sql`${conversations.embedding} IS NULL`
        )
      )
      .orderBy(desc(conversations.happenedAt))
      .limit(BATCH_SIZE);

    if (toEmbed.length === 0) {
      return c.json({ processed: 0, remaining: 0 });
    }

    // Get participant names for each conversation
    const convIds = toEmbed.map((c) => c.id);
    const participantsData = await db
      .select({
        conversationId: conversationParticipants.conversationId,
        displayName: contacts.displayName,
      })
      .from(conversationParticipants)
      .innerJoin(contacts, eq(conversationParticipants.contactId, contacts.id))
      .where(inArray(conversationParticipants.conversationId, convIds));

    // Group participant names by conversation
    const participantsByConv = new Map<string, string[]>();
    for (const row of participantsData) {
      const names = participantsByConv.get(row.conversationId) || [];
      names.push(row.displayName);
      participantsByConv.set(row.conversationId, names);
    }

    // Build texts for embedding
    const texts = toEmbed.map((conv) =>
      buildEmbeddingText({
        content: conv.content,
        medium: conv.medium,
        participantNames: participantsByConv.get(conv.id) || [],
      })
    );

    // Generate embeddings in batch
    const embeddings = await generateEmbeddings(texts);

    // Update each conversation with its embedding
    let processed = 0;
    for (let i = 0; i < toEmbed.length; i++) {
      const conv = toEmbed[i];
      const emb = embeddings[i];
      if (conv && emb) {
        await db
          .update(conversations)
          .set({ embedding: emb })
          .where(eq(conversations.id, conv.id));
        processed++;
      }
    }

    // Count remaining
    const [remainingResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(conversations)
      .where(
        and(
          eq(conversations.userId, userId),
          isNotNull(conversations.content),
          sql`${conversations.embedding} IS NULL`
        )
      );

    return c.json({
      processed,
      remaining: Number(remainingResult?.count || 0),
    });
  } catch (error) {
    console.error("Error backfilling embeddings:", error);
    return c.json({ error: "Failed to backfill embeddings" }, 500);
  }
});

// DELETE /api/conversations/:id - Delete conversation
app.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const conversationId = c.req.param("id");

  try {
    // Verify ownership
    const [existing] = await db
      .select({ userId: conversations.userId })
      .from(conversations)
      .where(eq(conversations.id, conversationId));

    if (!existing || existing.userId !== userId) {
      return c.json({ error: "Conversation not found" }, 404);
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

    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting conversation:", error);
    return c.json({ error: "Failed to delete conversation" }, 500);
  }
});

export default app;
