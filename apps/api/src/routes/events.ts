// Events API Routes
import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc, sql, ilike, or, inArray } from "drizzle-orm";
import {
  db,
  events,
  eventParticipants,
  contacts,
  conversations,
} from "../db";
import { authMiddleware } from "../middleware/auth";

const app = new Hono();

app.use("/*", authMiddleware);

const PAGE_SIZE = 20;

// Validation schemas
const eventTypes = [
  "MEETING",
  "CALL",
  "BIRTHDAY",
  "ANNIVERSARY",
  "CONFERENCE",
  "SOCIAL",
  "FAMILY_EVENT",
  "OTHER",
] as const;

const createEventSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  eventType: z.enum(eventTypes),
  startAt: z.string(),
  endAt: z.string().optional(),
  location: z.string().optional(),
  participantIds: z.array(z.string()).optional(),
});

const updateEventSchema = createEventSchema.partial();

// GET /api/events - List events with pagination
app.get("/", async (c) => {
  const userId = c.get("userId");
  const cursor = c.req.query("cursor");
  const search = c.req.query("search") || "";
  const eventType = c.req.query("eventType");
  const limit = parseInt(c.req.query("limit") || String(PAGE_SIZE));

  try {
    // Build base query conditions
    const conditions = [eq(events.userId, userId)];

    if (eventType && eventTypes.includes(eventType as any)) {
      conditions.push(eq(events.eventType, eventType as any));
    }

    if (search) {
      conditions.push(
        or(
          ilike(events.title, `%${search}%`),
          ilike(events.description, `%${search}%`),
          ilike(events.location, `%${search}%`)
        )!
      );
    }

    // Fetch events
    let eventsList;
    if (cursor) {
      eventsList = await db
        .select()
        .from(events)
        .where(
          and(
            ...conditions,
            sql`${events.startAt} < (SELECT "startAt" FROM events WHERE id = ${cursor})`
          )
        )
        .orderBy(desc(events.startAt))
        .limit(limit + 1);
    } else {
      eventsList = await db
        .select()
        .from(events)
        .where(and(...conditions))
        .orderBy(desc(events.startAt))
        .limit(limit + 1);
    }

    // Check for more results
    let nextCursor: string | null = null;
    if (eventsList.length > limit) {
      const nextItem = eventsList.pop();
      nextCursor = nextItem?.id || null;
    }

    // Get participants and conversation counts
    const eventIds = eventsList.map((evt) => evt.id);

    const [participantsData, conversationCounts] = await Promise.all([
      eventIds.length > 0
        ? db
            .select()
            .from(eventParticipants)
            .innerJoin(contacts, eq(eventParticipants.contactId, contacts.id))
            .where(inArray(eventParticipants.eventId, eventIds))
        : [],
      eventIds.length > 0
        ? db
            .select({
              eventId: conversations.eventId,
              count: sql<number>`count(*)`,
            })
            .from(conversations)
            .where(inArray(conversations.eventId, eventIds))
            .groupBy(conversations.eventId)
        : [],
    ]);

    // Enrich events
    const enrichedEvents = eventsList.map((evt) => ({
      ...evt,
      participants: participantsData
        .filter((p: any) => p.event_participants.eventId === evt.id)
        .map((p: any) => ({
          ...p.event_participants,
          contact: p.contacts,
        })),
      _count: {
        conversations:
          conversationCounts.find((cc: any) => cc.eventId === evt.id)?.count || 0,
      },
    }));

    // Get stats on first load
    let stats = null;
    if (!cursor && !search && !eventType) {
      const [totalResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(events)
        .where(eq(events.userId, userId));

      stats = {
        totalCount: Number(totalResult?.count || 0),
      };
    }

    return c.json({
      events: enrichedEvents,
      nextCursor,
      stats,
    });
  } catch (error) {
    console.error("Error fetching events:", error);
    return c.json({ error: "Failed to fetch events" }, 500);
  }
});

// GET /api/events/:id - Get single event
app.get("/:id", async (c) => {
  const userId = c.get("userId");
  const eventId = c.req.param("id");

  try {
    const [event] = await db
      .select()
      .from(events)
      .where(and(eq(events.id, eventId), eq(events.userId, userId)));

    if (!event) {
      return c.json({ error: "Event not found" }, 404);
    }

    // Get participants
    const participantsData = await db
      .select()
      .from(eventParticipants)
      .innerJoin(contacts, eq(eventParticipants.contactId, contacts.id))
      .where(eq(eventParticipants.eventId, eventId));

    // Get linked conversations
    const linkedConversations = await db
      .select()
      .from(conversations)
      .where(eq(conversations.eventId, eventId))
      .orderBy(desc(conversations.happenedAt));

    return c.json({
      ...event,
      participants: participantsData.map((p) => ({
        ...p.event_participants,
        contact: p.contacts,
      })),
      conversations: linkedConversations,
    });
  } catch (error) {
    console.error("Error fetching event:", error);
    return c.json({ error: "Failed to fetch event" }, 500);
  }
});

// POST /api/events - Create event
app.post("/", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();

  const validation = createEventSchema.safeParse(body);
  if (!validation.success) {
    return c.json({ error: validation.error.errors }, 400);
  }

  const data = validation.data;

  try {
    const [newEvent] = await db
      .insert(events)
      .values({
        userId,
        title: data.title,
        description: data.description || null,
        eventType: data.eventType,
        startAt: new Date(data.startAt),
        endAt: data.endAt ? new Date(data.endAt) : null,
        location: data.location || null,
      })
      .returning();

    // Add participants if provided
    if (data.participantIds && data.participantIds.length > 0) {
      await db.insert(eventParticipants).values(
        data.participantIds.map((contactId) => ({
          eventId: newEvent.id,
          contactId,
        }))
      );
    }

    return c.json(newEvent, 201);
  } catch (error) {
    console.error("Error creating event:", error);
    return c.json({ error: "Failed to create event" }, 500);
  }
});

// PUT /api/events/:id - Update event
app.put("/:id", async (c) => {
  const userId = c.get("userId");
  const eventId = c.req.param("id");
  const body = await c.req.json();

  const validation = updateEventSchema.safeParse(body);
  if (!validation.success) {
    return c.json({ error: validation.error.errors }, 400);
  }

  const data = validation.data;

  try {
    // Verify ownership
    const [existing] = await db
      .select({ userId: events.userId })
      .from(events)
      .where(eq(events.id, eventId));

    if (!existing || existing.userId !== userId) {
      return c.json({ error: "Event not found" }, 404);
    }

    // Build update object
    const updateData: any = { updatedAt: new Date() };
    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined)
      updateData.description = data.description || null;
    if (data.eventType !== undefined) updateData.eventType = data.eventType;
    if (data.startAt !== undefined) updateData.startAt = new Date(data.startAt);
    if (data.endAt !== undefined)
      updateData.endAt = data.endAt ? new Date(data.endAt) : null;
    if (data.location !== undefined) updateData.location = data.location || null;

    const [updatedEvent] = await db
      .update(events)
      .set(updateData)
      .where(eq(events.id, eventId))
      .returning();

    // Update participants if provided
    if (data.participantIds !== undefined) {
      await db
        .delete(eventParticipants)
        .where(eq(eventParticipants.eventId, eventId));

      if (data.participantIds.length > 0) {
        await db.insert(eventParticipants).values(
          data.participantIds.map((contactId) => ({
            eventId,
            contactId,
          }))
        );
      }
    }

    return c.json(updatedEvent);
  } catch (error) {
    console.error("Error updating event:", error);
    return c.json({ error: "Failed to update event" }, 500);
  }
});

// DELETE /api/events/:id - Delete event
app.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const eventId = c.req.param("id");

  try {
    // Verify ownership
    const [existing] = await db
      .select({ userId: events.userId })
      .from(events)
      .where(eq(events.id, eventId));

    if (!existing || existing.userId !== userId) {
      return c.json({ error: "Event not found" }, 404);
    }

    // Unlink conversations first
    await db
      .update(conversations)
      .set({ eventId: null })
      .where(eq(conversations.eventId, eventId));

    await db.delete(events).where(eq(events.id, eventId));

    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting event:", error);
    return c.json({ error: "Failed to delete event" }, 500);
  }
});

export default app;
