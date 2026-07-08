import { eq, and, desc, sql, inArray } from "drizzle-orm";
import {
  db,
  contacts,
  conversations,
  conversationParticipants,
  events,
  eventParticipants,
  reminders,
  reminderParticipants,
} from "../../db";

export async function enrichConversations(conversationsList: any[]) {
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

  return conversationsList.map((conv) => ({
    ...conv,
    participants: participantsData
      .filter((p: any) => p.conversation_participants.conversationId === conv.id)
      .map((p: any) => ({
        ...p.conversation_participants,
        contact: p.contacts,
      })),
    event: eventsData.find((e: any) => conv.eventId === e.id) || null,
  }));
}

export async function enrichEvents(eventsList: any[]) {
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

  return eventsList.map((evt) => ({
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
}

export async function enrichReminders(remindersList: any[]) {
  const reminderIds = remindersList.map((reminder) => reminder.id);
  const conversationIds = remindersList
    .map((reminder) => reminder.conversationId)
    .filter((id: string | null): id is string => Boolean(id));

  const [participantsData, conversationsData] = await Promise.all([
    reminderIds.length > 0
      ? db
          .select()
          .from(reminderParticipants)
          .innerJoin(contacts, eq(reminderParticipants.contactId, contacts.id))
          .where(inArray(reminderParticipants.reminderId, reminderIds))
      : [],
    conversationIds.length > 0
      ? db
          .select({
            id: conversations.id,
            medium: conversations.medium,
            happenedAt: conversations.happenedAt,
          })
          .from(conversations)
          .where(inArray(conversations.id, conversationIds))
      : [],
  ]);

  return remindersList.map((reminder) => ({
    ...reminder,
    participants: participantsData
      .filter((p: any) => p.reminder_participants.reminderId === reminder.id)
      .map((p: any) => ({
        ...p.reminder_participants,
        contact: p.contacts,
      })),
    conversation:
      conversationsData.find((conversation) => conversation.id === reminder.conversationId) ||
      null,
  }));
}

export async function buildAutoReminderTitle(participantIds: string[]) {
  if (participantIds.length === 0) {
    return "Follow up";
  }

  const participantContacts = await db
    .select({ displayName: contacts.displayName })
    .from(contacts)
    .where(inArray(contacts.id, participantIds));

  const names = participantContacts.map((p) => p.displayName).filter(Boolean);
  if (names.length === 0) return "Follow up";
  if (names.length === 1) return `Follow up with ${names[0]}`;
  if (names.length === 2) return `Follow up with ${names[0]} and ${names[1]}`;
  return `Follow up with ${names[0]} and ${names.length - 1} others`;
}

export async function syncConversationFollowUpReminder(
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
