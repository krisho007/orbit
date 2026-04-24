import { z } from "zod";
import { tool } from "ai";
import { and, asc, desc, eq, gte, ilike, inArray, or, sql } from "drizzle-orm";
import { db, contacts, events, eventParticipants } from "../../../db";
import { getOwnedEvent } from "../ownership";
import { enrichEvents } from "../enrichment";

type Ctx = { userId: string };

const eventTypeEnum = z.enum([
  "MEETING",
  "CALL",
  "BIRTHDAY",
  "ANNIVERSARY",
  "CONFERENCE",
  "SOCIAL",
  "FAMILY_EVENT",
  "JOURNAL",
  "OTHER",
]);

function parseIso(v?: string): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d;
}

async function verifyOwnedContacts(userId: string, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.userId, userId), inArray(contacts.id, ids)));
  return rows.map((r) => r.id);
}

export function eventTools({ userId }: Ctx) {
  return {
    search_events: tool({
      description:
        "Search events by title/description/location, type, participant, or date range.",
      inputSchema: z.object({
        query: z.string().optional(),
        eventType: eventTypeEnum.optional(),
        participantId: z.string().optional(),
        since: z.string().optional(),
        until: z.string().optional(),
        limit: z.number().int().min(1).max(50).default(10),
      }),
      execute: async ({ query, eventType, participantId, since, until, limit }) => {
        const conditions = [eq(events.userId, userId)];
        if (eventType) conditions.push(eq(events.eventType, eventType));
        if (query) {
          conditions.push(
            or(
              ilike(events.title, `%${query}%`),
              ilike(events.description, `%${query}%`),
              ilike(events.location, `%${query}%`)
            )!
          );
        }
        const sinceDate = parseIso(since);
        const untilDate = parseIso(until);
        if (sinceDate) conditions.push(sql`${events.startAt} >= ${sinceDate}`);
        if (untilDate) conditions.push(sql`${events.startAt} <= ${untilDate}`);
        if (participantId) {
          const ids = await db
            .select({ id: eventParticipants.eventId })
            .from(eventParticipants)
            .where(eq(eventParticipants.contactId, participantId));
          const eventIds = ids.map((r) => r.id);
          if (eventIds.length === 0) return { count: 0, events: [] };
          conditions.push(inArray(events.id, eventIds));
        }
        const rows = await db
          .select()
          .from(events)
          .where(and(...conditions))
          .orderBy(desc(events.startAt))
          .limit(limit);
        const enriched = await enrichEvents(rows);
        return { count: enriched.length, events: enriched };
      },
    }),

    get_event: tool({
      description: "Get an event by id with participants.",
      inputSchema: z.object({ eventId: z.string() }),
      execute: async ({ eventId }) => {
        const row = await getOwnedEvent(userId, eventId);
        if (!row) return { error: "Event not found" };
        const [enriched] = await enrichEvents([row]);
        return { event: enriched };
      },
    }),

    create_event: tool({
      description:
        "Create an event (meeting, call, birthday, journal entry, etc.). Use when the user gives enough detail; otherwise prefer open_event_create_form.",
      inputSchema: z.object({
        title: z.string().min(1),
        eventType: eventTypeEnum,
        startAt: z.string().describe("ISO start time"),
        endAt: z.string().optional().describe("ISO end time"),
        description: z.string().optional(),
        location: z.string().optional(),
        participantIds: z.array(z.string()).default([]),
      }),
      execute: async ({ title, eventType, startAt, endAt, description, location, participantIds }) => {
        const start = parseIso(startAt);
        if (!start) return { error: "Invalid startAt" };
        const end = parseIso(endAt);
        const owned = await verifyOwnedContacts(userId, participantIds);
        const [row] = await db
          .insert(events)
          .values({
            userId,
            title,
            eventType,
            startAt: start,
            endAt: end ?? null,
            description: description ?? null,
            location: location ?? null,
          })
          .returning();
        if (row && owned.length > 0) {
          await db
            .insert(eventParticipants)
            .values(owned.map((cid) => ({ eventId: row.id, contactId: cid })))
            .onConflictDoNothing();
        }
        return { event: row, participantIds: owned };
      },
    }),

    update_event: tool({
      description: "Update fields on an event by id.",
      inputSchema: z.object({
        eventId: z.string(),
        title: z.string().optional(),
        eventType: eventTypeEnum.optional(),
        startAt: z.string().optional(),
        endAt: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
        location: z.string().nullable().optional(),
        participantIds: z.array(z.string()).optional().describe("Replace participant list"),
      }),
      execute: async ({ eventId, participantIds, ...fields }) => {
        const owned = await getOwnedEvent(userId, eventId);
        if (!owned) return { error: "Event not found" };
        const patch: Record<string, unknown> = { updatedAt: new Date() };
        if (fields.title !== undefined) patch.title = fields.title;
        if (fields.eventType !== undefined) patch.eventType = fields.eventType;
        if (fields.startAt !== undefined) patch.startAt = parseIso(fields.startAt);
        if (fields.endAt !== undefined) patch.endAt = fields.endAt ? parseIso(fields.endAt) : null;
        if (fields.description !== undefined) patch.description = fields.description;
        if (fields.location !== undefined) patch.location = fields.location;
        await db.update(events).set(patch).where(eq(events.id, eventId));
        if (participantIds !== undefined) {
          const ownedIds = await verifyOwnedContacts(userId, participantIds);
          await db.delete(eventParticipants).where(eq(eventParticipants.eventId, eventId));
          if (ownedIds.length > 0) {
            await db
              .insert(eventParticipants)
              .values(ownedIds.map((cid) => ({ eventId, contactId: cid })));
          }
        }
        return { ok: true, eventId };
      },
    }),

    delete_event: tool({
      description: "Delete an event by id.",
      inputSchema: z.object({ eventId: z.string() }),
      execute: async ({ eventId }) => {
        const owned = await getOwnedEvent(userId, eventId);
        if (!owned) return { error: "Event not found" };
        await db.delete(events).where(eq(events.id, eventId));
        return { ok: true, eventId };
      },
    }),

    list_upcoming_events: tool({
      description: "List events starting from now onwards (upcoming + today).",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(50).default(10),
      }),
      execute: async ({ limit }) => {
        const rows = await db
          .select()
          .from(events)
          .where(and(eq(events.userId, userId), gte(events.startAt, new Date())))
          .orderBy(asc(events.startAt))
          .limit(limit);
        const enriched = await enrichEvents(rows);
        return { count: enriched.length, events: enriched };
      },
    }),
  };
}
