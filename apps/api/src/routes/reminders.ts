import { Hono } from "hono";
import { z } from "zod";
import { and, asc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import {
  contacts,
  conversations,
  db,
  reminderParticipants,
  reminders,
} from "../db";
import { authMiddleware } from "../middleware/auth";

const app = new Hono();

app.use("/*", authMiddleware);

const PAGE_SIZE = 20;
const reminderStatuses = ["OPEN", "DONE", "CANCELED"] as const;
const reminderRecurrenceModes = ["NONE", "DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as const;

const createReminderSchema = z.object({
  title: z.string().optional(),
  notes: z.string().optional(),
  dueAt: z.string(),
  status: z.enum(reminderStatuses).optional(),
  recurrence: z.enum(reminderRecurrenceModes).optional(),
  recurrenceInterval: z.number().int().positive().optional(),
  recurrenceEndsAt: z.string().optional().nullable(),
  conversationId: z.string().optional(),
  participantIds: z.array(z.string()).optional(),
});

const updateReminderSchema = z.object({
  title: z.string().optional(),
  notes: z.string().optional(),
  dueAt: z.string().optional(),
  status: z.enum(reminderStatuses).optional(),
  recurrence: z.enum(reminderRecurrenceModes).optional(),
  recurrenceInterval: z.number().int().positive().optional(),
  recurrenceEndsAt: z.string().optional().nullable(),
  conversationId: z.string().optional().nullable(),
  participantIds: z.array(z.string()).optional(),
});

function computeNextDueAt(
  currentDueAt: Date,
  recurrence: (typeof reminderRecurrenceModes)[number],
  recurrenceInterval: number
): Date | null {
  if (recurrence === "NONE") return null;

  const next = new Date(currentDueAt);
  const interval = Math.max(1, recurrenceInterval);

  if (recurrence === "DAILY") next.setDate(next.getDate() + interval);
  if (recurrence === "WEEKLY") next.setDate(next.getDate() + interval * 7);
  if (recurrence === "MONTHLY") next.setMonth(next.getMonth() + interval);
  if (recurrence === "YEARLY") next.setFullYear(next.getFullYear() + interval);

  return Number.isNaN(next.getTime()) ? null : next;
}

async function getOwnedReminder(userId: string, reminderId: string) {
  const [existing] = await db
    .select()
    .from(reminders)
    .where(and(eq(reminders.id, reminderId), eq(reminders.userId, userId)));

  return existing || null;
}

async function verifyOwnedParticipants(userId: string, participantIds: string[]) {
  const uniqueIds = [...new Set(participantIds)];
  if (uniqueIds.length === 0) {
    return { ok: true, missing: [], ids: [] as string[] };
  }

  const ownedContacts = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.userId, userId), inArray(contacts.id, uniqueIds)));

  const ownedIds = new Set(ownedContacts.map((row) => row.id));
  const missing = uniqueIds.filter((id) => !ownedIds.has(id));
  return {
    ok: missing.length === 0,
    missing,
    ids: uniqueIds,
  };
}

async function enrichReminders(remindersList: any[]) {
  const reminderIds = remindersList.map((row) => row.id);
  const conversationIds = remindersList
    .map((row) => row.conversationId)
    .filter((id: string | null): id is string => Boolean(id));

  const [participantsData, conversationData] = await Promise.all([
    reminderIds.length > 0
      ? db
          .select()
          .from(reminderParticipants)
          .innerJoin(contacts, eq(reminderParticipants.contactId, contacts.id))
          .where(inArray(reminderParticipants.reminderId, reminderIds))
      : [],
    conversationIds.length > 0
      ? db
          .select({ id: conversations.id, medium: conversations.medium, happenedAt: conversations.happenedAt })
          .from(conversations)
          .where(inArray(conversations.id, conversationIds))
      : [],
  ]);

  return remindersList.map((reminder) => ({
    ...reminder,
    participants: participantsData
      .filter((row: any) => row.reminder_participants.reminderId === reminder.id)
      .map((row: any) => ({
        ...row.reminder_participants,
        contact: row.contacts,
      })),
    conversation:
      conversationData.find((conversation) => conversation.id === reminder.conversationId) || null,
  }));
}

app.get("/", async (c) => {
  const userId = c.get("userId");
  const cursor = c.req.query("cursor");
  const search = c.req.query("search") || "";
  const status = c.req.query("status");
  const dueBefore = c.req.query("dueBefore");
  const dueAfter = c.req.query("dueAfter");
  const contactId = c.req.query("contactId");
  const limit = parseInt(c.req.query("limit") || String(PAGE_SIZE));

  if (status && !reminderStatuses.includes(status as any)) {
    return c.json({ error: "Invalid status" }, 400);
  }

  const dueBeforeDate = dueBefore ? new Date(dueBefore) : null;
  const dueAfterDate = dueAfter ? new Date(dueAfter) : null;
  if (dueBefore && (!dueBeforeDate || Number.isNaN(dueBeforeDate.getTime()))) {
    return c.json({ error: "Invalid dueBefore date" }, 400);
  }
  if (dueAfter && (!dueAfterDate || Number.isNaN(dueAfterDate.getTime()))) {
    return c.json({ error: "Invalid dueAfter date" }, 400);
  }

  try {
    const conditions = [eq(reminders.userId, userId)];

    if (status) {
      conditions.push(eq(reminders.status, status as any));
    }
    if (search) {
      conditions.push(or(ilike(reminders.title, `%${search}%`), ilike(reminders.notes, `%${search}%`))!);
    }
    if (dueBeforeDate) {
      conditions.push(sql`${reminders.dueAt} <= ${dueBeforeDate}`);
    }
    if (dueAfterDate) {
      conditions.push(sql`${reminders.dueAt} >= ${dueAfterDate}`);
    }

    if (contactId) {
      const [ownedContact] = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(and(eq(contacts.userId, userId), eq(contacts.id, contactId)))
        .limit(1);

      if (!ownedContact) {
        return c.json({ error: "Contact not found" }, 404);
      }

      const reminderIdsResult = await db
        .select({ reminderId: reminderParticipants.reminderId })
        .from(reminderParticipants)
        .where(eq(reminderParticipants.contactId, contactId));
      const reminderIds = reminderIdsResult.map((row) => row.reminderId);

      if (reminderIds.length === 0) {
        return c.json({ reminders: [], nextCursor: null, stats: { totalCount: 0 } });
      }

      conditions.push(inArray(reminders.id, reminderIds));
    }

    let remindersList;
    if (cursor) {
      remindersList = await db
        .select()
        .from(reminders)
        .where(
          and(
            ...conditions,
            sql`(
              ${reminders.dueAt} > (SELECT "dueAt" FROM reminders WHERE id = ${cursor})
              OR (
                ${reminders.dueAt} = (SELECT "dueAt" FROM reminders WHERE id = ${cursor})
                AND ${reminders.id} > ${cursor}
              )
            )`
          )
        )
        .orderBy(asc(reminders.dueAt), asc(reminders.id))
        .limit(limit + 1);
    } else {
      remindersList = await db
        .select()
        .from(reminders)
        .where(and(...conditions))
        .orderBy(asc(reminders.dueAt), asc(reminders.id))
        .limit(limit + 1);
    }

    let nextCursor: string | null = null;
    if (remindersList.length > limit) {
      const nextItem = remindersList.pop();
      nextCursor = nextItem?.id || null;
    }

    const enrichedReminders = await enrichReminders(remindersList);

    let stats = null;
    if (!cursor) {
      const [totalResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(reminders)
        .where(and(...conditions));
      stats = { totalCount: Number(totalResult?.count || 0) };
    }

    return c.json({
      reminders: enrichedReminders,
      nextCursor,
      stats,
    });
  } catch (error) {
    console.error("Error fetching reminders:", error);
    return c.json({ error: "Failed to fetch reminders" }, 500);
  }
});

app.get("/:id", async (c) => {
  const userId = c.get("userId");
  const reminderId = c.req.param("id");

  try {
    const reminder = await getOwnedReminder(userId, reminderId);
    if (!reminder) {
      return c.json({ error: "Reminder not found" }, 404);
    }

    const [enrichedReminder] = await enrichReminders([reminder]);
    return c.json(enrichedReminder);
  } catch (error) {
    console.error("Error fetching reminder:", error);
    return c.json({ error: "Failed to fetch reminder" }, 500);
  }
});

app.post("/", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();

  const validation = createReminderSchema.safeParse(body);
  if (!validation.success) {
    return c.json({ error: validation.error.issues }, 400);
  }

  const data = validation.data;
  const dueAtDate = new Date(data.dueAt);
  if (Number.isNaN(dueAtDate.getTime())) {
    return c.json({ error: "Invalid dueAt date" }, 400);
  }
  const recurrenceEndsAtDate =
    data.recurrenceEndsAt === undefined || data.recurrenceEndsAt === null
      ? null
      : new Date(data.recurrenceEndsAt);
  if (
    data.recurrenceEndsAt !== undefined &&
    data.recurrenceEndsAt !== null &&
    (!recurrenceEndsAtDate || Number.isNaN(recurrenceEndsAtDate.getTime()))
  ) {
    return c.json({ error: "Invalid recurrenceEndsAt date" }, 400);
  }

  try {
    const participantIds = data.participantIds || [];
    const ownership = await verifyOwnedParticipants(userId, participantIds);
    if (!ownership.ok) {
      return c.json({ error: `Contacts not found: ${ownership.missing.join(", ")}` }, 404);
    }

    if (data.conversationId) {
      const [conversation] = await db
        .select({ id: conversations.id })
        .from(conversations)
        .where(and(eq(conversations.id, data.conversationId), eq(conversations.userId, userId)))
        .limit(1);

      if (!conversation) {
        return c.json({ error: "Conversation not found" }, 404);
      }
    }

    const [newReminder] = await db
      .insert(reminders)
      .values({
        userId,
        title: data.title?.trim() || "Follow up",
        notes: data.notes || null,
        dueAt: dueAtDate,
        status: data.status || "OPEN",
        recurrence: data.recurrence || "NONE",
        recurrenceInterval: data.recurrenceInterval || 1,
        recurrenceEndsAt: recurrenceEndsAtDate,
        conversationId: data.conversationId || null,
        isAutoFromConversation: false,
      })
      .returning();

    if (!newReminder) {
      return c.json({ error: "Failed to create reminder" }, 500);
    }

    if (ownership.ids && ownership.ids.length > 0) {
      await db.insert(reminderParticipants).values(
        ownership.ids.map((contactId) => ({
          reminderId: newReminder.id,
          contactId,
        }))
      );
    }

    const [enrichedReminder] = await enrichReminders([newReminder]);
    return c.json(enrichedReminder, 201);
  } catch (error) {
    console.error("Error creating reminder:", error);
    return c.json({ error: "Failed to create reminder" }, 500);
  }
});

app.put("/:id", async (c) => {
  const userId = c.get("userId");
  const reminderId = c.req.param("id");
  const body = await c.req.json();

  const validation = updateReminderSchema.safeParse(body);
  if (!validation.success) {
    return c.json({ error: validation.error.issues }, 400);
  }

  const data = validation.data;

  try {
    const existingReminder = await getOwnedReminder(userId, reminderId);
    if (!existingReminder) {
      return c.json({ error: "Reminder not found" }, 404);
    }

    if (data.conversationId) {
      const [conversation] = await db
        .select({ id: conversations.id })
        .from(conversations)
        .where(and(eq(conversations.id, data.conversationId), eq(conversations.userId, userId)))
        .limit(1);

      if (!conversation) {
        return c.json({ error: "Conversation not found" }, 404);
      }
    }

    if (data.participantIds !== undefined) {
      const ownership = await verifyOwnedParticipants(userId, data.participantIds);
      if (!ownership.ok) {
        return c.json({ error: `Contacts not found: ${ownership.missing.join(", ")}` }, 404);
      }
    }

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (data.title !== undefined) updateData.title = data.title?.trim() || "Follow up";
    if (data.notes !== undefined) updateData.notes = data.notes || null;
    if (data.dueAt !== undefined) {
      const parsed = new Date(data.dueAt);
      if (Number.isNaN(parsed.getTime())) {
        return c.json({ error: "Invalid dueAt date" }, 400);
      }
      updateData.dueAt = parsed;
    }
    if (data.status !== undefined) updateData.status = data.status;
    if (data.recurrence !== undefined) updateData.recurrence = data.recurrence;
    if (data.recurrenceInterval !== undefined) {
      updateData.recurrenceInterval = data.recurrenceInterval;
    }
    if (data.recurrenceEndsAt !== undefined) {
      if (data.recurrenceEndsAt === null || data.recurrenceEndsAt === "") {
        updateData.recurrenceEndsAt = null;
      } else {
        const parsed = new Date(data.recurrenceEndsAt);
        if (Number.isNaN(parsed.getTime())) {
          return c.json({ error: "Invalid recurrenceEndsAt date" }, 400);
        }
        updateData.recurrenceEndsAt = parsed;
      }
    }
    if (data.conversationId !== undefined) updateData.conversationId = data.conversationId || null;

    const effectiveRecurrence =
      (data.recurrence as (typeof reminderRecurrenceModes)[number] | undefined) ||
      (existingReminder.recurrence as (typeof reminderRecurrenceModes)[number]);
    const effectiveInterval = data.recurrenceInterval || existingReminder.recurrenceInterval || 1;
    const effectiveCurrentDueAt =
      data.dueAt !== undefined ? new Date(data.dueAt) : new Date(existingReminder.dueAt);
    const effectiveEndsAt =
      data.recurrenceEndsAt !== undefined
        ? data.recurrenceEndsAt
          ? new Date(data.recurrenceEndsAt)
          : null
        : existingReminder.recurrenceEndsAt;

    // Completing a recurring reminder moves it to the next due date instead of closing it,
    // until the recurrence end date is reached.
    if (data.status === "DONE" && effectiveRecurrence !== "NONE") {
      const nextDueAt = computeNextDueAt(
        effectiveCurrentDueAt,
        effectiveRecurrence,
        effectiveInterval
      );

      if (!nextDueAt) {
        return c.json({ error: "Failed to compute next due date for recurring reminder" }, 400);
      }

      if (effectiveEndsAt && nextDueAt > new Date(effectiveEndsAt)) {
        updateData.status = "DONE";
      } else {
        updateData.status = "OPEN";
        updateData.dueAt = nextDueAt;
      }
    }

    const [updatedReminder] = await db
      .update(reminders)
      .set(updateData)
      .where(eq(reminders.id, reminderId))
      .returning();

    if (!updatedReminder) {
      return c.json({ error: "Reminder not found" }, 404);
    }

    if (data.participantIds !== undefined) {
      const participantIds = [...new Set(data.participantIds)];
      await db
        .delete(reminderParticipants)
        .where(eq(reminderParticipants.reminderId, reminderId));

      if (participantIds.length > 0) {
        await db.insert(reminderParticipants).values(
          participantIds.map((contactId) => ({
            reminderId,
            contactId,
          }))
        );
      }
    }

    const [enrichedReminder] = await enrichReminders([updatedReminder]);
    return c.json(enrichedReminder);
  } catch (error) {
    console.error("Error updating reminder:", error);
    return c.json({ error: "Failed to update reminder" }, 500);
  }
});

app.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const reminderId = c.req.param("id");

  try {
    const existingReminder = await getOwnedReminder(userId, reminderId);
    if (!existingReminder) {
      return c.json({ error: "Reminder not found" }, 404);
    }

    await db
      .delete(reminderParticipants)
      .where(eq(reminderParticipants.reminderId, reminderId));
    await db.delete(reminders).where(eq(reminders.id, reminderId));

    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting reminder:", error);
    return c.json({ error: "Failed to delete reminder" }, 500);
  }
});

export default app;
