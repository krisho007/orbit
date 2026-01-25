// Conversations API Routes
import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc, sql, ilike, or, inArray } from "drizzle-orm";
import {
  db,
  conversations,
  conversationParticipants,
  contacts,
  events,
} from "../db";
import { authMiddleware } from "../middleware/auth";

const app = new Hono();

app.use("/*", authMiddleware);

const PAGE_SIZE = 20;

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

// GET /api/conversations - List conversations with pagination
app.get("/", async (c) => {
  const userId = c.get("userId");
  const cursor = c.req.query("cursor");
  const search = c.req.query("search") || "";
  const medium = c.req.query("medium");
  const limit = parseInt(c.req.query("limit") || String(PAGE_SIZE));

  try {
    // Build base query conditions
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
    return c.json({ error: validation.error.errors }, 400);
  }

  const data = validation.data;

  try {
    const [newConversation] = await db
      .insert(conversations)
      .values({
        userId,
        content: data.content || null,
        medium: data.medium,
        happenedAt: new Date(data.happenedAt),
        followUpAt: data.followUpAt ? new Date(data.followUpAt) : null,
        eventId: data.eventId || null,
      })
      .returning();

    // Add participants
    if (data.participantIds.length > 0) {
      await db.insert(conversationParticipants).values(
        data.participantIds.map((contactId) => ({
          conversationId: newConversation.id,
          contactId,
        }))
      );
    }

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
    return c.json({ error: validation.error.errors }, 400);
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
    if (data.participantIds !== undefined) {
      await db
        .delete(conversationParticipants)
        .where(eq(conversationParticipants.conversationId, conversationId));

      if (data.participantIds.length > 0) {
        await db.insert(conversationParticipants).values(
          data.participantIds.map((contactId) => ({
            conversationId,
            contactId,
          }))
        );
      }
    }

    return c.json(updatedConversation);
  } catch (error) {
    console.error("Error updating conversation:", error);
    return c.json({ error: "Failed to update conversation" }, 500);
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

    await db.delete(conversations).where(eq(conversations.id, conversationId));

    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting conversation:", error);
    return c.json({ error: "Failed to delete conversation" }, 500);
  }
});

export default app;
