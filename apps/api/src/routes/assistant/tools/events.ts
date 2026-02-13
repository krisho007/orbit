import { z } from "zod";
import { tool } from "ai";
import { eq, and, desc, sql, ilike, or, inArray } from "drizzle-orm";
import {
  db,
  contacts,
  conversations,
  conversationParticipants,
  events,
  eventParticipants,
} from "../../../db";
import type { ToolResult } from "../types";
import { PAGE_SIZE } from "../types";
import { assertValidEventType, assertValidMedium } from "../enums";
import { getOwnedEvent } from "../ownership";
import { findBestContactMatch } from "../db-helpers";
import { enrichEvents } from "../enrichment";
import type { EnumSchemas } from "./contacts";

// ── Implementation functions ─────────────────────────────────────────

export async function createEvent(
  userId: string,
  title: string,
  startAt: string,
  participantIds?: string[],
  endAt?: string,
  location?: string,
  description?: string,
  eventType?: string
): Promise<ToolResult> {
  let resolvedParticipantIds: string[] = [];

  if (participantIds && participantIds.length > 0) {
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

    resolvedParticipantIds = participantIds;
  }

  if (!eventType) {
    return { type: "error", message: "eventType is required" };
  }

  const [event] = await db
    .insert(events)
    .values({
      title,
      description: description || null,
      eventType: assertValidEventType(eventType),
      startAt: new Date(startAt),
      endAt: endAt ? new Date(endAt) : null,
      location: location || null,
      userId,
    })
    .returning();

  if (!event) {
    return { type: "error", message: "Failed to create event" };
  }

  // Add participants
  if (resolvedParticipantIds.length > 0) {
    await db.insert(eventParticipants).values(
      resolvedParticipantIds.map((contactId) => ({
        eventId: event.id,
        contactId,
      }))
    );
  }

  // Get participant names
  const participantContacts =
    resolvedParticipantIds.length > 0
      ? await db
          .select({ displayName: contacts.displayName })
          .from(contacts)
          .where(sql`${contacts.id} = ANY(${resolvedParticipantIds})`)
      : [];

  return {
    type: "event_created",
    id: event.id,
    title: event.title,
    eventType: event.eventType,
    startAt: event.startAt,
    location: event.location,
    participants: participantContacts.map((p) => p.displayName),
  };
}

export async function queryEvents(
  userId: string,
  participantName?: string,
  limit?: number
): Promise<ToolResult> {
  console.log(`[assistant:tool] queryEvents — participant="${participantName || "any"}", limit=${limit || 10}`);
  const takeLimit = Math.min(limit || 10, 10);
  let contactFilter: string | null = null;
  if (participantName) {
    const contact = await findBestContactMatch(userId, participantName);
    if (contact) {
      contactFilter = contact.id;
      console.log(`[assistant:tool] queryEvents — filtering by contact: ${contact.displayName} (${contact.id})`);
    } else {
      console.log(`[assistant:tool] queryEvents — no contact found for "${participantName}", returning unfiltered`);
    }
  }

  // When filtering by participant, use a subquery to avoid the post-hoc filtering bug
  // where matching events beyond the limit would be missed
  const conditions = [eq(events.userId, userId)];
  if (contactFilter) {
    const participantEventIds = db
      .select({ eventId: eventParticipants.eventId })
      .from(eventParticipants)
      .where(eq(eventParticipants.contactId, contactFilter));

    conditions.push(inArray(events.id, participantEventIds));
  }

  const eventsList = await db
    .select()
    .from(events)
    .where(and(...conditions))
    .orderBy(desc(events.startAt))
    .limit(takeLimit);

  // Get participants for each event
  const eventIds = eventsList.map((e) => e.id);
  const participants =
    eventIds.length > 0
      ? await db
          .select()
          .from(eventParticipants)
          .innerJoin(contacts, eq(eventParticipants.contactId, contacts.id))
          .where(sql`${eventParticipants.eventId} = ANY(${eventIds})`)
      : [];

  console.log(`[assistant:tool] queryEvents — returning ${eventsList.length} event(s)`);

  return {
    type: "events_found",
    count: eventsList.length,
    events: eventsList.map((e) => ({
      id: e.id,
      title: e.title,
      startAt: e.startAt,
      location: e.location,
      participants: participants
        .filter((p: any) => p.event_participants.eventId === e.id)
        .map((p: any) => p.contacts.displayName),
    })),
  };
}

export async function listEvents(
  userId: string,
  cursor?: string,
  search?: string,
  eventType?: string,
  limit?: number
): Promise<ToolResult> {
  const conditions = [eq(events.userId, userId)];
  if (eventType) {
    conditions.push(eq(events.eventType, assertValidEventType(eventType)));
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

  const takeLimit = limit || PAGE_SIZE;
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
      .limit(takeLimit + 1);
  } else {
    eventsList = await db
      .select()
      .from(events)
      .where(and(...conditions))
      .orderBy(desc(events.startAt))
      .limit(takeLimit + 1);
  }

  let nextCursor: string | null = null;
  if (eventsList.length > takeLimit) {
    const nextItem = eventsList.pop();
    nextCursor = nextItem?.id || null;
  }

  const enrichedEvents = await enrichEvents(eventsList);

  let stats = null;
  if (!cursor && !search && !eventType) {
    const [totalResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(events)
      .where(eq(events.userId, userId));

    stats = { totalCount: Number(totalResult?.count || 0) };
  }

  return {
    type: "events_found",
    count: enrichedEvents.length,
    events: enrichedEvents,
    nextCursor,
    stats,
  };
}

export async function getEventById(userId: string, eventId: string): Promise<ToolResult> {
  const event = await getOwnedEvent(userId, eventId);

  if (!event) {
    return { type: "error", message: "Event not found" };
  }

  const participantsData = await db
    .select()
    .from(eventParticipants)
    .innerJoin(contacts, eq(eventParticipants.contactId, contacts.id))
    .where(eq(eventParticipants.eventId, eventId));

  const linkedConversations = await db
    .select()
    .from(conversations)
    .where(eq(conversations.eventId, eventId))
    .orderBy(desc(conversations.happenedAt));

  return {
    type: "event_details",
    ...event,
    participants: participantsData.map((p) => ({
      ...p.event_participants,
      contact: p.contacts,
    })),
    conversations: linkedConversations,
  };
}

export async function createEventByIds(
  userId: string,
  payload: {
    title: string;
    description?: string;
    eventType: string;
    startAt: string;
    endAt?: string;
    location?: string;
    participantIds?: string[];
  }
): Promise<ToolResult> {
  const [newEvent] = await db
    .insert(events)
    .values({
      userId,
      title: payload.title,
      description: payload.description || null,
      eventType: assertValidEventType(payload.eventType),
      startAt: new Date(payload.startAt),
      endAt: payload.endAt ? new Date(payload.endAt) : null,
      location: payload.location || null,
    })
    .returning();

  if (!newEvent) {
    return { type: "error", message: "Failed to create event" };
  }

  if (payload.participantIds && payload.participantIds.length > 0) {
    await db.insert(eventParticipants).values(
      payload.participantIds.map((contactId) => ({
        eventId: newEvent.id,
        contactId,
      }))
    );
  }

  const participantContacts =
    payload.participantIds && payload.participantIds.length > 0
      ? await db
          .select({ displayName: contacts.displayName })
          .from(contacts)
          .where(sql`${contacts.id} = ANY(${payload.participantIds})`)
      : [];

  return {
    type: "event_created",
    id: newEvent.id,
    title: newEvent.title,
    startAt: newEvent.startAt,
    location: newEvent.location,
    participants: participantContacts.map((p) => p.displayName),
  };
}

export async function updateEventById(
  userId: string,
  eventId: string,
  updates: {
    title?: string;
    description?: string;
    eventType?: string;
    startAt?: string;
    endAt?: string;
    location?: string;
    participantIds?: string[];
  }
): Promise<ToolResult> {
  const existing = await getOwnedEvent(userId, eventId);

  if (!existing) {
    return { type: "error", message: "Event not found" };
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (updates.title !== undefined) updateData.title = updates.title;
  if (updates.description !== undefined)
    updateData.description = updates.description || null;
  if (updates.eventType !== undefined) updateData.eventType = assertValidEventType(updates.eventType);
  if (updates.startAt !== undefined) updateData.startAt = new Date(updates.startAt);
  if (updates.endAt !== undefined)
    updateData.endAt = updates.endAt ? new Date(updates.endAt) : null;
  if (updates.location !== undefined) updateData.location = updates.location || null;

  await db.update(events).set(updateData).where(eq(events.id, eventId));

  if (updates.participantIds !== undefined) {
    await db.delete(eventParticipants).where(eq(eventParticipants.eventId, eventId));

    if (updates.participantIds.length > 0) {
      await db.insert(eventParticipants).values(
        updates.participantIds.map((contactId) => ({
          eventId,
          contactId,
        }))
      );
    }
  }

  return { type: "event_updated", id: eventId };
}

export async function deleteEventById(userId: string, eventId: string): Promise<ToolResult> {
  const existing = await getOwnedEvent(userId, eventId);

  if (!existing) {
    return { type: "error", message: "Event not found" };
  }

  await db.update(conversations).set({ eventId: null }).where(eq(conversations.eventId, eventId));
  await db.delete(events).where(eq(events.id, eventId));

  return { type: "event_deleted", id: eventId };
}

export async function listEventConversations(
  userId: string,
  eventId: string,
  cursor?: string,
  search?: string,
  medium?: string,
  limit?: number
): Promise<ToolResult> {
  const event = await getOwnedEvent(userId, eventId);
  if (!event) return { type: "error", message: "Event not found" };

  const conditions = [eq(conversations.userId, userId), eq(conversations.eventId, eventId)];

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

  const conversationIds = conversationsList.map((conv) => conv.id);
  const participantsData =
    conversationIds.length > 0
      ? await db
          .select()
          .from(conversationParticipants)
          .innerJoin(contacts, eq(conversationParticipants.contactId, contacts.id))
          .where(inArray(conversationParticipants.conversationId, conversationIds))
      : [];

  const enrichedConversations = conversationsList.map((conv) => ({
    ...conv,
    participants: participantsData
      .filter((p: any) => p.conversation_participants.conversationId === conv.id)
      .map((p: any) => ({
        ...p.conversation_participants,
        contact: p.contacts,
      })),
    event: { id: event.id, title: event.title },
  }));

  return {
    type: "conversations_found",
    count: enrichedConversations.length,
    conversations: enrichedConversations,
    nextCursor,
  };
}

export async function listEventContacts(
  userId: string,
  eventId: string
): Promise<ToolResult> {
  const event = await getOwnedEvent(userId, eventId);
  if (!event) return { type: "error", message: "Event not found" };

  const participantsData = await db
    .select()
    .from(eventParticipants)
    .innerJoin(contacts, eq(eventParticipants.contactId, contacts.id))
    .where(eq(eventParticipants.eventId, eventId));

  return {
    type: "event_contacts",
    contacts: participantsData.map((p: any) => ({
      ...p.event_participants,
      contact: p.contacts,
    })),
  };
}

// ── Tool definitions ─────────────────────────────────────────────────

export function createEventTools(userId: string, schemas: EnumSchemas) {
  return {
    create_event: tool({
      description: "Create a new event. Use participant contact IDs when linking contacts.",
      inputSchema: z.object({
        title: z.string().describe("Event title"),
        participantIds: z.array(z.string()).optional().describe("Participant contact IDs"),
        startAt: z.string().describe("Start date/time in ISO format"),
        endAt: z.string().optional().describe("End date/time in ISO format"),
        location: z.string().optional().describe("Event location"),
        description: z.string().optional().describe("Event description"),
        eventType: schemas.eventTypeSchema.describe("Event type value"),
      }),
      execute: async ({ title, participantIds, startAt, endAt, location, description, eventType }) =>
        createEvent(userId, title, startAt, participantIds, endAt, location, description, eventType),
    }),

    query_events: tool({
      description: "Search and retrieve events",
      inputSchema: z.object({
        participantName: z.string().optional().describe("Name of participant to filter by"),
        limit: z.number().optional().describe("Number of results to return, defaults to 10"),
      }),
      execute: async ({ participantName, limit }) => queryEvents(userId, participantName, limit),
    }),

    searchEvents: tool({
      description: "Search events for context resolution",
      inputSchema: z.object({
        searchTerm: z.string().optional().describe("Event text search"),
        participantName: z.string().optional().describe("Participant name"),
        eventType: schemas.optionalEventTypeSchema.describe("Event type filter"),
        limit: z.number().optional().describe("Maximum results"),
      }),
      execute: async ({ searchTerm, participantName, eventType, limit }) => {
        if (participantName && !searchTerm && !eventType) {
          return queryEvents(userId, participantName, limit);
        }
        return listEvents(userId, undefined, searchTerm, eventType, limit);
      },
    }),

    list_events: tool({
      description: "List events with optional pagination and filters",
      inputSchema: z.object({
        cursor: z.string().optional().describe("Pagination cursor (event id)"),
        search: z.string().optional().describe("Search term"),
        eventType: schemas.optionalEventTypeSchema.describe("Event type"),
        limit: z.number().optional().describe("Number of results to return"),
      }),
      execute: async ({ cursor, search, eventType, limit }) =>
        listEvents(userId, cursor, search, eventType, limit),
    }),

    get_event: tool({
      description: "Get a single event by id",
      inputSchema: z.object({
        eventId: z.string().describe("Event id"),
      }),
      execute: async ({ eventId }) => getEventById(userId, eventId),
    }),

    create_event_by_ids: tool({
      description: "Create an event using participant ids",
      inputSchema: z.object({
        title: z.string().describe("Event title"),
        description: z.string().optional().describe("Event description"),
        eventType: schemas.eventTypeSchema.describe("Event type"),
        startAt: z.string().describe("Start date/time in ISO format"),
        endAt: z.string().optional().describe("End date/time in ISO format"),
        location: z.string().optional().describe("Event location"),
        participantIds: z.array(z.string()).optional().describe("Participant contact ids"),
      }),
      execute: async ({ title, description, eventType, startAt, endAt, location, participantIds }) =>
        createEventByIds(userId, { title, description, eventType, startAt, endAt, location, participantIds }),
    }),

    update_event_by_id: tool({
      description: "Update an event by id",
      inputSchema: z.object({
        eventId: z.string().describe("Event id"),
        title: z.string().optional().describe("Event title"),
        description: z.string().optional().describe("Event description"),
        eventType: schemas.optionalEventTypeSchema.describe("Event type"),
        startAt: z.string().optional().describe("Start date/time in ISO format"),
        endAt: z.string().optional().describe("End date/time in ISO format"),
        location: z.string().optional().describe("Event location"),
        participantIds: z.array(z.string()).optional().describe("Participant contact ids"),
      }),
      execute: async ({ eventId, title, description, eventType, startAt, endAt, location, participantIds }) =>
        updateEventById(userId, eventId, { title, description, eventType, startAt, endAt, location, participantIds }),
    }),

    list_event_conversations: tool({
      description: "List conversations for an event",
      inputSchema: z.object({
        eventId: z.string().describe("Event id"),
        cursor: z.string().optional().describe("Pagination cursor (conversation id)"),
        search: z.string().optional().describe("Search term"),
        medium: schemas.optionalMediumSchema.describe("Conversation medium"),
        limit: z.number().optional().describe("Number of results to return"),
      }),
      execute: async ({ eventId, cursor, search, medium, limit }) =>
        listEventConversations(userId, eventId, cursor, search, medium, limit),
    }),

    list_event_contacts: tool({
      description: "List contacts for an event",
      inputSchema: z.object({
        eventId: z.string().describe("Event id"),
      }),
      execute: async ({ eventId }) => listEventContacts(userId, eventId),
    }),
  };
}
