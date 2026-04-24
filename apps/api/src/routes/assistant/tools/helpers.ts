import { z } from "zod";
import { tool } from "ai";
import { and, asc, desc, eq, gte } from "drizzle-orm";
import {
  db,
  conversations,
  conversationParticipants,
  events,
  eventParticipants,
  reminders,
  reminderParticipants,
  users,
} from "../../../db";
import { getOwnedContact } from "../ownership";
import { enrichConversations, enrichEvents, enrichReminders } from "../enrichment";

type Ctx = { userId: string };

export function helperTools({ userId }: Ctx) {
  return {
    get_user_profile: tool({
      description:
        "Get the logged-in user's profile (name, email, plan, their primary contact id). Use this when the user refers to themselves.",
      inputSchema: z.object({}),
      execute: async () => {
        const [row] = await db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            plan: users.plan,
            primaryContactId: users.primaryContactId,
          })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);
        return { user: row ?? null };
      },
    }),

    get_contact_timeline: tool({
      description:
        "Get a chronological view of a contact: their recent conversations, upcoming events, and open reminders.",
      inputSchema: z.object({
        contactId: z.string(),
        conversationsLimit: z.number().int().min(1).max(20).default(5),
        eventsLimit: z.number().int().min(1).max(20).default(5),
        remindersLimit: z.number().int().min(1).max(20).default(5),
      }),
      execute: async ({ contactId, conversationsLimit, eventsLimit, remindersLimit }) => {
        const owned = await getOwnedContact(userId, contactId);
        if (!owned) return { error: "Contact not found" };

        const [convRows, eventRows, reminderRows] = await Promise.all([
          db
            .select({ id: conversations.id })
            .from(conversationParticipants)
            .innerJoin(
              conversations,
              and(
                eq(conversations.id, conversationParticipants.conversationId),
                eq(conversations.userId, userId)
              )
            )
            .where(eq(conversationParticipants.contactId, contactId))
            .orderBy(desc(conversations.happenedAt))
            .limit(conversationsLimit),
          db
            .select({ id: events.id })
            .from(eventParticipants)
            .innerJoin(
              events,
              and(eq(events.id, eventParticipants.eventId), eq(events.userId, userId))
            )
            .where(and(eq(eventParticipants.contactId, contactId), gte(events.startAt, new Date())))
            .orderBy(asc(events.startAt))
            .limit(eventsLimit),
          db
            .select({ id: reminders.id })
            .from(reminderParticipants)
            .innerJoin(
              reminders,
              and(eq(reminders.id, reminderParticipants.reminderId), eq(reminders.userId, userId))
            )
            .where(and(eq(reminderParticipants.contactId, contactId), eq(reminders.status, "OPEN")))
            .orderBy(asc(reminders.dueAt))
            .limit(remindersLimit),
        ]);

        const [convDetails, eventDetails, reminderDetails] = await Promise.all([
          convRows.length
            ? db.select().from(conversations).where(eq(conversations.userId, userId))
                .then((all) => all.filter((r) => convRows.some((c) => c.id === r.id)))
            : Promise.resolve([]),
          eventRows.length
            ? db.select().from(events).where(eq(events.userId, userId))
                .then((all) => all.filter((r) => eventRows.some((c) => c.id === r.id)))
            : Promise.resolve([]),
          reminderRows.length
            ? db.select().from(reminders).where(eq(reminders.userId, userId))
                .then((all) => all.filter((r) => reminderRows.some((c) => c.id === r.id)))
            : Promise.resolve([]),
        ]);

        const [convEnriched, eventEnriched, reminderEnriched] = await Promise.all([
          enrichConversations(convDetails),
          enrichEvents(eventDetails),
          enrichReminders(reminderDetails),
        ]);

        return {
          contact: { id: owned.id, displayName: owned.displayName },
          conversations: convEnriched,
          events: eventEnriched,
          reminders: reminderEnriched,
        };
      },
    }),
  };
}
