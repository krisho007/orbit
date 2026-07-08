import { z } from "zod";
import { tool } from "ai";
import { and, asc, eq, inArray, lte } from "drizzle-orm";
import { db, contacts, reminderParticipants, reminders } from "../../../db";
import { getOwnedReminder } from "../ownership";
import { enrichReminders } from "../enrichment";

type Ctx = { userId: string };

const statusEnum = z.enum(["OPEN", "DONE", "CANCELED"]);
const recurrenceEnum = z.enum(["NONE", "DAILY", "WEEKLY", "MONTHLY", "YEARLY"]);

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

export function reminderTools({ userId }: Ctx) {
  return {
    list_reminders: tool({
      description: "List reminders, optionally filtered by status. Ordered by due date ascending.",
      inputSchema: z.object({
        status: statusEnum.optional().describe("Defaults to OPEN"),
        limit: z.number().int().min(1).max(50).default(10),
      }),
      execute: async ({ status, limit }) => {
        const conditions = [eq(reminders.userId, userId)];
        conditions.push(eq(reminders.status, status ?? "OPEN"));
        const rows = await db
          .select()
          .from(reminders)
          .where(and(...conditions))
          .orderBy(asc(reminders.dueAt))
          .limit(limit);
        const enriched = await enrichReminders(rows);
        return { count: enriched.length, reminders: enriched };
      },
    }),

    list_open_reminders: tool({
      description: "Shortcut for listing OPEN reminders due soon (next 14 days by default).",
      inputSchema: z.object({
        days: z.number().int().min(1).max(90).default(14),
        limit: z.number().int().min(1).max(50).default(10),
      }),
      execute: async ({ days, limit }) => {
        const until = new Date(Date.now() + days * 86_400_000);
        const rows = await db
          .select()
          .from(reminders)
          .where(
            and(
              eq(reminders.userId, userId),
              eq(reminders.status, "OPEN"),
              lte(reminders.dueAt, until)
            )
          )
          .orderBy(asc(reminders.dueAt))
          .limit(limit);
        const enriched = await enrichReminders(rows);
        return { count: enriched.length, reminders: enriched };
      },
    }),

    get_reminder: tool({
      description: "Get a reminder by id with participants.",
      inputSchema: z.object({ reminderId: z.string() }),
      execute: async ({ reminderId }) => {
        const row = await getOwnedReminder(userId, reminderId);
        if (!row) return { error: "Reminder not found" };
        const [enriched] = await enrichReminders([row]);
        return { reminder: enriched };
      },
    }),

    create_reminder: tool({
      description: "Create a reminder with a due date. Optionally link to a conversation or participants.",
      inputSchema: z.object({
        title: z.string().min(1),
        dueAt: z.string().describe("ISO date/time"),
        notes: z.string().optional(),
        recurrence: recurrenceEnum.default("NONE"),
        recurrenceInterval: z.number().int().min(1).default(1),
        recurrenceEndsAt: z.string().optional(),
        conversationId: z.string().optional(),
        participantIds: z.array(z.string()).default([]),
      }),
      execute: async ({
        title,
        dueAt,
        notes,
        recurrence,
        recurrenceInterval,
        recurrenceEndsAt,
        conversationId,
        participantIds,
      }) => {
        const due = parseIso(dueAt);
        if (!due) return { error: "Invalid dueAt" };
        const owned = await verifyOwnedContacts(userId, participantIds);
        const [row] = await db
          .insert(reminders)
          .values({
            userId,
            title,
            notes: notes ?? null,
            dueAt: due,
            status: "OPEN",
            recurrence,
            recurrenceInterval,
            recurrenceEndsAt: parseIso(recurrenceEndsAt) ?? null,
            conversationId: conversationId ?? null,
          })
          .returning();
        if (row && owned.length > 0) {
          await db
            .insert(reminderParticipants)
            .values(owned.map((cid) => ({ reminderId: row.id, contactId: cid })))
            .onConflictDoNothing();
        }
        return { reminder: row, participantIds: owned };
      },
    }),

    update_reminder: tool({
      description: "Update fields on a reminder by id.",
      inputSchema: z.object({
        reminderId: z.string(),
        title: z.string().optional(),
        notes: z.string().nullable().optional(),
        dueAt: z.string().optional(),
        status: statusEnum.optional(),
        recurrence: recurrenceEnum.optional(),
        recurrenceInterval: z.number().int().min(1).optional(),
        recurrenceEndsAt: z.string().nullable().optional(),
        participantIds: z.array(z.string()).optional().describe("Replace participant list"),
      }),
      execute: async ({ reminderId, participantIds, ...fields }) => {
        const owned = await getOwnedReminder(userId, reminderId);
        if (!owned) return { error: "Reminder not found" };
        const patch: Record<string, unknown> = { updatedAt: new Date() };
        if (fields.title !== undefined) patch.title = fields.title;
        if (fields.notes !== undefined) patch.notes = fields.notes;
        if (fields.dueAt !== undefined) patch.dueAt = parseIso(fields.dueAt);
        if (fields.status !== undefined) patch.status = fields.status;
        if (fields.recurrence !== undefined) patch.recurrence = fields.recurrence;
        if (fields.recurrenceInterval !== undefined) patch.recurrenceInterval = fields.recurrenceInterval;
        if (fields.recurrenceEndsAt !== undefined)
          patch.recurrenceEndsAt = fields.recurrenceEndsAt ? parseIso(fields.recurrenceEndsAt) : null;
        await db.update(reminders).set(patch).where(eq(reminders.id, reminderId));
        if (participantIds !== undefined) {
          const ownedIds = await verifyOwnedContacts(userId, participantIds);
          await db.delete(reminderParticipants).where(eq(reminderParticipants.reminderId, reminderId));
          if (ownedIds.length > 0) {
            await db
              .insert(reminderParticipants)
              .values(ownedIds.map((cid) => ({ reminderId, contactId: cid })));
          }
        }
        return { ok: true, reminderId };
      },
    }),

    complete_reminder: tool({
      description: "Mark a reminder as done.",
      inputSchema: z.object({ reminderId: z.string() }),
      execute: async ({ reminderId }) => {
        const owned = await getOwnedReminder(userId, reminderId);
        if (!owned) return { error: "Reminder not found" };
        await db
          .update(reminders)
          .set({ status: "DONE", updatedAt: new Date() })
          .where(eq(reminders.id, reminderId));
        return { ok: true, reminderId };
      },
    }),

    delete_reminder: tool({
      description: "Delete a reminder by id.",
      inputSchema: z.object({ reminderId: z.string() }),
      execute: async ({ reminderId }) => {
        const owned = await getOwnedReminder(userId, reminderId);
        if (!owned) return { error: "Reminder not found" };
        await db.delete(reminders).where(eq(reminders.id, reminderId));
        return { ok: true, reminderId };
      },
    }),
  };
}
