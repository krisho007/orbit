import { z } from "zod";
import { tool } from "ai";
import { eq, and, sql, ilike, asc, or, inArray } from "drizzle-orm";
import {
  db,
  contacts,
  reminders,
  reminderParticipants,
} from "../../../db";
import type { ToolResult } from "../types";
import { PAGE_SIZE } from "../types";
import { assertValidReminderStatus } from "../enums";
import { getOwnedContact, getOwnedConversation, getOwnedReminder } from "../ownership";
import { enrichReminders } from "../enrichment";

// ── Implementation functions ─────────────────────────────────────────

export async function listReminders(
  userId: string,
  cursor?: string,
  search?: string,
  status?: string,
  dueBefore?: string,
  dueAfter?: string,
  contactId?: string,
  limit?: number
): Promise<ToolResult> {
  const conditions = [eq(reminders.userId, userId)];

  if (status) {
    conditions.push(eq(reminders.status, assertValidReminderStatus(status)));
  }
  if (search) {
    conditions.push(or(ilike(reminders.title, `%${search}%`), ilike(reminders.notes, `%${search}%`))!);
  }
  if (dueBefore) {
    const parsed = new Date(dueBefore);
    if (!Number.isNaN(parsed.getTime())) {
      conditions.push(sql`${reminders.dueAt} <= ${parsed}`);
    }
  }
  if (dueAfter) {
    const parsed = new Date(dueAfter);
    if (!Number.isNaN(parsed.getTime())) {
      conditions.push(sql`${reminders.dueAt} >= ${parsed}`);
    }
  }
  if (contactId) {
    const contact = await getOwnedContact(userId, contactId);
    if (!contact) return { type: "error", message: "Contact not found" };

    const reminderIdsResult = await db
      .select({ reminderId: reminderParticipants.reminderId })
      .from(reminderParticipants)
      .where(eq(reminderParticipants.contactId, contactId));

    const reminderIds = reminderIdsResult.map((row) => row.reminderId);
    if (reminderIds.length === 0) {
      return { type: "reminders_found", count: 0, reminders: [], nextCursor: null };
    }

    conditions.push(inArray(reminders.id, reminderIds));
  }

  const takeLimit = limit || PAGE_SIZE;
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
      .limit(takeLimit + 1);
  } else {
    remindersList = await db
      .select()
      .from(reminders)
      .where(and(...conditions))
      .orderBy(asc(reminders.dueAt), asc(reminders.id))
      .limit(takeLimit + 1);
  }

  let nextCursor: string | null = null;
  if (remindersList.length > takeLimit) {
    const nextItem = remindersList.pop();
    nextCursor = nextItem?.id || null;
  }

  const enrichedReminders = await enrichReminders(remindersList);

  return {
    type: "reminders_found",
    count: enrichedReminders.length,
    reminders: enrichedReminders,
    nextCursor,
  };
}

export async function getReminderById(userId: string, reminderId: string): Promise<ToolResult> {
  const reminder = await getOwnedReminder(userId, reminderId);
  if (!reminder) return { type: "error", message: "Reminder not found" };

  const [enrichedReminder] = await enrichReminders([reminder]);
  return {
    type: "reminder_details",
    ...enrichedReminder,
  };
}

export async function createReminderByIds(
  userId: string,
  payload: {
    title?: string;
    notes?: string;
    dueAt: string;
    status?: string;
    conversationId?: string;
    participantIds?: string[];
  },
  assistantConversationId?: string
): Promise<ToolResult> {
  try {
  const uniqueParticipantIds = [...new Set(payload.participantIds ?? [])];

  if (uniqueParticipantIds.length > 0) {
    const ownedContacts = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.userId, userId), inArray(contacts.id, uniqueParticipantIds)));
    if (ownedContacts.length !== uniqueParticipantIds.length) {
      return { type: "error", message: "Contact not found" };
    }
  }

  if (payload.conversationId) {
    const conversation = await getOwnedConversation(userId, payload.conversationId);
    if (!conversation) {
      return { type: "error", message: "Conversation not found" };
    }
  }

  const [newReminder] = await db
    .insert(reminders)
    .values({
      userId,
      title: payload.title?.trim() || "Follow up",
      notes: payload.notes || null,
      dueAt: new Date(payload.dueAt),
      status: payload.status || "OPEN",
      conversationId: payload.conversationId || null,
      isAutoFromConversation: false,
      assistantConversationId: assistantConversationId || null,
    })
    .returning();

  if (!newReminder) {
    return { type: "error", message: "Failed to create reminder" };
  }

  if (uniqueParticipantIds.length > 0) {
    await db.insert(reminderParticipants).values(
      uniqueParticipantIds.map((contactId) => ({
        reminderId: newReminder.id,
        contactId,
      }))
    );
  }

  const participantContacts = uniqueParticipantIds.length > 0
    ? await db
        .select({ displayName: contacts.displayName })
        .from(contacts)
        .where(inArray(contacts.id, uniqueParticipantIds))
    : [];

  return {
    type: "reminder_created",
    id: newReminder.id,
    title: newReminder.title,
    dueAt: newReminder.dueAt,
    status: newReminder.status,
    participants: participantContacts.map((p) => p.displayName),
  };
  } catch (err) {
    console.error(`[assistant:tool] createReminderByIds FAILED:`, err);
    return { type: "error", message: `Failed to create reminder: ${String(err)}` };
  }
}

export async function updateReminderById(
  userId: string,
  reminderId: string,
  updates: {
    title?: string;
    notes?: string;
    dueAt?: string;
    status?: string;
    conversationId?: string;
    participantIds?: string[];
  }
): Promise<ToolResult> {
  const existing = await getOwnedReminder(userId, reminderId);
  if (!existing) return { type: "error", message: "Reminder not found" };

  if (updates.conversationId !== undefined && updates.conversationId) {
    const conversation = await getOwnedConversation(userId, updates.conversationId);
    if (!conversation) {
      return { type: "error", message: "Conversation not found" };
    }
  }

  if (updates.participantIds !== undefined) {
    const uniqueIds = [...new Set(updates.participantIds)];
    if (uniqueIds.length > 0) {
      const ownedContacts = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(and(eq(contacts.userId, userId), inArray(contacts.id, uniqueIds)));
      if (ownedContacts.length !== uniqueIds.length) {
        return { type: "error", message: "Contact not found" };
      }
    }
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (updates.title !== undefined) updateData.title = updates.title?.trim() || "Follow up";
  if (updates.notes !== undefined) updateData.notes = updates.notes || null;
  if (updates.dueAt !== undefined) updateData.dueAt = new Date(updates.dueAt);
  if (updates.status !== undefined) updateData.status = updates.status;
  if (updates.conversationId !== undefined) updateData.conversationId = updates.conversationId || null;

  await db.update(reminders).set(updateData).where(eq(reminders.id, reminderId));

  if (updates.participantIds !== undefined) {
    const uniqueIds = [...new Set(updates.participantIds)];
    await db.delete(reminderParticipants).where(eq(reminderParticipants.reminderId, reminderId));
    if (uniqueIds.length > 0) {
      await db.insert(reminderParticipants).values(
        uniqueIds.map((contactId) => ({
          reminderId,
          contactId,
        }))
      );
    }
  }

  return { type: "reminder_updated", id: reminderId };
}

export async function completeReminderById(
  userId: string,
  reminderId: string,
  status: "DONE" | "CANCELED" = "DONE"
): Promise<ToolResult> {
  const existing = await getOwnedReminder(userId, reminderId);
  if (!existing) return { type: "error", message: "Reminder not found" };

  await db
    .update(reminders)
    .set({ status, updatedAt: new Date() })
    .where(eq(reminders.id, reminderId));

  return { type: "reminder_updated", id: reminderId };
}

export async function deleteReminderById(userId: string, reminderId: string): Promise<ToolResult> {
  const existing = await getOwnedReminder(userId, reminderId);
  if (!existing) return { type: "error", message: "Reminder not found" };

  await db.delete(reminderParticipants).where(eq(reminderParticipants.reminderId, reminderId));
  await db.delete(reminders).where(eq(reminders.id, reminderId));
  return { type: "reminder_deleted", id: reminderId };
}

// ── Tool definitions ─────────────────────────────────────────────────

export function createReminderTools(userId: string, schemas: { optionalReminderStatusSchema: any; completionStatusSchema: any }, assistantConversationId?: string) {
  return {
    list_reminders: tool({
      description: "List reminders with optional pagination and filters",
      inputSchema: z.object({
        cursor: z.string().optional().describe("Pagination cursor (reminder id)"),
        search: z.string().optional().describe("Search term"),
        status: schemas.optionalReminderStatusSchema.describe("Reminder status"),
        dueBefore: z.string().optional().describe("Due before ISO date"),
        dueAfter: z.string().optional().describe("Due after ISO date"),
        contactId: z.string().optional().describe("Filter by participant contact id"),
        limit: z.number().optional().describe("Number of results to return"),
      }),
      execute: async ({ cursor, search, status, dueBefore, dueAfter, contactId, limit }) =>
        listReminders(userId, cursor, search, status, dueBefore, dueAfter, contactId, limit),
    }),

    get_reminder: tool({
      description: "Get a single reminder by id",
      inputSchema: z.object({
        reminderId: z.string().describe("Reminder id"),
      }),
      execute: async ({ reminderId }) => getReminderById(userId, reminderId),
    }),

    create_reminder_by_ids: tool({
      description: "Create a reminder, optionally linking it to contact ids",
      inputSchema: z.object({
        title: z.string().optional().describe("Reminder title"),
        notes: z.string().optional().describe("Reminder notes"),
        dueAt: z.string().describe("Due date/time as full ISO 8601 datetime, e.g. 2026-02-21T09:00:00.000Z"),
        status: schemas.optionalReminderStatusSchema.describe("Reminder status"),
        conversationId: z.string().optional().describe("Linked conversation id"),
        participantIds: z.array(z.string()).optional().describe("Participant contact ids"),
      }),
      execute: async ({ title, notes, dueAt, status, conversationId, participantIds }) =>
        createReminderByIds(userId, { title, notes, dueAt, status, conversationId, participantIds }, assistantConversationId),
    }),

    update_reminder_by_id: tool({
      description: "Update a reminder by id",
      inputSchema: z.object({
        reminderId: z.string().describe("Reminder id"),
        title: z.string().optional().describe("Reminder title"),
        notes: z.string().optional().describe("Reminder notes"),
        dueAt: z.string().optional().describe("Due date/time as full ISO 8601 datetime, e.g. 2026-02-21T09:00:00.000Z"),
        status: schemas.optionalReminderStatusSchema.describe("Reminder status"),
        conversationId: z.string().optional().describe("Linked conversation id"),
        participantIds: z.array(z.string()).optional().describe("Participant contact ids"),
      }),
      execute: async ({ reminderId, title, notes, dueAt, status, conversationId, participantIds }) =>
        updateReminderById(userId, reminderId, { title, notes, dueAt, status, conversationId, participantIds }),
    }),

    complete_reminder: tool({
      description: "Mark a reminder as done or canceled",
      inputSchema: z.object({
        reminderId: z.string().describe("Reminder id"),
        status: schemas.completionStatusSchema.describe("Completion status"),
      }),
      execute: async ({ reminderId, status }) =>
        completeReminderById(userId, reminderId, status || "DONE"),
    }),

    searchReminders: tool({
      description: "Search reminders for context resolution",
      inputSchema: z.object({
        searchTerm: z.string().optional().describe("Reminder text search"),
        status: schemas.optionalReminderStatusSchema.describe("Reminder status filter"),
        dueBefore: z.string().optional().describe("Due before ISO date"),
        dueAfter: z.string().optional().describe("Due after ISO date"),
        contactId: z.string().optional().describe("Participant contact id"),
        limit: z.number().optional().describe("Maximum results"),
      }),
      execute: async ({ searchTerm, status, dueBefore, dueAfter, contactId, limit }) =>
        listReminders(userId, undefined, searchTerm, status, dueBefore, dueAfter, contactId, limit),
    }),
  };
}
