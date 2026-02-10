// AI Assistant API Route
import { Hono } from "hono";
import { streamText } from "hono/streaming";
import { z } from "zod";
import { generateText, tool, stepCountIs } from "ai";
import { google } from "@ai-sdk/google";
import { eq, and, desc, sql, ilike, asc, or, inArray } from "drizzle-orm";
import {
  db,
  users,
  contacts,
  conversations,
  conversationParticipants,
  reminders,
  reminderParticipants,
  events,
  eventParticipants,
  tags,
  contactTags,
  relationships,
  relationshipTypes,
  socialLinks,
  contactImages,
} from "../db";
import { authMiddleware } from "../middleware/auth";

const app = new Hono();

app.use("/*", authMiddleware);

// Message schema
const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

const chatSchema = z.object({
  messages: z.array(messageSchema),
});

const PAGE_SIZE = 20;

const conversationMediums = [
  "PHONE_CALL",
  "WHATSAPP",
  "EMAIL",
  "CHANCE_ENCOUNTER",
  "ONLINE_MEETING",
  "IN_PERSON_MEETING",
  "OTHER",
] as const;

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

const reminderStatuses = ["OPEN", "DONE", "CANCELED"] as const;

function normalizeEnumCandidate(value: string): string {
  return value.trim().toUpperCase().replace(/[\s-]+/g, "_");
}

// Map natural language to ConversationMedium
function mapMedium(text: string): string {
  const normalized = normalizeEnumCandidate(text);
  if (conversationMediums.includes(normalized as any)) {
    return normalized;
  }

  const lower = text.toLowerCase();
  if (lower.includes("phone") || lower.includes("call") || lower.includes("called"))
    return "PHONE_CALL";
  if (lower.includes("whatsapp") || lower.includes("wa")) return "WHATSAPP";
  if (lower.includes("email") || lower.includes("mail")) return "EMAIL";
  if (lower.includes("met") || lower.includes("bumped into") || lower.includes("ran into"))
    return "CHANCE_ENCOUNTER";
  if (
    lower.includes("zoom") ||
    lower.includes("teams") ||
    lower.includes("online") ||
    lower.includes("video")
  )
    return "ONLINE_MEETING";
  if (
    lower.includes("in person") ||
    lower.includes("in-person") ||
    lower.includes("coffee") ||
    lower.includes("lunch") ||
    lower.includes("dinner")
  )
    return "IN_PERSON_MEETING";
  return "OTHER";
}

// Map natural language to EventType
function mapEventType(text: string): string {
  const normalized = normalizeEnumCandidate(text);
  if (eventTypes.includes(normalized as any)) {
    return normalized;
  }

  const lower = text.toLowerCase();
  if (lower.includes("meeting")) return "MEETING";
  if (lower.includes("call")) return "CALL";
  if (lower.includes("birthday")) return "BIRTHDAY";
  if (lower.includes("anniversary")) return "ANNIVERSARY";
  if (lower.includes("conference")) return "CONFERENCE";
  if (lower.includes("social")) return "SOCIAL";
  if (lower.includes("family")) return "FAMILY_EVENT";
  return "OTHER";
}

function mapReminderStatus(text: string): (typeof reminderStatuses)[number] {
  const normalized = normalizeEnumCandidate(text);
  if (reminderStatuses.includes(normalized as any)) {
    return normalized as (typeof reminderStatuses)[number];
  }

  const lower = text.toLowerCase();
  if (lower.includes("done") || lower.includes("complete") || lower.includes("completed")) {
    return "DONE";
  }
  if (lower.includes("cancel")) {
    return "CANCELED";
  }
  return "OPEN";
}

// Fuzzy search for contacts
async function findBestContactMatch(userId: string, name: string) {
  console.log(`[assistant:tool] findBestContactMatch — searching for "${name}"`);
  try {
    const similarityExpr = sql<number>`
      GREATEST(
        similarity(${contacts.displayName}, ${name}),
        word_similarity(${name}, ${contacts.displayName})
      )
    `;
    const rows = await db
      .select({
        id: contacts.id,
        displayName: contacts.displayName,
        similarity: similarityExpr,
      })
      .from(contacts)
      .where(
        and(
          eq(contacts.userId, userId),
          or(
            sql`similarity(${contacts.displayName}, ${name}) > 0.3`,
            sql`word_similarity(${name}, ${contacts.displayName}) > 0.3`
          )!
        )
      )
      .orderBy(desc(similarityExpr))
      .limit(1);

    if (rows.length > 0) {
      console.log(`[assistant:tool] findBestContactMatch — found: "${rows[0].displayName}" (similarity match)`);
      return rows[0] as { id: string; displayName: string };
    }

    // Fallback to ILIKE
    const [contact] = await db
      .select({ id: contacts.id, displayName: contacts.displayName })
      .from(contacts)
      .where(and(eq(contacts.userId, userId), ilike(contacts.displayName, `%${name}%`)))
      .limit(1);

    if (contact) {
      console.log(`[assistant:tool] findBestContactMatch — found: "${contact.displayName}" (ILIKE fallback)`);
    } else {
      console.log(`[assistant:tool] findBestContactMatch — no match found for "${name}"`);
    }
    return contact || null;
  } catch (err) {
    console.warn(`[assistant:tool] findBestContactMatch — trigram error, falling back to ILIKE:`, err);
    // Fallback to ILIKE if trigram not available
    const [contact] = await db
      .select({ id: contacts.id, displayName: contacts.displayName })
      .from(contacts)
      .where(and(eq(contacts.userId, userId), ilike(contacts.displayName, `%${name}%`)))
      .limit(1);

    if (contact) {
      console.log(`[assistant:tool] findBestContactMatch — found: "${contact.displayName}" (ILIKE after error)`);
    } else {
      console.log(`[assistant:tool] findBestContactMatch — no match found for "${name}" (after error)`);
    }
    return contact || null;
  }
}

// Fetch user context (name, email, primary contact) for system prompt
type UserContext = {
  userName: string | null;
  userEmail: string;
  primaryContactId: string | null;
  primaryContactName: string | null;
};

async function getUserContext(userId: string): Promise<UserContext> {
  const [user] = await db
    .select({
      name: users.name,
      email: users.email,
      primaryContactId: users.primaryContactId,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return { userName: null, userEmail: "", primaryContactId: null, primaryContactName: null };
  }

  let primaryContactName: string | null = null;
  if (user.primaryContactId) {
    const [contact] = await db
      .select({ displayName: contacts.displayName })
      .from(contacts)
      .where(and(eq(contacts.id, user.primaryContactId), eq(contacts.userId, userId)))
      .limit(1);
    primaryContactName = contact?.displayName ?? null;
  }

  return {
    userName: user.name,
    userEmail: user.email,
    primaryContactId: user.primaryContactId,
    primaryContactName,
  };
}

// Parse comma-separated names
function parseNames(namesString: string): string[] {
  return namesString
    .split(",")
    .map((n) => n.trim())
    .filter((n) => n.length > 0);
}

function parseIds(idsString: string): string[] {
  return idsString
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

async function resolveContactId(
  userId: string,
  contactId?: string,
  contactName?: string
): Promise<string | null> {
  if (contactId) {
    const contact = await getOwnedContact(userId, contactId);
    return contact?.id ?? null;
  }

  if (contactName) {
    const contact = await findBestContactMatch(userId, contactName);
    return contact?.id ?? null;
  }

  return null;
}

async function resolveContactIdsFromNames(userId: string, names: string[]) {
  const resolvedIds: string[] = [];
  const missing: string[] = [];

  for (const name of names) {
    const contact = await findBestContactMatch(userId, name);
    if (contact) {
      resolvedIds.push(contact.id);
    } else {
      missing.push(name);
    }
  }

  return {
    ids: [...new Set(resolvedIds)],
    missing,
  };
}


// Tool definitions for the AI
interface ToolResult {
  type: string;
  [key: string]: unknown;
}

type AssistantContactCard = {
  id: string;
  displayName: string;
  primaryPhone?: string | null;
  primaryEmail?: string | null;
  company?: string | null;
  jobTitle?: string | null;
  location?: string | null;
};

type AssistantConversationCard = {
  id: string;
  medium: string;
  happenedAt: string;
  content?: string | null;
  participants?: string[];
};

type AssistantEventCard = {
  id: string;
  title: string;
  startAt: string;
  location?: string | null;
  participants?: string[];
};

type AssistantReminderCard = {
  id: string;
  title: string;
  dueAt: string;
  status: string;
  participants?: string[];
};

type AssistantCreatedCard =
  | { kind: "contact"; contact: AssistantContactCard }
  | { kind: "conversation"; conversation: AssistantConversationCard }
  | { kind: "event"; event: AssistantEventCard }
  | { kind: "reminder"; reminder: AssistantReminderCard };

type AssistantUi =
  | { kind: "contact"; contact: AssistantContactCard }
  | { kind: "contacts"; count: number; contacts: AssistantContactCard[] }
  | { kind: "conversations"; count: number; conversations: AssistantConversationCard[] }
  | { kind: "events"; count: number; events: AssistantEventCard[] }
  | { kind: "reminders"; count: number; reminders: AssistantReminderCard[] }
  | { kind: "created"; cards: AssistantCreatedCard[] };

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

function formatToday(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

async function getOwnedContact(userId: string, contactId: string) {
  const [contact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.userId, userId)));
  return contact || null;
}

async function getOwnedConversation(userId: string, conversationId: string) {
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)));
  return conversation || null;
}

async function getOwnedEvent(userId: string, eventId: string) {
  const [event] = await db
    .select()
    .from(events)
    .where(and(eq(events.id, eventId), eq(events.userId, userId)));
  return event || null;
}

async function getOwnedReminder(userId: string, reminderId: string) {
  const [reminder] = await db
    .select()
    .from(reminders)
    .where(and(eq(reminders.id, reminderId), eq(reminders.userId, userId)));
  return reminder || null;
}

async function getOwnedTag(userId: string, tagId: string) {
  const [tag] = await db
    .select()
    .from(tags)
    .where(and(eq(tags.id, tagId), eq(tags.userId, userId)));
  return tag || null;
}

async function getOwnedRelationshipType(userId: string, typeId: string) {
  const [type] = await db
    .select()
    .from(relationshipTypes)
    .where(and(eq(relationshipTypes.id, typeId), eq(relationshipTypes.userId, userId)));
  return type || null;
}

async function getOwnedRelationship(userId: string, relationshipId: string) {
  const [relationship] = await db
    .select()
    .from(relationships)
    .where(and(eq(relationships.id, relationshipId), eq(relationships.userId, userId)));
  return relationship || null;
}

async function enrichConversations(conversationsList: any[]) {
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

async function enrichEvents(eventsList: any[]) {
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

async function enrichReminders(remindersList: any[]) {
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

async function buildAutoReminderTitle(participantIds: string[]) {
  if (participantIds.length === 0) {
    return "Follow up";
  }

  const participantContacts = await db
    .select({ displayName: contacts.displayName })
    .from(contacts)
    .where(sql`${contacts.id} = ANY(${participantIds})`);

  const names = participantContacts.map((p) => p.displayName).filter(Boolean);
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

// Tool implementations
async function createConversation(
  userId: string,
  participantNames: string | undefined,
  participantIds: string[] | undefined,
  medium: string,
  content?: string,
  happenedAt?: string,
  followUpAt?: string,
  eventId?: string
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

    resolvedParticipantIds = [...new Set(participantIds)];
  } else if (participantNames) {
    const names = parseNames(participantNames);
    const resolved = await resolveContactIdsFromNames(userId, names);

    if (resolved.missing.length > 0) {
      return {
        type: "error",
        message: `Could not find contacts named: ${resolved.missing.join(", ")}`,
      };
    }

    resolvedParticipantIds = [...new Set(resolved.ids)];
  }

  if (resolvedParticipantIds.length === 0) {
    return {
      type: "error",
      message: "At least one participant is required.",
    };
  }

  const mappedMedium = mapMedium(medium || "");

  if (eventId) {
    const existingEvent = await getOwnedEvent(userId, eventId);
    if (!existingEvent) {
      return {
        type: "error",
        message: `Could not find event with id: ${eventId}`,
      };
    }
  }

  const [conversation] = await db
    .insert(conversations)
    .values({
      content: content || null,
      medium: mappedMedium as any,
      happenedAt: happenedAt ? new Date(happenedAt) : new Date(),
      followUpAt: followUpAt ? new Date(followUpAt) : null,
      eventId: eventId || null,
      userId,
    })
    .returning();

  if (!conversation) {
    return { type: "error", message: "Failed to create conversation" };
  }

  // Add participants
  if (resolvedParticipantIds.length > 0) {
    await db.insert(conversationParticipants).values(
      resolvedParticipantIds.map((contactId) => ({
        conversationId: conversation.id,
        contactId,
      }))
    );
  }

  await syncConversationFollowUpReminder(
    userId,
    conversation.id,
    conversation.followUpAt,
    resolvedParticipantIds,
    conversation.content
  );

  // Get participant names
  const participantContacts = await db
    .select({ displayName: contacts.displayName })
    .from(contacts)
    .where(sql`${contacts.id} = ANY(${resolvedParticipantIds})`);

  return {
    type: "conversation_created",
    id: conversation.id,
    medium: conversation.medium,
    happenedAt: conversation.happenedAt,
    content: conversation.content,
    participants: participantContacts.map((p) => p.displayName),
  };
}

async function queryConversations(
  userId: string,
  participantName?: string,
  medium?: string,
  limit?: number
): Promise<ToolResult> {
  console.log(`[assistant:tool] queryConversations — participant="${participantName || "any"}", medium="${medium || "any"}", limit=${limit || 10}`);
  const takeLimit = Math.min(limit || 10, 10);
  const conditions = [eq(conversations.userId, userId)];

  let contactFilter: string | null = null;
  if (participantName) {
    const contact = await findBestContactMatch(userId, participantName);
    if (contact) {
      contactFilter = contact.id;
      console.log(`[assistant:tool] queryConversations — filtering by contact: ${contact.displayName} (${contact.id})`);
    } else {
      console.log(`[assistant:tool] queryConversations — no contact found for "${participantName}", returning unfiltered`);
    }
  }

  if (medium) {
    conditions.push(eq(conversations.medium, mapMedium(medium) as any));
  }

  let conversationsList = await db
    .select()
    .from(conversations)
    .where(and(...conditions))
    .orderBy(desc(conversations.happenedAt))
    .limit(takeLimit);

  // Filter by participant if needed
  if (contactFilter) {
    const participantConvIds = await db
      .select({ conversationId: conversationParticipants.conversationId })
      .from(conversationParticipants)
      .where(eq(conversationParticipants.contactId, contactFilter));

    const convIds = participantConvIds.map((p) => p.conversationId);
    const beforeCount = conversationsList.length;
    conversationsList = conversationsList.filter((c) => convIds.includes(c.id));
    console.log(`[assistant:tool] queryConversations — filtered ${beforeCount} → ${conversationsList.length} conversations for contact`);
  }

  // Get participants for each conversation
  const convIds = conversationsList.map((c) => c.id);
  let participants: any[] = [];
  try {
    participants =
      convIds.length > 0
        ? await db
            .select()
            .from(conversationParticipants)
            .innerJoin(contacts, eq(conversationParticipants.contactId, contacts.id))
            .where(inArray(conversationParticipants.conversationId, convIds))
        : [];
  } catch (err) {
    console.error(`[assistant:tool] queryConversations — error fetching participants:`, err);
  }

  console.log(`[assistant:tool] queryConversations — returning ${conversationsList.length} conversation(s)`);

  return {
    type: "conversations_found",
    count: conversationsList.length,
    conversations: conversationsList.map((c) => ({
      id: c.id,
      medium: c.medium,
      happenedAt: c.happenedAt,
      content: c.content,
      participants: participants
        .filter((p: any) => p.conversation_participants.conversationId === c.id)
        .map((p: any) => p.contacts.displayName),
    })),
  };
}

async function createEvent(
  userId: string,
  title: string,
  startAt: string,
  participantNames?: string,
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
  } else if (participantNames) {
    const names = parseNames(participantNames);
    const resolved = await resolveContactIdsFromNames(userId, names);

    if (resolved.missing.length > 0) {
      return {
        type: "error",
        message: `Could not find contacts named: ${resolved.missing.join(", ")}`,
      };
    }

    resolvedParticipantIds = resolved.ids;
  }

  const mappedEventType = mapEventType(eventType || "meeting");

  const [event] = await db
    .insert(events)
    .values({
      title,
      description: description || null,
      eventType: mappedEventType as any,
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

async function queryEvents(
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

  let eventsList = await db
    .select()
    .from(events)
    .where(eq(events.userId, userId))
    .orderBy(desc(events.startAt))
    .limit(takeLimit);

  // Filter by participant if needed
  if (contactFilter) {
    const participantEventIds = await db
      .select({ eventId: eventParticipants.eventId })
      .from(eventParticipants)
      .where(eq(eventParticipants.contactId, contactFilter));

    const eventIds = participantEventIds.map((p) => p.eventId);
    const beforeCount = eventsList.length;
    eventsList = eventsList.filter((e) => eventIds.includes(e.id));
    console.log(`[assistant:tool] queryEvents — filtered ${beforeCount} → ${eventsList.length} events for contact`);
  }

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

async function createContact(
  userId: string,
  displayName: string,
  primaryPhone?: string,
  primaryEmail?: string,
  dateOfBirth?: string,
  gender?: string,
  company?: string,
  jobTitle?: string,
  location?: string,
  notes?: string,
  tagIds?: string[]
): Promise<ToolResult> {
  const [contact] = await db
    .insert(contacts)
    .values({
      displayName,
      primaryPhone: primaryPhone || null,
      primaryEmail: primaryEmail || null,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      gender: (gender as any) || null,
      company: company || null,
      jobTitle: jobTitle || null,
      location: location || null,
      notes: notes || null,
      userId,
    })
    .returning();

  if (!contact) {
    return { type: "error", message: "Failed to create contact" };
  }

  if (tagIds && tagIds.length > 0) {
    await db.insert(contactTags).values(
      tagIds.map((tagId) => ({
        contactId: contact.id,
        tagId,
      }))
    );
  }

  return {
    type: "contact_created",
    id: contact.id,
    displayName: contact.displayName,
    primaryPhone: contact.primaryPhone,
    primaryEmail: contact.primaryEmail,
    company: contact.company,
    jobTitle: contact.jobTitle,
    location: contact.location,
  };
}

async function updateContact(
  userId: string,
  contactName: string,
  primaryPhone?: string,
  primaryEmail?: string,
  dateOfBirth?: string,
  gender?: string,
  company?: string,
  jobTitle?: string,
  location?: string,
  notes?: string,
  tagIds?: string[]
): Promise<ToolResult> {
  const contact = await findBestContactMatch(userId, contactName);

  if (!contact) {
    return {
      type: "error",
      message: `Could not find a contact named: ${contactName}`,
    };
  }

  return updateContactById(
    userId,
    contact.id,
    {
      primaryPhone,
      primaryEmail,
      dateOfBirth,
      gender,
      company,
      jobTitle,
      location,
      notes,
      tagIds,
    },
    contactName
  );
}

async function updateContactById(
  userId: string,
  contactId: string,
  updates: {
    displayName?: string;
    primaryPhone?: string;
    primaryEmail?: string;
    dateOfBirth?: string;
    gender?: string;
    company?: string;
    jobTitle?: string;
    location?: string;
    notes?: string;
    tagIds?: string[];
  },
  fallbackName?: string
): Promise<ToolResult> {
  const existing = await getOwnedContact(userId, contactId);

  if (!existing) {
    return {
      type: "error",
      message: `Could not find contact${fallbackName ? ` named: ${fallbackName}` : ""}`,
    };
  }

  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (updates.displayName !== undefined) updateData.displayName = updates.displayName;
  if (updates.primaryPhone !== undefined)
    updateData.primaryPhone = updates.primaryPhone || null;
  if (updates.primaryEmail !== undefined)
    updateData.primaryEmail = updates.primaryEmail || null;
  if (updates.dateOfBirth !== undefined)
    updateData.dateOfBirth = updates.dateOfBirth ? new Date(updates.dateOfBirth) : null;
  if (updates.gender !== undefined) updateData.gender = updates.gender || null;
  if (updates.company !== undefined) updateData.company = updates.company || null;
  if (updates.jobTitle !== undefined) updateData.jobTitle = updates.jobTitle || null;
  if (updates.location !== undefined) updateData.location = updates.location || null;
  if (updates.notes !== undefined) updateData.notes = updates.notes || null;

  const [updatedContact] = await db
    .update(contacts)
    .set(updateData)
    .where(eq(contacts.id, contactId))
    .returning({ id: contacts.id, displayName: contacts.displayName });

  if (!updatedContact) {
    return {
      type: "error",
      message: `Could not update contact${fallbackName ? ` named: ${fallbackName}` : ""}`,
    };
  }

  if (updates.tagIds !== undefined) {
    await db.delete(contactTags).where(eq(contactTags.contactId, contactId));
    if (updates.tagIds.length > 0) {
      await db.insert(contactTags).values(
        updates.tagIds.map((tagId) => ({
          contactId,
          tagId,
        }))
      );
    }
  }

  return {
    type: "contact_updated",
    id: updatedContact.id,
    displayName: updatedContact.displayName,
  };
}

async function getContactDetails(
  userId: string,
  contactName?: string,
  contactId?: string
): Promise<ToolResult> {
  const resolvedId = await resolveContactId(userId, contactId, contactName);

  if (!resolvedId) {
    return {
      type: "error",
      message: contactId
        ? `Could not find contact with id: ${contactId}`
        : `Could not find a contact named: ${contactName}`,
    };
  }

  const [fullContact] = await db
    .select()
    .from(contacts)
    .where(eq(contacts.id, resolvedId));

  if (!fullContact) {
    return {
      type: "error",
      message: contactId
        ? `Could not find contact with id: ${contactId}`
        : `Could not find a contact named: ${contactName}`,
    };
  }

  // Get tags
  const contactTagsList = await db
    .select()
    .from(contactTags)
    .innerJoin(tags, eq(contactTags.tagId, tags.id))
    .where(eq(contactTags.contactId, resolvedId));

  // Get relationships
  const relationshipsFrom = await db
    .select()
    .from(relationships)
    .innerJoin(contacts, eq(relationships.toContactId, contacts.id))
    .innerJoin(relationshipTypes, eq(relationships.typeId, relationshipTypes.id))
    .where(eq(relationships.fromContactId, resolvedId));

  const relationshipsTo = await db
    .select()
    .from(relationships)
    .innerJoin(contacts, eq(relationships.fromContactId, contacts.id))
    .innerJoin(relationshipTypes, eq(relationships.typeId, relationshipTypes.id))
    .where(eq(relationships.toContactId, resolvedId));

  const [images, links] = await Promise.all([
    db
      .select()
      .from(contactImages)
      .where(eq(contactImages.contactId, resolvedId))
      .orderBy(asc(contactImages.order)),
    db
      .select()
      .from(socialLinks)
      .where(eq(socialLinks.contactId, resolvedId)),
  ]);

  return {
    type: "contact_details",
    id: fullContact.id,
    displayName: fullContact.displayName,
    primaryPhone: fullContact.primaryPhone,
    primaryEmail: fullContact.primaryEmail,
    company: fullContact.company,
    jobTitle: fullContact.jobTitle,
    location: fullContact.location,
    notes: fullContact.notes,
    dateOfBirth: fullContact.dateOfBirth,
    tags: contactTagsList.map((t: any) => t.tags.name),
    images,
    socialLinks: links,
    relationships: [
      ...relationshipsFrom.map((r: any) => ({
        type: r.relationship_types.name,
        contact: r.contacts.displayName,
      })),
      ...relationshipsTo.map((r: any) => ({
        type: r.relationship_types.name,
        contact: r.contacts.displayName,
      })),
    ],
  };
}

async function queryContacts(
  userId: string,
  searchTerm?: string,
  limit?: number
): Promise<ToolResult> {
  const takeLimit = Math.min(limit || 10, 10);

  if (searchTerm) {
    try {
      const rows = await db
        .select({
          id: contacts.id,
          displayName: contacts.displayName,
          company: contacts.company,
          primaryEmail: contacts.primaryEmail,
          primaryPhone: contacts.primaryPhone,
          jobTitle: contacts.jobTitle,
          location: contacts.location,
        })
        .from(contacts)
        .where(
          and(
            eq(contacts.userId, userId),
            or(
              sql`similarity(${contacts.displayName}, ${searchTerm}) > 0.3`,
              ilike(contacts.displayName, `%${searchTerm}%`),
              ilike(contacts.company, `%${searchTerm}%`)
            )!
          )
        )
        .orderBy(desc(sql`similarity(${contacts.displayName}, ${searchTerm})`))
        .limit(takeLimit);

      return {
        type: "contacts_found",
        count: rows.length,
        contacts: rows,
      };
    } catch {
      // Fallback without trigram
      const contactsList = await db
        .select({
          id: contacts.id,
          displayName: contacts.displayName,
          company: contacts.company,
          primaryEmail: contacts.primaryEmail,
          primaryPhone: contacts.primaryPhone,
          jobTitle: contacts.jobTitle,
          location: contacts.location,
        })
        .from(contacts)
        .where(
          and(
            eq(contacts.userId, userId),
            ilike(contacts.displayName, `%${searchTerm}%`)
          )
        )
        .limit(takeLimit);

      return {
        type: "contacts_found",
        count: contactsList.length,
        contacts: contactsList,
      };
    }
  }

  // No search term - return all contacts
  const contactsList = await db
    .select({
      id: contacts.id,
      displayName: contacts.displayName,
      company: contacts.company,
      primaryEmail: contacts.primaryEmail,
      primaryPhone: contacts.primaryPhone,
      jobTitle: contacts.jobTitle,
      location: contacts.location,
    })
    .from(contacts)
    .where(eq(contacts.userId, userId))
    .orderBy(contacts.displayName)
    .limit(takeLimit);

  return {
    type: "contacts_found",
    count: contactsList.length,
    contacts: contactsList,
  };
}

async function listContacts(
  userId: string,
  cursor?: string,
  search?: string,
  limit?: number
): Promise<ToolResult> {
  const takeLimit = limit || PAGE_SIZE;
  let contactsList: any;

  if (search) {
    try {
      const similarityExpr = sql<number>`
        GREATEST(
          similarity(${contacts.displayName}, ${search}),
          word_similarity(${search}, ${contacts.displayName}),
          COALESCE(similarity(${contacts.company}, ${search}), 0),
          COALESCE(word_similarity(${search}, ${contacts.company}), 0)
        )
      `;
      contactsList = await db
        .select({
          id: contacts.id,
          userId: contacts.userId,
          displayName: contacts.displayName,
          googleContactName: contacts.googleContactName,
          primaryPhone: contacts.primaryPhone,
          primaryEmail: contacts.primaryEmail,
          dateOfBirth: contacts.dateOfBirth,
          gender: contacts.gender,
          company: contacts.company,
          jobTitle: contacts.jobTitle,
          location: contacts.location,
          notes: contacts.notes,
          createdAt: contacts.createdAt,
          updatedAt: contacts.updatedAt,
          similarity: similarityExpr,
        })
        .from(contacts)
        .where(
          and(
            eq(contacts.userId, userId),
            or(
              sql`similarity(${contacts.displayName}, ${search}) > 0.3`,
              sql`word_similarity(${search}, ${contacts.displayName}) > 0.3`,
              sql`similarity(${contacts.company}, ${search}) > 0.3`,
              sql`word_similarity(${search}, ${contacts.company}) > 0.3`,
              ilike(contacts.displayName, `%${search}%`),
              ilike(contacts.company, `%${search}%`)
            )!
          )
        )
        .orderBy(desc(similarityExpr))
        .limit(takeLimit + 1);
    } catch {
      contactsList = await db
        .select()
        .from(contacts)
        .where(
          and(
            eq(contacts.userId, userId),
            or(
              ilike(contacts.displayName, `%${search}%`),
              ilike(contacts.company, `%${search}%`)
            )!
          )
        )
        .orderBy(asc(contacts.displayName))
        .limit(takeLimit + 1);
    }
  } else if (cursor) {
    contactsList = await db
      .select()
      .from(contacts)
      .where(
        and(
          eq(contacts.userId, userId),
          sql`${contacts.displayName} > (SELECT "displayName" FROM contacts WHERE id = ${cursor})`
        )
      )
      .orderBy(asc(contacts.displayName))
      .limit(takeLimit + 1);
  } else {
    contactsList = await db
      .select()
      .from(contacts)
      .where(eq(contacts.userId, userId))
      .orderBy(asc(contacts.displayName))
      .limit(takeLimit + 1);
  }

  const results = contactsList;
  let nextCursor: string | null = null;

  if (results.length > takeLimit) {
    const nextItem = results.pop();
    nextCursor = nextItem?.id || null;
  }

  const contactIds = results.map((c: any) => c.id);

  const [contactTagsData, contactImagesData] = await Promise.all([
    contactIds.length > 0
      ? db
          .select()
          .from(contactTags)
          .innerJoin(tags, eq(contactTags.tagId, tags.id))
          .where(inArray(contactTags.contactId, contactIds))
      : [],
    contactIds.length > 0
      ? db
          .select()
          .from(contactImages)
          .where(
            and(inArray(contactImages.contactId, contactIds), eq(contactImages.order, 0))
          )
      : [],
  ]);

  const enrichedContacts = results.map((contact: any) => ({
    ...contact,
    tags: contactTagsData
      .filter((ct: any) => ct.contact_tags.contactId === contact.id)
      .map((ct: any) => ct.tags),
    images: contactImagesData.filter((img: any) => img.contactId === contact.id),
  }));

  let stats = null;
  if (!cursor && !search) {
    const [totalResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(contacts)
      .where(eq(contacts.userId, userId));

    stats = { totalCount: Number(totalResult?.count || 0) };
  }

  return {
    type: "contacts_found",
    count: enrichedContacts.length,
    contacts: enrichedContacts,
    nextCursor,
    stats,
  };
}

async function getContactById(userId: string, contactId: string): Promise<ToolResult> {
  const contact = await getOwnedContact(userId, contactId);

  if (!contact) {
    return { type: "error", message: "Contact not found" };
  }

  const [contactTagsData, images, links] = await Promise.all([
    db
      .select()
      .from(contactTags)
      .innerJoin(tags, eq(contactTags.tagId, tags.id))
      .where(eq(contactTags.contactId, contactId)),
    db
      .select()
      .from(contactImages)
      .where(eq(contactImages.contactId, contactId))
      .orderBy(asc(contactImages.order)),
    db.select().from(socialLinks).where(eq(socialLinks.contactId, contactId)),
  ]);

  return {
    type: "contact_details",
    ...contact,
    tags: contactTagsData.map((ct) => ct.tags),
    images,
    socialLinks: links,
  };
}

async function deleteContactById(userId: string, contactId: string): Promise<ToolResult> {
  const existing = await getOwnedContact(userId, contactId);

  if (!existing) {
    return { type: "error", message: "Contact not found" };
  }

  await db.delete(contacts).where(eq(contacts.id, contactId));

  return { type: "contact_deleted", id: contactId };
}

async function addContactImage(
  userId: string,
  contactId: string,
  imageUrl: string,
  publicId?: string
): Promise<ToolResult> {
  const existing = await getOwnedContact(userId, contactId);

  if (!existing) {
    return { type: "error", message: "Contact not found" };
  }

  const [maxOrder] = await db
    .select({ maxOrder: sql<number>`COALESCE(MAX("order"), -1)` })
    .from(contactImages)
    .where(eq(contactImages.contactId, contactId));

  const [newImage] = await db
    .insert(contactImages)
    .values({
      contactId,
      imageUrl,
      publicId: publicId || null,
      order: (maxOrder?.maxOrder || 0) + 1,
    })
    .returning();

  return { type: "contact_image_added", image: newImage };
}

async function deleteContactImage(
  userId: string,
  contactId: string,
  imageId: string
): Promise<ToolResult> {
  const existing = await getOwnedContact(userId, contactId);

  if (!existing) {
    return { type: "error", message: "Contact not found" };
  }

  await db.delete(contactImages).where(eq(contactImages.id, imageId));
  return { type: "contact_image_deleted", id: imageId };
}

async function searchContactsFuzzy(
  userId: string,
  name: string,
  limit?: number
): Promise<ToolResult> {
  const takeLimit = limit || 10;
  if (!name) {
    return { type: "contacts_found", count: 0, contacts: [] };
  }

  try {
    const similarityExpr = sql<number>`
      GREATEST(
        similarity(${contacts.displayName}, ${name}),
        word_similarity(${name}, ${contacts.displayName})
      )
    `;
    const rows = await db
      .select({
        id: contacts.id,
        displayName: contacts.displayName,
        similarity: similarityExpr,
      })
      .from(contacts)
      .where(
        and(
          eq(contacts.userId, userId),
          or(
            sql`similarity(${contacts.displayName}, ${name}) > 0.3`,
            sql`word_similarity(${name}, ${contacts.displayName}) > 0.3`
          )!
        )
      )
      .orderBy(desc(similarityExpr))
      .limit(takeLimit);

    return {
      type: "contacts_found",
      count: rows.length,
      contacts: rows,
    };
  } catch {
    const contactsResult = await db
      .select({ id: contacts.id, displayName: contacts.displayName })
      .from(contacts)
      .where(
        and(eq(contacts.userId, userId), ilike(contacts.displayName, `%${name}%`))
      )
      .limit(takeLimit);

    return {
      type: "contacts_found",
      count: contactsResult.length,
      contacts: contactsResult,
    };
  }
}

async function searchContactsByPhone(
  userId: string,
  phone: string,
  include?: string[],
  conversationsLimit?: number,
  eventsLimit?: number,
  remindersLimit?: number
): Promise<ToolResult> {
  const includeList =
    include?.map((v) => v.trim()).filter((v) => v.length > 0) || [];
  const normalized = phone.replace(/\D/g, "");

  if (!phone || normalized.length < 3) {
    return { type: "error", message: "phone query param is required" };
  }

  const normalizedLike = `%${normalized}%`;
  const normalizedPhoneExpr = sql`regexp_replace(${contacts.primaryPhone}, '\\D', '', 'g')`;
  const candidates = await db
    .select()
    .from(contacts)
    .where(
      and(
        eq(contacts.userId, userId),
        or(
          ilike(contacts.primaryPhone, `%${phone}%`),
          sql`${normalizedPhoneExpr} = ${normalized}`,
          sql`${normalizedPhoneExpr} LIKE ${normalizedLike}`
        )!
      )
    )
    .orderBy(
      sql`
        CASE
          WHEN ${normalizedPhoneExpr} = ${normalized} THEN 0
          WHEN ${normalizedPhoneExpr} LIKE ${normalizedLike} THEN 1
          ELSE 2
        END
      `,
      sql`length(${contacts.primaryPhone}) ASC`
    )
    .limit(5);

  const contact = candidates.length > 0 ? candidates[0] : null;

  if (!contact) {
    return { type: "contact_phone_search", contact: null, candidates: [] };
  }

  const response: any = { type: "contact_phone_search", contact, candidates };

  if (includeList.includes("conversations")) {
    const convIdsResult = await db
      .select({ conversationId: conversationParticipants.conversationId })
      .from(conversationParticipants)
      .where(eq(conversationParticipants.contactId, contact.id));

    const convIds = convIdsResult.map((r) => r.conversationId);

    if (convIds.length === 0) {
      response.conversations = [];
    } else {
      const conversationsList = await db
        .select()
        .from(conversations)
        .where(and(eq(conversations.userId, userId), inArray(conversations.id, convIds)))
        .orderBy(desc(conversations.happenedAt))
        .limit(conversationsLimit || 10);

      response.conversations = await enrichConversations(conversationsList);
    }
  }

  if (includeList.includes("events")) {
    const eventIdsResult = await db
      .select({ eventId: eventParticipants.eventId })
      .from(eventParticipants)
      .where(eq(eventParticipants.contactId, contact.id));

    const eventIds = eventIdsResult.map((r) => r.eventId);

    if (eventIds.length === 0) {
      response.events = [];
    } else {
      const eventsList = await db
        .select()
        .from(events)
        .where(and(eq(events.userId, userId), inArray(events.id, eventIds)))
        .orderBy(desc(events.startAt))
        .limit(eventsLimit || 10);

      response.events = await enrichEvents(eventsList);
    }
  }

  if (includeList.includes("reminders")) {
    const reminderIdsResult = await db
      .select({ reminderId: reminderParticipants.reminderId })
      .from(reminderParticipants)
      .where(eq(reminderParticipants.contactId, contact.id));

    const reminderIds = reminderIdsResult.map((r) => r.reminderId);

    if (reminderIds.length === 0) {
      response.reminders = [];
    } else {
      const remindersList = await db
        .select()
        .from(reminders)
        .where(
          and(
            eq(reminders.userId, userId),
            eq(reminders.status, "OPEN"),
            inArray(reminders.id, reminderIds)
          )
        )
        .orderBy(asc(reminders.dueAt))
        .limit(remindersLimit || 10);

      response.reminders = await enrichReminders(remindersList);
    }
  }

  return response;
}

async function listContactConversations(
  userId: string,
  contactId: string,
  cursor?: string,
  search?: string,
  medium?: string,
  limit?: number
): Promise<ToolResult> {
  const contact = await getOwnedContact(userId, contactId);
  if (!contact) return { type: "error", message: "Contact not found" };

  const convIdsResult = await db
    .select({ conversationId: conversationParticipants.conversationId })
    .from(conversationParticipants)
    .where(eq(conversationParticipants.contactId, contactId));

  const convIds = convIdsResult.map((r) => r.conversationId);
  if (convIds.length === 0) {
    return { type: "conversations_found", count: 0, conversations: [], nextCursor: null };
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

  const enrichedConversations = await enrichConversations(conversationsList);

  return {
    type: "conversations_found",
    count: enrichedConversations.length,
    conversations: enrichedConversations,
    nextCursor,
  };
}

async function listContactEvents(
  userId: string,
  contactId: string,
  cursor?: string,
  search?: string,
  eventType?: string,
  limit?: number
): Promise<ToolResult> {
  const contact = await getOwnedContact(userId, contactId);
  if (!contact) return { type: "error", message: "Contact not found" };

  const eventIdsResult = await db
    .select({ eventId: eventParticipants.eventId })
    .from(eventParticipants)
    .where(eq(eventParticipants.contactId, contactId));

  const eventIds = eventIdsResult.map((r) => r.eventId);
  if (eventIds.length === 0) {
    return { type: "events_found", count: 0, events: [], nextCursor: null };
  }

  const conditions = [eq(events.userId, userId), inArray(events.id, eventIds)];

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

  return {
    type: "events_found",
    count: enrichedEvents.length,
    events: enrichedEvents,
    nextCursor,
  };
}

async function listConversations(
  userId: string,
  cursor?: string,
  search?: string,
  medium?: string,
  limit?: number
): Promise<ToolResult> {
  const conditions = [eq(conversations.userId, userId)];
  if (medium && conversationMediums.includes(medium as any)) {
    conditions.push(eq(conversations.medium, medium as any));
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

  const enrichedConversations = await enrichConversations(conversationsList);

  let stats = null;
  if (!cursor && !search && !medium) {
    const [totalResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(conversations)
      .where(eq(conversations.userId, userId));

    stats = { totalCount: Number(totalResult?.count || 0) };
  }

  return {
    type: "conversations_found",
    count: enrichedConversations.length,
    conversations: enrichedConversations,
    nextCursor,
    stats,
  };
}

async function getConversationById(
  userId: string,
  conversationId: string
): Promise<ToolResult> {
  const conversation = await getOwnedConversation(userId, conversationId);

  if (!conversation) {
    return { type: "error", message: "Conversation not found" };
  }

  const participantsData = await db
    .select()
    .from(conversationParticipants)
    .innerJoin(contacts, eq(conversationParticipants.contactId, contacts.id))
    .where(eq(conversationParticipants.conversationId, conversationId));

  let event = null;
  if (conversation.eventId) {
    const [eventData] = await db
      .select({ id: events.id, title: events.title })
      .from(events)
      .where(eq(events.id, conversation.eventId));
    event = eventData || null;
  }

  return {
    type: "conversation_details",
    ...conversation,
    participants: participantsData.map((p) => ({
      ...p.conversation_participants,
      contact: p.contacts,
    })),
    event,
  };
}

async function createConversationByIds(
  userId: string,
  payload: {
    content?: string;
    medium: string;
    happenedAt: string;
    followUpAt?: string;
    eventId?: string;
    participantIds: string[];
  }
): Promise<ToolResult> {
  const participantIds = [...new Set(payload.participantIds)];

  const [newConversation] = await db
    .insert(conversations)
    .values({
      userId,
      content: payload.content || null,
      medium: payload.medium as any,
      happenedAt: new Date(payload.happenedAt),
      followUpAt: payload.followUpAt ? new Date(payload.followUpAt) : null,
      eventId: payload.eventId || null,
    })
    .returning();

  if (!newConversation) {
    return { type: "error", message: "Failed to create conversation" };
  }

  if (participantIds.length > 0) {
    await db.insert(conversationParticipants).values(
      participantIds.map((contactId) => ({
        conversationId: newConversation.id,
        contactId,
      }))
    );
  }

  await syncConversationFollowUpReminder(
    userId,
    newConversation.id,
    newConversation.followUpAt,
    participantIds,
    newConversation.content
  );

  const participantContacts =
    participantIds.length > 0
      ? await db
          .select({ displayName: contacts.displayName })
          .from(contacts)
          .where(sql`${contacts.id} = ANY(${participantIds})`)
      : [];

  return {
    type: "conversation_created",
    id: newConversation.id,
    medium: newConversation.medium,
    happenedAt: newConversation.happenedAt,
    content: newConversation.content,
    participants: participantContacts.map((p) => p.displayName),
  };
}

async function updateConversationById(
  userId: string,
  conversationId: string,
  updates: {
    content?: string;
    medium?: string;
    happenedAt?: string;
    followUpAt?: string;
    eventId?: string;
    participantIds?: string[];
  }
): Promise<ToolResult> {
  const existing = await getOwnedConversation(userId, conversationId);

  if (!existing) {
    return { type: "error", message: "Conversation not found" };
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (updates.content !== undefined) updateData.content = updates.content || null;
  if (updates.medium !== undefined) updateData.medium = updates.medium as any;
  if (updates.happenedAt !== undefined)
    updateData.happenedAt = new Date(updates.happenedAt);
  if (updates.followUpAt !== undefined)
    updateData.followUpAt = updates.followUpAt ? new Date(updates.followUpAt) : null;
  if (updates.eventId !== undefined) updateData.eventId = updates.eventId || null;

  const [updatedConversation] = await db
    .update(conversations)
    .set(updateData)
    .where(eq(conversations.id, conversationId))
    .returning();

  let participantIdsForReminder: string[] | null = null;
  if (updates.participantIds !== undefined) {
    participantIdsForReminder = [...new Set(updates.participantIds)];
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

  return { type: "conversation_updated", id: conversationId };
}

async function deleteConversationById(
  userId: string,
  conversationId: string
): Promise<ToolResult> {
  const existing = await getOwnedConversation(userId, conversationId);

  if (!existing) {
    return { type: "error", message: "Conversation not found" };
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
  return { type: "conversation_deleted", id: conversationId };
}

async function listConversationsByContacts(
  userId: string,
  contactIds: string[],
  cursor?: string,
  search?: string,
  medium?: string,
  limit?: number
): Promise<ToolResult> {
  const uniqueContactIds = [...new Set(contactIds.map((id) => id.trim()).filter(Boolean))];

  if (uniqueContactIds.length === 0) {
    return { type: "error", message: "contactIds are required" };
  }

  const ownedContacts = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.userId, userId), inArray(contacts.id, uniqueContactIds)));

  if (ownedContacts.length !== uniqueContactIds.length) {
    return { type: "error", message: "Contact not found" };
  }

  const convIdsResult = await db
    .select({ conversationId: conversationParticipants.conversationId })
    .from(conversationParticipants)
    .where(inArray(conversationParticipants.contactId, uniqueContactIds))
    .groupBy(conversationParticipants.conversationId)
    .having(
      sql`COUNT(DISTINCT ${conversationParticipants.contactId}) = ${uniqueContactIds.length}`
    );

  const convIds = convIdsResult.map((row) => row.conversationId);

  if (convIds.length === 0) {
    return { type: "conversations_found", count: 0, conversations: [], nextCursor: null };
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

  const enrichedConversations = await enrichConversations(conversationsList);

  return {
    type: "conversations_found",
    count: enrichedConversations.length,
    conversations: enrichedConversations,
    nextCursor,
  };
}

async function listEvents(
  userId: string,
  cursor?: string,
  search?: string,
  eventType?: string,
  limit?: number
): Promise<ToolResult> {
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

async function getEventById(userId: string, eventId: string): Promise<ToolResult> {
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

async function createEventByIds(
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
      eventType: payload.eventType as any,
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

async function updateEventById(
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
  if (updates.eventType !== undefined) updateData.eventType = updates.eventType as any;
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

async function deleteEventById(userId: string, eventId: string): Promise<ToolResult> {
  const existing = await getOwnedEvent(userId, eventId);

  if (!existing) {
    return { type: "error", message: "Event not found" };
  }

  await db.update(conversations).set({ eventId: null }).where(eq(conversations.eventId, eventId));
  await db.delete(events).where(eq(events.id, eventId));

  return { type: "event_deleted", id: eventId };
}

async function listEventConversations(
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

  if (medium && conversationMediums.includes(medium as any)) {
    conditions.push(eq(conversations.medium, medium as any));
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

async function listEventContacts(
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

async function listReminders(
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
    conditions.push(eq(reminders.status, mapReminderStatus(status) as any));
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

async function getReminderById(userId: string, reminderId: string): Promise<ToolResult> {
  const reminder = await getOwnedReminder(userId, reminderId);
  if (!reminder) return { type: "error", message: "Reminder not found" };

  const [enrichedReminder] = await enrichReminders([reminder]);
  return {
    type: "reminder_details",
    ...enrichedReminder,
  };
}

async function createReminderByIds(
  userId: string,
  payload: {
    title?: string;
    notes?: string;
    dueAt: string;
    status?: string;
    conversationId?: string;
    participantIds: string[];
  }
): Promise<ToolResult> {
  const uniqueParticipantIds = [...new Set(payload.participantIds)];
  if (uniqueParticipantIds.length === 0) {
    return { type: "error", message: "At least one participant is required" };
  }

  const ownedContacts = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.userId, userId), inArray(contacts.id, uniqueParticipantIds)));
  if (ownedContacts.length !== uniqueParticipantIds.length) {
    return { type: "error", message: "Contact not found" };
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
      status: payload.status ? mapReminderStatus(payload.status) : "OPEN",
      conversationId: payload.conversationId || null,
      isAutoFromConversation: false,
    })
    .returning();

  if (!newReminder) {
    return { type: "error", message: "Failed to create reminder" };
  }

  await db.insert(reminderParticipants).values(
    uniqueParticipantIds.map((contactId) => ({
      reminderId: newReminder.id,
      contactId,
    }))
  );

  const participantContacts = await db
    .select({ displayName: contacts.displayName })
    .from(contacts)
    .where(sql`${contacts.id} = ANY(${uniqueParticipantIds})`);

  return {
    type: "reminder_created",
    id: newReminder.id,
    title: newReminder.title,
    dueAt: newReminder.dueAt,
    status: newReminder.status,
    participants: participantContacts.map((p) => p.displayName),
  };
}

async function updateReminderById(
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
  if (updates.status !== undefined) updateData.status = mapReminderStatus(updates.status);
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

async function completeReminderById(
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

async function deleteReminderById(userId: string, reminderId: string): Promise<ToolResult> {
  const existing = await getOwnedReminder(userId, reminderId);
  if (!existing) return { type: "error", message: "Reminder not found" };

  await db.delete(reminderParticipants).where(eq(reminderParticipants.reminderId, reminderId));
  await db.delete(reminders).where(eq(reminders.id, reminderId));
  return { type: "reminder_deleted", id: reminderId };
}

async function listTags(userId: string): Promise<ToolResult> {
  const tagsList = await db
    .select()
    .from(tags)
    .where(eq(tags.userId, userId))
    .orderBy(asc(tags.name));

  const tagIds = tagsList.map((t) => t.id);
  const contactCounts =
    tagIds.length > 0
      ? await db
          .select({
            tagId: contactTags.tagId,
            count: sql<number>`count(*)`,
          })
          .from(contactTags)
          .where(sql`${contactTags.tagId} = ANY(${tagIds})`)
          .groupBy(contactTags.tagId)
      : [];

  const enrichedTags = tagsList.map((tag) => ({
    ...tag,
    _count: {
      contacts: Number(contactCounts.find((cc) => cc.tagId === tag.id)?.count || 0),
    },
  }));

  return { type: "tags_found", tags: enrichedTags };
}

async function getTagById(userId: string, tagId: string): Promise<ToolResult> {
  const tag = await getOwnedTag(userId, tagId);
  if (!tag) return { type: "error", message: "Tag not found" };

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(contactTags)
    .where(eq(contactTags.tagId, tagId));

  return {
    type: "tag_details",
    ...tag,
    _count: { contacts: Number(countResult?.count || 0) },
  };
}

async function createTag(
  userId: string,
  name: string,
  color?: string
): Promise<ToolResult> {
  const [existing] = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.userId, userId), eq(tags.name, name)));

  if (existing) {
    return { type: "error", message: "A tag with this name already exists" };
  }

  const [newTag] = await db
    .insert(tags)
    .values({ userId, name, color: color || "#3B82F6" })
    .returning();

  if (!newTag) {
    return { type: "error", message: "Failed to create tag" };
  }

  return { type: "tag_created", id: newTag.id, name: newTag.name, color: newTag.color };
}

async function updateTagById(
  userId: string,
  tagId: string,
  updates: { name?: string; color?: string }
): Promise<ToolResult> {
  const tag = await getOwnedTag(userId, tagId);
  if (!tag) return { type: "error", message: "Tag not found" };

  if (updates.name) {
    const [duplicate] = await db
      .select({ id: tags.id })
      .from(tags)
      .where(
        and(
          eq(tags.userId, userId),
          eq(tags.name, updates.name),
          sql`${tags.id} != ${tagId}`
        )
      );

    if (duplicate) {
      return { type: "error", message: "A tag with this name already exists" };
    }
  }

  const updateData: any = { updatedAt: new Date() };
  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.color !== undefined) updateData.color = updates.color;

  const [updatedTag] = await db
    .update(tags)
    .set(updateData)
    .where(eq(tags.id, tagId))
    .returning();

  if (!updatedTag) {
    return { type: "error", message: "Failed to update tag" };
  }

  return { type: "tag_updated", id: updatedTag.id, name: updatedTag.name, color: updatedTag.color };
}

async function deleteTagById(userId: string, tagId: string): Promise<ToolResult> {
  const tag = await getOwnedTag(userId, tagId);
  if (!tag) return { type: "error", message: "Tag not found" };

  await db.delete(tags).where(eq(tags.id, tagId));
  return { type: "tag_deleted", id: tagId };
}

async function listRelationshipTypes(userId: string): Promise<ToolResult> {
  const types = await db
    .select()
    .from(relationshipTypes)
    .where(eq(relationshipTypes.userId, userId))
    .orderBy(asc(relationshipTypes.name));

  return { type: "relationship_types", types };
}

async function createRelationshipType(
  userId: string,
  payload: {
    name: string;
    reverseTypeId?: string;
    maleReverseTypeId?: string;
    femaleReverseTypeId?: string;
    isSymmetric?: boolean;
  }
): Promise<ToolResult> {
  const [existing] = await db
    .select({ id: relationshipTypes.id })
    .from(relationshipTypes)
    .where(and(eq(relationshipTypes.userId, userId), eq(relationshipTypes.name, payload.name)));

  if (existing) {
    return { type: "error", message: "A relationship type with this name already exists" };
  }

  const [newType] = await db
    .insert(relationshipTypes)
    .values({
      userId,
      name: payload.name,
      reverseTypeId: payload.reverseTypeId || null,
      maleReverseTypeId: payload.maleReverseTypeId || null,
      femaleReverseTypeId: payload.femaleReverseTypeId || null,
      isSymmetric: payload.isSymmetric || false,
      isSystem: false,
    })
    .returning();

  if (!newType) {
    return { type: "error", message: "Failed to create relationship type" };
  }

  return { type: "relationship_type_created", id: newType.id, name: newType.name };
}

async function updateRelationshipTypeById(
  userId: string,
  typeId: string,
  updates: {
    name?: string;
    reverseTypeId?: string;
    maleReverseTypeId?: string;
    femaleReverseTypeId?: string;
    isSymmetric?: boolean;
  }
): Promise<ToolResult> {
  const existing = await getOwnedRelationshipType(userId, typeId);
  if (!existing) return { type: "error", message: "Relationship type not found" };

  if (existing.isSystem) {
    return { type: "error", message: "Cannot modify system relationship types" };
  }

  const updateData: any = { updatedAt: new Date() };
  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.reverseTypeId !== undefined)
    updateData.reverseTypeId = updates.reverseTypeId || null;
  if (updates.maleReverseTypeId !== undefined)
    updateData.maleReverseTypeId = updates.maleReverseTypeId || null;
  if (updates.femaleReverseTypeId !== undefined)
    updateData.femaleReverseTypeId = updates.femaleReverseTypeId || null;
  if (updates.isSymmetric !== undefined) updateData.isSymmetric = updates.isSymmetric;

  const [updatedType] = await db
    .update(relationshipTypes)
    .set(updateData)
    .where(eq(relationshipTypes.id, typeId))
    .returning();

  if (!updatedType) {
    return { type: "error", message: "Failed to update relationship type" };
  }

  return { type: "relationship_type_updated", id: updatedType.id, name: updatedType.name };
}

async function deleteRelationshipTypeById(
  userId: string,
  typeId: string
): Promise<ToolResult> {
  const existing = await getOwnedRelationshipType(userId, typeId);
  if (!existing) return { type: "error", message: "Relationship type not found" };

  if (existing.isSystem) {
    return { type: "error", message: "Cannot delete system relationship types" };
  }

  await db.delete(relationships).where(eq(relationships.typeId, typeId));
  await db.delete(relationshipTypes).where(eq(relationshipTypes.id, typeId));

  return { type: "relationship_type_deleted", id: typeId };
}

async function listRelationships(
  userId: string,
  contactId?: string
): Promise<ToolResult> {
  let relationshipsList;
  if (contactId) {
    relationshipsList = await db
      .select()
      .from(relationships)
      .where(
        and(
          eq(relationships.userId, userId),
          or(
            eq(relationships.fromContactId, contactId),
            eq(relationships.toContactId, contactId)
          )
        )
      );
  } else {
    relationshipsList = await db
      .select()
      .from(relationships)
      .where(eq(relationships.userId, userId));
  }

  const contactIds = [
    ...new Set([
      ...relationshipsList.map((r: any) => r.fromContactId),
      ...relationshipsList.map((r: any) => r.toContactId),
    ]),
  ];
  const typeIds = [...new Set(relationshipsList.map((r: any) => r.typeId))];

  const [contactsData, typesData] = await Promise.all([
    contactIds.length > 0
      ? db
          .select({ id: contacts.id, displayName: contacts.displayName })
          .from(contacts)
          .where(inArray(contacts.id, contactIds))
      : [],
    typeIds.length > 0
      ? db.select().from(relationshipTypes).where(inArray(relationshipTypes.id, typeIds))
      : [],
  ]);

  const contactsMap = Object.fromEntries(contactsData.map((c) => [c.id, c]));
  const typesMap = Object.fromEntries(typesData.map((t) => [t.id, t]));

  const enrichedRelationships = relationshipsList.map((rel: any) => ({
    ...rel,
    fromContact: contactsMap[rel.fromContactId] || null,
    toContact: contactsMap[rel.toContactId] || null,
    type: typesMap[rel.typeId] || null,
  }));

  return { type: "relationships", relationships: enrichedRelationships };
}

async function createRelationship(
  userId: string,
  payload: { fromContactId: string; toContactId: string; typeId: string; notes?: string }
): Promise<ToolResult> {
  const contactsExist = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(
      and(
        eq(contacts.userId, userId),
        or(eq(contacts.id, payload.fromContactId), eq(contacts.id, payload.toContactId))
      )
    );

  if (contactsExist.length !== 2) {
    return { type: "error", message: "One or both contacts not found" };
  }

  const [typeExists] = await db
    .select({ id: relationshipTypes.id })
    .from(relationshipTypes)
    .where(and(eq(relationshipTypes.userId, userId), eq(relationshipTypes.id, payload.typeId)));

  if (!typeExists) {
    return { type: "error", message: "Relationship type not found" };
  }

  const [existing] = await db
    .select({ id: relationships.id })
    .from(relationships)
    .where(
      and(
        eq(relationships.fromContactId, payload.fromContactId),
        eq(relationships.toContactId, payload.toContactId),
        eq(relationships.typeId, payload.typeId)
      )
    );

  if (existing) {
    return { type: "error", message: "This relationship already exists" };
  }

  const [newRelationship] = await db
    .insert(relationships)
    .values({
      userId,
      fromContactId: payload.fromContactId,
      toContactId: payload.toContactId,
      typeId: payload.typeId,
      notes: payload.notes || null,
    })
    .returning();

  if (!newRelationship) {
    return { type: "error", message: "Failed to create relationship" };
  }

  return { type: "relationship_created", id: newRelationship.id };
}

async function updateRelationshipById(
  userId: string,
  relationshipId: string,
  updates: { typeId?: string; notes?: string }
): Promise<ToolResult> {
  const existing = await getOwnedRelationship(userId, relationshipId);
  if (!existing) return { type: "error", message: "Relationship not found" };

  if (updates.typeId) {
    const [typeExists] = await db
      .select({ id: relationshipTypes.id })
      .from(relationshipTypes)
      .where(and(eq(relationshipTypes.userId, userId), eq(relationshipTypes.id, updates.typeId)));

    if (!typeExists) {
      return { type: "error", message: "Relationship type not found" };
    }
  }

  const updateData: any = { updatedAt: new Date() };
  if (updates.typeId !== undefined) updateData.typeId = updates.typeId;
  if (updates.notes !== undefined) updateData.notes = updates.notes || null;

  await db.update(relationships).set(updateData).where(eq(relationships.id, relationshipId));

  return { type: "relationship_updated", id: relationshipId };
}

async function deleteRelationshipById(
  userId: string,
  relationshipId: string
): Promise<ToolResult> {
  const existing = await getOwnedRelationship(userId, relationshipId);
  if (!existing) return { type: "error", message: "Relationship not found" };

  await db.delete(relationships).where(eq(relationships.id, relationshipId));
  return { type: "relationship_deleted", id: relationshipId };
}

// Set the user's primary contact (links "me"/"I" to a contact record)
async function setMyContact(
  userId: string,
  contactId: string
): Promise<ToolResult> {
  const [contact] = await db
    .select({ id: contacts.id, displayName: contacts.displayName })
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.userId, userId)))
    .limit(1);

  if (!contact) {
    return { type: "error", message: "Contact not found" };
  }

  await db
    .update(users)
    .set({ primaryContactId: contactId, updatedAt: new Date() })
    .where(eq(users.id, userId));

  return {
    type: "my_contact_set",
    contactId: contact.id,
    displayName: contact.displayName,
  };
}

// Resolve a contact name to a contact, reusing the existing fuzzy search.
// Returns the best match if clear, or top 5 candidates for disambiguation.
async function resolveContactByName(
  userId: string,
  name: string
): Promise<ToolResult> {
  const result = await searchContactsFuzzy(userId, name, 5);
  const matches = (result as any).contacts as Array<{
    id: string;
    displayName: string;
    similarity?: number;
  }>;

  if (!matches || matches.length === 0) {
    return {
      type: "contact_not_found",
      message: `No contacts found matching "${name}". You can create a new contact if needed.`,
      searchedName: name,
    };
  }

  // If there's a single strong match (similarity >= 0.6), return it directly
  const topMatch = matches[0]!;
  if (matches.length === 1 || (topMatch.similarity && topMatch.similarity >= 0.6)) {
    return {
      type: "contact_resolved",
      contact: { id: topMatch.id, displayName: topMatch.displayName },
    };
  }

  // Multiple possible matches — return top 5 for disambiguation
  return {
    type: "contact_ambiguous",
    message: `Multiple contacts match "${name}". Please ask the user which one they mean.`,
    candidates: matches.map((m) => ({
      id: m.id,
      displayName: m.displayName,
    })),
  };
}

// Resolve a relationship type by name, returning top matches when ambiguous
async function resolveRelationshipTypeByName(
  userId: string,
  typeName: string
): Promise<ToolResult> {
  // Try exact match first (case-insensitive)
  const [exactMatch] = await db
    .select({ id: relationshipTypes.id, name: relationshipTypes.name })
    .from(relationshipTypes)
    .where(
      and(
        eq(relationshipTypes.userId, userId),
        sql`LOWER(${relationshipTypes.name}) = LOWER(${typeName})`
      )
    )
    .limit(1);

  if (exactMatch) {
    return {
      type: "relationship_type_resolved",
      relationshipType: { id: exactMatch.id, name: exactMatch.name },
    };
  }

  // Try partial match
  const partialMatches = await db
    .select({ id: relationshipTypes.id, name: relationshipTypes.name })
    .from(relationshipTypes)
    .where(
      and(
        eq(relationshipTypes.userId, userId),
        ilike(relationshipTypes.name, `%${typeName}%`)
      )
    )
    .limit(5);

  if (partialMatches.length === 1) {
    const match = partialMatches[0]!;
    return {
      type: "relationship_type_resolved",
      relationshipType: { id: match.id, name: match.name },
    };
  }

  if (partialMatches.length > 1) {
    return {
      type: "relationship_type_ambiguous",
      message: `Multiple relationship types match "${typeName}". Ask the user which one they mean.`,
      candidates: partialMatches.map((t) => ({ id: t.id, name: t.name })),
    };
  }

  return {
    type: "relationship_type_not_found",
    message: `No relationship type found matching "${typeName}". You can create one using the create_relationship_type tool.`,
    searchedName: typeName,
  };
}

// Smart relationship creation using names instead of IDs
async function createRelationshipByNames(
  userId: string,
  payload: {
    fromContactName?: string;
    fromContactId?: string;
    toContactName?: string;
    toContactId?: string;
    relationshipTypeName?: string;
    relationshipTypeId?: string;
    notes?: string;
  }
): Promise<ToolResult> {
  // Resolve "from" contact
  let fromId = payload.fromContactId;
  if (!fromId && payload.fromContactName) {
    const result = await resolveContactByName(userId, payload.fromContactName);
    if (result.type === "contact_resolved") {
      fromId = (result as any).contact.id;
    } else {
      return result; // Return ambiguous/not_found result to the LLM
    }
  }

  // Resolve "to" contact
  let toId = payload.toContactId;
  if (!toId && payload.toContactName) {
    const result = await resolveContactByName(userId, payload.toContactName);
    if (result.type === "contact_resolved") {
      toId = (result as any).contact.id;
    } else {
      return result; // Return ambiguous/not_found result to the LLM
    }
  }

  if (!fromId || !toId) {
    return { type: "error", message: "Both from and to contacts are required" };
  }

  // Resolve relationship type
  let typeId = payload.relationshipTypeId;
  if (!typeId && payload.relationshipTypeName) {
    const result = await resolveRelationshipTypeByName(userId, payload.relationshipTypeName);
    if (result.type === "relationship_type_resolved") {
      typeId = (result as any).relationshipType.id;
    } else {
      return result; // Return ambiguous/not_found result to the LLM
    }
  }

  if (!typeId) {
    return { type: "error", message: "Relationship type is required" };
  }

  // Now create the relationship using the resolved IDs
  return createRelationship(userId, {
    fromContactId: fromId,
    toContactId: toId,
    typeId,
    notes: payload.notes,
  });
}

function buildSystemPrompt(userContext: UserContext): string {
  const today = formatToday(new Date());

  let userSection = "";
  if (userContext.primaryContactId && userContext.primaryContactName) {
    userSection = `
## Current User
The logged-in user is "${userContext.userName || userContext.userEmail}" (email: ${userContext.userEmail}).
Their contact record in the CRM is: "${userContext.primaryContactName}" (ID: ${userContext.primaryContactId}).
When the user says "I", "me", "my", "mine", they are referring to this contact.
For example, "Abhinav is my son" means: create a relationship from the user's contact to Abhinav with type "Son".`;
  } else {
    userSection = `
## Current User
The logged-in user is "${userContext.userName || userContext.userEmail}" (email: ${userContext.userEmail}).
IMPORTANT: The user has NOT yet linked their contact record. If the user refers to themselves ("I", "me", "my") in the context of contacts or relationships, you MUST:
1. Search for contacts matching their name "${userContext.userName || ""}" using query_contacts or search_contacts_fuzzy.
2. Present the top matches (up to 5) and ask them to confirm which one is them, OR offer to create a new contact for them.
3. Once they confirm, use the set_my_contact tool to link their contact, so future requests will work seamlessly.
Do NOT ask for raw IDs — always resolve names to contacts automatically.`;
  }

  return `You are a helpful assistant for Orbit, a personal CRM app. Help users manage their contacts, conversations, events, and reminders.

Today's date is ${today}.
${userSection}

## Capabilities
You can:
- Create, update, delete, and look up contacts (including tags, images, and relationships)
- Search contacts (fuzzy search or by phone number)
- Log, update, delete, and search conversations
- Create, update, delete, and query events
- Create, update, complete, delete, and query reminders
- Manage tags
- Manage relationships and relationship types
Note: All deletions require user confirmation (see Deletion Safety rules below).

## Contact Resolution
IMPORTANT: Never ask the user for raw IDs. Always resolve contact names automatically:
- When the user mentions a person's name, use search_contacts_fuzzy or query_contacts to find matching contacts.
- If there's exactly one strong match, use it automatically.
- If there are multiple possible matches, present the top candidates (up to 5) and ask the user to pick one.
- If no match is found, offer to create a new contact.

## Relationship Creation
When the user describes a relationship (e.g., "Abhinav is my son", "Sarah is John's wife"):
1. Resolve both contact names to contact IDs (use the user's own contact for "I"/"me"/"my").
2. Use list_relationship_types to find the matching relationship type, or create one if needed.
3. Use create_relationship_smart to create the relationship using names — it handles fuzzy resolution automatically.

## Deletion Safety — CRITICAL
When a user asks to delete ANYTHING (contact, conversation, event, reminder, tag, relationship, relationship type, or image):
1. NEVER call a delete tool immediately. First, search for matching objects using the appropriate query/search tool.
2. Present the matching results to the user (the client will render them as cards).
3. If multiple matches are found, ask the user to select which one to delete.
4. If exactly one match is found, still show it and ask: "Should I go ahead and delete this?"
5. ONLY call the actual delete tool AFTER the user explicitly confirms in a subsequent message (e.g., "yes", "go ahead", "delete it", "confirm").
6. If the user does not confirm or says "no" / "cancel", do NOT delete and acknowledge the cancellation.

## General Guidelines
- When users describe interactions or meetings, extract the relevant information and use the appropriate functions.
- When users ask about contact information like phone numbers, use the get_contact_details tool to retrieve it.
- When users ask to find, search, show, or list contacts, conversations, events, reminders, tags, or relationships, always call the corresponding query tool.
- Keep responses brief when tool results are available; the client will render result cards.
- When returning lists of contacts, conversations, events, or reminders, keep results to 10 or fewer.
- When users mention relative dates like "today", "tomorrow", "yesterday", "next week", etc., convert them to actual dates based on today's date. If no date is mentioned, assume it's for today.
- Be conversational and friendly.`;
}

function buildUiFromToolResults(
  toolResults: Array<{ output?: ToolResult }>
): AssistantUi | null {
  const createdCards: AssistantCreatedCard[] = [];
  const createdKeys = new Set<string>();

  for (const toolResult of toolResults) {
    const output = toolResult.output;
    if (!output || typeof output !== "object") continue;

    if (output.type === "contact_created") {
      const id = String(output.id || "");
      const key = `contact:${id}`;
      if (createdKeys.has(key)) continue;
      createdKeys.add(key);
      createdCards.push({
        kind: "contact",
        contact: {
          id,
          displayName: String(output.displayName || ""),
          primaryPhone: (output.primaryPhone as string | null | undefined) ?? null,
          primaryEmail: (output.primaryEmail as string | null | undefined) ?? null,
          company: (output.company as string | null | undefined) ?? null,
          jobTitle: (output.jobTitle as string | null | undefined) ?? null,
          location: (output.location as string | null | undefined) ?? null,
        },
      });
      continue;
    }

    if (output.type === "conversation_created") {
      const id = String(output.id || "");
      const key = `conversation:${id}`;
      if (createdKeys.has(key)) continue;
      createdKeys.add(key);
      createdCards.push({
        kind: "conversation",
        conversation: {
          id,
          medium: String(output.medium || "OTHER"),
          happenedAt: String(output.happenedAt || ""),
          content: (output.content as string | null | undefined) ?? null,
          participants: Array.isArray(output.participants)
            ? output.participants.map((p: any) =>
                p?.contact?.displayName
                  ? String(p.contact.displayName)
                  : String(p)
              )
            : [],
        },
      });
      continue;
    }

    if (output.type === "event_created") {
      const id = String(output.id || "");
      const key = `event:${id}`;
      if (createdKeys.has(key)) continue;
      createdKeys.add(key);
      createdCards.push({
        kind: "event",
        event: {
          id,
          title: String(output.title || ""),
          startAt: String(output.startAt || ""),
          location: (output.location as string | null | undefined) ?? null,
          participants: Array.isArray(output.participants)
            ? output.participants.map((p: any) =>
                p?.contact?.displayName
                  ? String(p.contact.displayName)
                  : String(p)
              )
            : [],
        },
      });
      continue;
    }

    if (output.type === "reminder_created") {
      const id = String(output.id || "");
      const key = `reminder:${id}`;
      if (createdKeys.has(key)) continue;
      createdKeys.add(key);
      createdCards.push({
        kind: "reminder",
        reminder: {
          id,
          title: String(output.title || "Follow up"),
          dueAt: String(output.dueAt || ""),
          status: String(output.status || "OPEN"),
          participants: Array.isArray(output.participants)
            ? output.participants.map((p: any) => String(p))
            : [],
        },
      });
    }
  }

  if (createdCards.length > 0) {
    return { kind: "created", cards: createdCards };
  }

  for (let i = toolResults.length - 1; i >= 0; i -= 1) {
    const output = toolResults[i]?.output;
    if (!output || typeof output !== "object") continue;

    if (output.type === "contacts_found") {
      const contacts = Array.isArray(output.contacts) ? output.contacts : [];
      return {
        kind: "contacts",
        count: typeof output.count === "number" ? output.count : contacts.length,
        contacts: contacts.map((contact: any) => ({
          id: String(contact.id),
          displayName: String(contact.displayName || ""),
          primaryPhone: contact.primaryPhone ?? null,
          primaryEmail: contact.primaryEmail ?? null,
          company: contact.company ?? null,
          jobTitle: contact.jobTitle ?? null,
          location: contact.location ?? null,
        })),
      };
    }

    if (output.type === "contact_details") {
      return {
        kind: "contact",
        contact: {
          id: String(output.id),
          displayName: String(output.displayName || ""),
          primaryPhone: (output.primaryPhone as string | null | undefined) ?? null,
          primaryEmail: (output.primaryEmail as string | null | undefined) ?? null,
          company: (output.company as string | null | undefined) ?? null,
          jobTitle: (output.jobTitle as string | null | undefined) ?? null,
          location: (output.location as string | null | undefined) ?? null,
        },
      };
    }

    if (output.type === "conversations_found") {
      const conversations = Array.isArray(output.conversations) ? output.conversations : [];
      return {
        kind: "conversations",
        count: typeof output.count === "number" ? output.count : conversations.length,
        conversations: conversations.map((conversation: any) => ({
          id: String(conversation.id),
          medium: String(conversation.medium || "OTHER"),
          happenedAt: String(conversation.happenedAt || ""),
          content: conversation.content ?? null,
          participants: Array.isArray(conversation.participants)
            ? conversation.participants.map((p: any) =>
                p?.contact?.displayName
                  ? String(p.contact.displayName)
                  : String(p)
              )
            : [],
        })),
      };
    }

    if (output.type === "events_found") {
      const events = Array.isArray(output.events) ? output.events : [];
      return {
        kind: "events",
        count: typeof output.count === "number" ? output.count : events.length,
        events: events.map((event: any) => ({
          id: String(event.id),
          title: String(event.title || ""),
          startAt: String(event.startAt || ""),
          location: event.location ?? null,
          participants: Array.isArray(event.participants)
            ? event.participants.map((p: any) =>
                p?.contact?.displayName
                  ? String(p.contact.displayName)
                  : String(p)
              )
            : [],
        })),
      };
    }

    if (output.type === "reminder_details") {
      return {
        kind: "reminders",
        count: 1,
        reminders: [
          {
            id: String(output.id),
            title: String(output.title || "Follow up"),
            dueAt: String(output.dueAt || ""),
            status: String(output.status || "OPEN"),
            participants: Array.isArray(output.participants)
              ? output.participants.map((participant: any) =>
                  participant?.contact?.displayName
                    ? String(participant.contact.displayName)
                    : String(participant)
                )
              : [],
          },
        ],
      };
    }

    if (output.type === "reminders_found") {
      const remindersList = Array.isArray(output.reminders) ? output.reminders : [];
      return {
        kind: "reminders",
        count: typeof output.count === "number" ? output.count : remindersList.length,
        reminders: remindersList.map((reminder: any) => ({
          id: String(reminder.id),
          title: String(reminder.title || "Follow up"),
          dueAt: String(reminder.dueAt || ""),
          status: String(reminder.status || "OPEN"),
          participants: Array.isArray(reminder.participants)
            ? reminder.participants.map((participant: any) =>
                participant?.contact?.displayName
                  ? String(participant.contact.displayName)
                  : String(participant)
              )
            : [],
        })),
      };
    }
  }

  return null;
}

function summarizeUiText(ui: AssistantUi | null, fallback: string): string {
  if (!ui) return fallback;

  if (ui.kind === "created") {
    if (fallback.trim().length > 0) {
      return fallback;
    }

    const contactCount = ui.cards.filter((card) => card.kind === "contact").length;
    const conversationCount = ui.cards.filter((card) => card.kind === "conversation").length;
    const eventCount = ui.cards.filter((card) => card.kind === "event").length;
    const reminderCount = ui.cards.filter((card) => card.kind === "reminder").length;
    const chunks = [
      contactCount > 0
        ? `${contactCount} contact${contactCount === 1 ? "" : "s"}`
        : null,
      conversationCount > 0
        ? `${conversationCount} conversation${conversationCount === 1 ? "" : "s"}`
        : null,
      eventCount > 0 ? `${eventCount} event${eventCount === 1 ? "" : "s"}` : null,
      reminderCount > 0 ? `${reminderCount} reminder${reminderCount === 1 ? "" : "s"}` : null,
    ].filter(Boolean);

    return chunks.length > 0 ? `Logged ${chunks.join(", ")}.` : "Done.";
  }

  if (ui.kind === "contacts") {
    if (ui.count === 0) return "No contacts found.";
    if (ui.contacts.length < ui.count) {
      return `Showing ${ui.contacts.length} of ${ui.count} contacts.`;
    }
    return `Showing ${ui.count} contact${ui.count === 1 ? "" : "s"}.`;
  }

  if (ui.kind === "conversations") {
    if (ui.count === 0) return "No conversations found.";
    if (ui.conversations.length < ui.count) {
      return `Showing ${ui.conversations.length} of ${ui.count} conversations.`;
    }
    return `Showing ${ui.count} conversation${ui.count === 1 ? "" : "s"}.`;
  }

  if (ui.kind === "events") {
    if (ui.count === 0) return "No events found.";
    if (ui.events.length < ui.count) {
      return `Showing ${ui.events.length} of ${ui.count} events.`;
    }
    return `Showing ${ui.count} event${ui.count === 1 ? "" : "s"}.`;
  }

  if (ui.kind === "reminders") {
    if (ui.count === 0) return "No reminders found.";
    if (ui.reminders.length < ui.count) {
      return `Showing ${ui.reminders.length} of ${ui.count} reminders.`;
    }
    return `Showing ${ui.count} reminder${ui.count === 1 ? "" : "s"}.`;
  }

  if (ui.kind === "contact") {
    return "Here are the contact details.";
  }

  return fallback;
}

export async function processMessageLLM(
  userId: string,
  messages: ChatMessage[],
  generate: typeof generateText = generateText
): Promise<{ text: string; ui: AssistantUi | null }> {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return {
      text:
        "Assistant is not configured. Set GOOGLE_GENERATIVE_AI_API_KEY in apps/api/.env to enable LLM features.",
      ui: null,
    };
  }

  const tools = {
    create_conversation: tool({
      description: "Create a new conversation record with participants",
      inputSchema: z.object({
        participantNames: z
          .string()
          .optional()
          .describe("Comma-separated names of people in the conversation (e.g., 'John, Sarah')"),
        participantIds: z
          .array(z.string())
          .optional()
          .describe("Participant contact IDs"),
        medium: z.string().describe("How the conversation happened (e.g., 'phone call', 'WhatsApp', 'email')"),
        content: z.string().optional().describe("Notes about the conversation"),
        happenedAt: z.string().optional().describe("When it happened in ISO date format"),
        followUpAt: z.string().optional().describe("Follow-up date/time in ISO format"),
        eventId: z.string().optional().describe("Linked event ID, if any"),
      }),
      execute: async ({
        participantNames,
        participantIds,
        medium,
        content,
        happenedAt,
        followUpAt,
        eventId,
      }) =>
        createConversation(
          userId,
          participantNames,
          participantIds,
          medium,
          content,
          happenedAt,
          followUpAt,
          eventId
        ),
    }),

    query_conversations: tool({
      description: "Search and retrieve conversations",
      inputSchema: z.object({
        participantName: z.string().optional().describe("Name of participant to filter by"),
        medium: z.string().optional().describe("Medium to filter by"),
        limit: z.number().optional().describe("Number of results to return, defaults to 10"),
      }),
      execute: async ({ participantName, medium, limit }) =>
        queryConversations(userId, participantName, medium, limit),
    }),

    create_event: tool({
      description: "Create a new event with participants",
      inputSchema: z.object({
        title: z.string().describe("Event title"),
        participantNames: z
          .string()
          .optional()
          .describe("Comma-separated names of people attending (e.g., 'John, Sarah')"),
        participantIds: z.array(z.string()).optional().describe("Participant contact IDs"),
        startAt: z.string().describe("Start date/time in ISO format"),
        endAt: z.string().optional().describe("End date/time in ISO format"),
        location: z.string().optional().describe("Event location"),
        description: z.string().optional().describe("Event description"),
        eventType: z
          .string()
          .optional()
          .describe(
            "Type of event (e.g., 'meeting', 'call', 'birthday', 'anniversary', 'conference', 'social', 'family event')"
          ),
      }),
      execute: async ({
        title,
        participantNames,
        participantIds,
        startAt,
        endAt,
        location,
        description,
        eventType,
      }) =>
        createEvent(
          userId,
          title,
          startAt,
          participantNames,
          participantIds,
          endAt,
          location,
          description,
          eventType
        ),
    }),

    query_events: tool({
      description: "Search and retrieve events",
      inputSchema: z.object({
        participantName: z.string().optional().describe("Name of participant to filter by"),
        limit: z.number().optional().describe("Number of results to return, defaults to 10"),
      }),
      execute: async ({ participantName, limit }) => queryEvents(userId, participantName, limit),
    }),

    create_contact: tool({
      description: "Create a new contact with their details",
      inputSchema: z.object({
        displayName: z.string().describe("The contact's full name"),
        primaryPhone: z.string().optional().describe("Phone number"),
        primaryEmail: z.string().optional().describe("Email address"),
        dateOfBirth: z.string().optional().describe("Date of birth in ISO format"),
        gender: z.enum(["MALE", "FEMALE"]).optional().describe("Gender"),
        company: z.string().optional().describe("Company or organization"),
        jobTitle: z.string().optional().describe("Job title or role"),
        location: z.string().optional().describe("City, country, or address"),
        notes: z.string().optional().describe("Any notes about the contact"),
        tagIds: z.array(z.string()).optional().describe("Tag IDs to apply to the contact"),
      }),
      execute: async ({
        displayName,
        primaryPhone,
        primaryEmail,
        dateOfBirth,
        gender,
        company,
        jobTitle,
        location,
        notes,
        tagIds,
      }) =>
        createContact(
          userId,
          displayName,
          primaryPhone,
          primaryEmail,
          dateOfBirth,
          gender,
          company,
          jobTitle,
          location,
          notes,
          tagIds
        ),
    }),

    update_contact: tool({
      description: "Update an existing contact's information including phone number, email, etc.",
      inputSchema: z.object({
        contactName: z.string().describe("Name of the contact to update"),
        primaryPhone: z.string().optional().describe("New phone number"),
        primaryEmail: z.string().optional().describe("New email address"),
        dateOfBirth: z.string().optional().describe("New date of birth in ISO format"),
        gender: z.enum(["MALE", "FEMALE"]).optional().describe("New gender"),
        company: z.string().optional().describe("New company or organization"),
        jobTitle: z.string().optional().describe("New job title or role"),
        location: z.string().optional().describe("New city, country, or address"),
        notes: z.string().optional().describe("New notes about the contact"),
        tagIds: z.array(z.string()).optional().describe("Replace tags with these tag IDs"),
      }),
      execute: async ({
        contactName,
        primaryPhone,
        primaryEmail,
        dateOfBirth,
        gender,
        company,
        jobTitle,
        location,
        notes,
        tagIds,
      }) =>
        updateContact(
          userId,
          contactName,
          primaryPhone,
          primaryEmail,
          dateOfBirth,
          gender,
          company,
          jobTitle,
          location,
          notes,
          tagIds
        ),
    }),

    query_contacts: tool({
      description: "Search and retrieve contacts by name, company, or other attributes using fuzzy matching",
      inputSchema: z.object({
        searchTerm: z.string().optional().describe("Name, company, or other term to search for"),
        limit: z.number().optional().describe("Number of results to return, defaults to 10"),
      }),
      execute: async ({ searchTerm, limit }) => queryContacts(userId, searchTerm, limit),
    }),

    get_contact_details: tool({
      description: "Get full details of a specific contact including phone number, email, and all other information",
      inputSchema: z.object({
        contactName: z.string().describe("Name of the contact to look up"),
      }),
      execute: async ({ contactName }) => getContactDetails(userId, contactName),
    }),

    list_contacts: tool({
      description: "List contacts with optional pagination and search",
      inputSchema: z.object({
        cursor: z.string().optional().describe("Pagination cursor (contact id)"),
        search: z.string().optional().describe("Search term"),
        limit: z.number().optional().describe("Number of results to return"),
      }),
      execute: async ({ cursor, search, limit }) =>
        listContacts(userId, cursor, search, limit),
    }),

    get_contact: tool({
      description: "Get a single contact by id",
      inputSchema: z.object({
        contactId: z.string().describe("Contact id"),
      }),
      execute: async ({ contactId }) => getContactById(userId, contactId),
    }),

    update_contact_by_id: tool({
      description: "Update a contact by id",
      inputSchema: z.object({
        contactId: z.string().describe("Contact id"),
        displayName: z.string().optional().describe("New display name"),
        primaryPhone: z.string().optional().describe("New phone number"),
        primaryEmail: z.string().optional().describe("New email address"),
        dateOfBirth: z.string().optional().describe("New date of birth in ISO format"),
        gender: z.enum(["MALE", "FEMALE"]).optional().describe("New gender"),
        company: z.string().optional().describe("New company or organization"),
        jobTitle: z.string().optional().describe("New job title or role"),
        location: z.string().optional().describe("New city, country, or address"),
        notes: z.string().optional().describe("New notes about the contact"),
        tagIds: z.array(z.string()).optional().describe("Replace tags with these tag IDs"),
      }),
      execute: async ({
        contactId,
        displayName,
        primaryPhone,
        primaryEmail,
        dateOfBirth,
        gender,
        company,
        jobTitle,
        location,
        notes,
        tagIds,
      }) =>
        updateContactById(userId, contactId, {
          displayName,
          primaryPhone,
          primaryEmail,
          dateOfBirth,
          gender,
          company,
          jobTitle,
          location,
          notes,
          tagIds,
        }),
    }),

    delete_contact: tool({
      description: "Delete a contact by id. IMPORTANT: Only call this AFTER the user has explicitly confirmed the deletion in a previous message. Never call this without prior confirmation.",
      inputSchema: z.object({
        contactId: z.string().describe("Contact id"),
      }),
      execute: async ({ contactId }) => deleteContactById(userId, contactId),
    }),

    add_contact_image: tool({
      description: "Add a contact image",
      inputSchema: z.object({
        contactId: z.string().describe("Contact id"),
        imageUrl: z.string().describe("Image URL"),
        publicId: z.string().optional().describe("Optional public id"),
      }),
      execute: async ({ contactId, imageUrl, publicId }) =>
        addContactImage(userId, contactId, imageUrl, publicId),
    }),

    delete_contact_image: tool({
      description: "Delete a contact image by id. IMPORTANT: Only call this AFTER the user has explicitly confirmed the deletion in a previous message. Never call this without prior confirmation.",
      inputSchema: z.object({
        contactId: z.string().describe("Contact id"),
        imageId: z.string().describe("Image id"),
      }),
      execute: async ({ contactId, imageId }) =>
        deleteContactImage(userId, contactId, imageId),
    }),

    search_contacts_fuzzy: tool({
      description: "Fuzzy search contacts by name",
      inputSchema: z.object({
        name: z.string().describe("Name to search for"),
        limit: z.number().optional().describe("Number of results to return"),
      }),
      execute: async ({ name, limit }) => searchContactsFuzzy(userId, name, limit),
    }),

    search_contacts_by_phone: tool({
      description: "Search contacts by phone number, optionally including conversations, events, or reminders",
      inputSchema: z.object({
        phone: z.string().describe("Phone number to search"),
        include: z
          .array(z.enum(["conversations", "events", "reminders"]))
          .optional()
          .describe("Include related conversations, events, and/or reminders"),
        conversationsLimit: z.number().optional().describe("Limit for conversations"),
        eventsLimit: z.number().optional().describe("Limit for events"),
        remindersLimit: z.number().optional().describe("Limit for reminders"),
      }),
      execute: async ({ phone, include, conversationsLimit, eventsLimit, remindersLimit }) =>
        searchContactsByPhone(
          userId,
          phone,
          include,
          conversationsLimit,
          eventsLimit,
          remindersLimit
        ),
    }),

    list_contact_conversations: tool({
      description: "List conversations for a contact",
      inputSchema: z.object({
        contactId: z.string().describe("Contact id"),
        cursor: z.string().optional().describe("Pagination cursor (conversation id)"),
        search: z.string().optional().describe("Search term"),
        medium: z.enum(conversationMediums).optional().describe("Conversation medium"),
        limit: z.number().optional().describe("Number of results to return"),
      }),
      execute: async ({ contactId, cursor, search, medium, limit }) =>
        listContactConversations(userId, contactId, cursor, search, medium, limit),
    }),

    list_contact_events: tool({
      description: "List events for a contact",
      inputSchema: z.object({
        contactId: z.string().describe("Contact id"),
        cursor: z.string().optional().describe("Pagination cursor (event id)"),
        search: z.string().optional().describe("Search term"),
        eventType: z.enum(eventTypes).optional().describe("Event type"),
        limit: z.number().optional().describe("Number of results to return"),
      }),
      execute: async ({ contactId, cursor, search, eventType, limit }) =>
        listContactEvents(userId, contactId, cursor, search, eventType, limit),
    }),

    list_conversations: tool({
      description: "List conversations with optional pagination and filters",
      inputSchema: z.object({
        cursor: z.string().optional().describe("Pagination cursor (conversation id)"),
        search: z.string().optional().describe("Search term"),
        medium: z.enum(conversationMediums).optional().describe("Conversation medium"),
        limit: z.number().optional().describe("Number of results to return"),
      }),
      execute: async ({ cursor, search, medium, limit }) =>
        listConversations(userId, cursor, search, medium, limit),
    }),

    get_conversation: tool({
      description: "Get a single conversation by id",
      inputSchema: z.object({
        conversationId: z.string().describe("Conversation id"),
      }),
      execute: async ({ conversationId }) => getConversationById(userId, conversationId),
    }),

    create_conversation_by_ids: tool({
      description: "Create a conversation using participant ids",
      inputSchema: z.object({
        content: z.string().optional().describe("Notes about the conversation"),
        medium: z.enum(conversationMediums).describe("Conversation medium"),
        happenedAt: z.string().describe("When it happened in ISO date format"),
        followUpAt: z.string().optional().describe("Follow up date in ISO format"),
        eventId: z.string().optional().describe("Linked event id"),
        participantIds: z.array(z.string()).describe("Participant contact ids"),
      }),
      execute: async ({
        content,
        medium,
        happenedAt,
        followUpAt,
        eventId,
        participantIds,
      }) =>
        createConversationByIds(userId, {
          content,
          medium,
          happenedAt,
          followUpAt,
          eventId,
          participantIds,
        }),
    }),

    update_conversation_by_id: tool({
      description: "Update a conversation by id",
      inputSchema: z.object({
        conversationId: z.string().describe("Conversation id"),
        content: z.string().optional().describe("Conversation content"),
        medium: z.enum(conversationMediums).optional().describe("Conversation medium"),
        happenedAt: z.string().optional().describe("When it happened in ISO date format"),
        followUpAt: z.string().optional().describe("Follow up date in ISO format"),
        eventId: z.string().optional().describe("Linked event id"),
        participantIds: z.array(z.string()).optional().describe("Participant contact ids"),
      }),
      execute: async ({
        conversationId,
        content,
        medium,
        happenedAt,
        followUpAt,
        eventId,
        participantIds,
      }) =>
        updateConversationById(userId, conversationId, {
          content,
          medium,
          happenedAt,
          followUpAt,
          eventId,
          participantIds,
        }),
    }),

    delete_conversation: tool({
      description: "Delete a conversation by id. IMPORTANT: Only call this AFTER the user has explicitly confirmed the deletion in a previous message. Never call this without prior confirmation.",
      inputSchema: z.object({
        conversationId: z.string().describe("Conversation id"),
      }),
      execute: async ({ conversationId }) => deleteConversationById(userId, conversationId),
    }),

    list_conversations_by_contacts: tool({
      description: "List conversations that include all provided contacts",
      inputSchema: z.object({
        contactIds: z.array(z.string()).describe("Contact ids"),
        cursor: z.string().optional().describe("Pagination cursor (conversation id)"),
        search: z.string().optional().describe("Search term"),
        medium: z.enum(conversationMediums).optional().describe("Conversation medium"),
        limit: z.number().optional().describe("Number of results to return"),
      }),
      execute: async ({ contactIds, cursor, search, medium, limit }) =>
        listConversationsByContacts(userId, contactIds, cursor, search, medium, limit),
    }),

    list_events: tool({
      description: "List events with optional pagination and filters",
      inputSchema: z.object({
        cursor: z.string().optional().describe("Pagination cursor (event id)"),
        search: z.string().optional().describe("Search term"),
        eventType: z.enum(eventTypes).optional().describe("Event type"),
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
        eventType: z.enum(eventTypes).describe("Event type"),
        startAt: z.string().describe("Start date/time in ISO format"),
        endAt: z.string().optional().describe("End date/time in ISO format"),
        location: z.string().optional().describe("Event location"),
        participantIds: z.array(z.string()).optional().describe("Participant contact ids"),
      }),
      execute: async ({
        title,
        description,
        eventType,
        startAt,
        endAt,
        location,
        participantIds,
      }) =>
        createEventByIds(userId, {
          title,
          description,
          eventType,
          startAt,
          endAt,
          location,
          participantIds,
        }),
    }),

    update_event_by_id: tool({
      description: "Update an event by id",
      inputSchema: z.object({
        eventId: z.string().describe("Event id"),
        title: z.string().optional().describe("Event title"),
        description: z.string().optional().describe("Event description"),
        eventType: z.enum(eventTypes).optional().describe("Event type"),
        startAt: z.string().optional().describe("Start date/time in ISO format"),
        endAt: z.string().optional().describe("End date/time in ISO format"),
        location: z.string().optional().describe("Event location"),
        participantIds: z.array(z.string()).optional().describe("Participant contact ids"),
      }),
      execute: async ({
        eventId,
        title,
        description,
        eventType,
        startAt,
        endAt,
        location,
        participantIds,
      }) =>
        updateEventById(userId, eventId, {
          title,
          description,
          eventType,
          startAt,
          endAt,
          location,
          participantIds,
        }),
    }),

    delete_event: tool({
      description: "Delete an event by id. IMPORTANT: Only call this AFTER the user has explicitly confirmed the deletion in a previous message. Never call this without prior confirmation.",
      inputSchema: z.object({
        eventId: z.string().describe("Event id"),
      }),
      execute: async ({ eventId }) => deleteEventById(userId, eventId),
    }),

    list_event_conversations: tool({
      description: "List conversations for an event",
      inputSchema: z.object({
        eventId: z.string().describe("Event id"),
        cursor: z.string().optional().describe("Pagination cursor (conversation id)"),
        search: z.string().optional().describe("Search term"),
        medium: z.enum(conversationMediums).optional().describe("Conversation medium"),
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

    list_reminders: tool({
      description: "List reminders with optional pagination and filters",
      inputSchema: z.object({
        cursor: z.string().optional().describe("Pagination cursor (reminder id)"),
        search: z.string().optional().describe("Search term"),
        status: z.enum(reminderStatuses).optional().describe("Reminder status"),
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
      description: "Create a reminder and link it to contact ids",
      inputSchema: z.object({
        title: z.string().optional().describe("Reminder title"),
        notes: z.string().optional().describe("Reminder notes"),
        dueAt: z.string().describe("Due date/time in ISO format"),
        status: z.enum(reminderStatuses).optional().describe("Reminder status"),
        conversationId: z.string().optional().describe("Linked conversation id"),
        participantIds: z.array(z.string()).describe("Participant contact ids"),
      }),
      execute: async ({ title, notes, dueAt, status, conversationId, participantIds }) =>
        createReminderByIds(userId, {
          title,
          notes,
          dueAt,
          status,
          conversationId,
          participantIds,
        }),
    }),

    update_reminder_by_id: tool({
      description: "Update a reminder by id",
      inputSchema: z.object({
        reminderId: z.string().describe("Reminder id"),
        title: z.string().optional().describe("Reminder title"),
        notes: z.string().optional().describe("Reminder notes"),
        dueAt: z.string().optional().describe("Due date/time in ISO format"),
        status: z.enum(reminderStatuses).optional().describe("Reminder status"),
        conversationId: z.string().optional().describe("Linked conversation id"),
        participantIds: z.array(z.string()).optional().describe("Participant contact ids"),
      }),
      execute: async ({
        reminderId,
        title,
        notes,
        dueAt,
        status,
        conversationId,
        participantIds,
      }) =>
        updateReminderById(userId, reminderId, {
          title,
          notes,
          dueAt,
          status,
          conversationId,
          participantIds,
        }),
    }),

    complete_reminder: tool({
      description: "Mark a reminder as done or canceled",
      inputSchema: z.object({
        reminderId: z.string().describe("Reminder id"),
        status: z.enum(["DONE", "CANCELED"]).optional().describe("Completion status"),
      }),
      execute: async ({ reminderId, status }) =>
        completeReminderById(userId, reminderId, status || "DONE"),
    }),

    delete_reminder: tool({
      description: "Delete a reminder by id. IMPORTANT: Only call this AFTER the user has explicitly confirmed the deletion in a previous message. Never call this without prior confirmation.",
      inputSchema: z.object({
        reminderId: z.string().describe("Reminder id"),
      }),
      execute: async ({ reminderId }) => deleteReminderById(userId, reminderId),
    }),

    list_tags: tool({
      description: "List all tags",
      inputSchema: z.object({}),
      execute: async () => listTags(userId),
    }),

    get_tag: tool({
      description: "Get a tag by id",
      inputSchema: z.object({
        tagId: z.string().describe("Tag id"),
      }),
      execute: async ({ tagId }) => getTagById(userId, tagId),
    }),

    create_tag: tool({
      description: "Create a tag",
      inputSchema: z.object({
        name: z.string().describe("Tag name"),
        color: z
          .string()
          .regex(/^#[0-9A-Fa-f]{6}$/)
          .optional()
          .describe("Hex color"),
      }),
      execute: async ({ name, color }) => createTag(userId, name, color),
    }),

    update_tag: tool({
      description: "Update a tag by id",
      inputSchema: z.object({
        tagId: z.string().describe("Tag id"),
        name: z.string().optional().describe("New tag name"),
        color: z
          .string()
          .regex(/^#[0-9A-Fa-f]{6}$/)
          .optional()
          .describe("New hex color"),
      }),
      execute: async ({ tagId, name, color }) =>
        updateTagById(userId, tagId, { name, color }),
    }),

    delete_tag: tool({
      description: "Delete a tag by id. IMPORTANT: Only call this AFTER the user has explicitly confirmed the deletion in a previous message. Never call this without prior confirmation.",
      inputSchema: z.object({
        tagId: z.string().describe("Tag id"),
      }),
      execute: async ({ tagId }) => deleteTagById(userId, tagId),
    }),

    list_relationships: tool({
      description: "List relationships, optionally filtered by contact id",
      inputSchema: z.object({
        contactId: z.string().optional().describe("Contact id to filter by"),
      }),
      execute: async ({ contactId }) => listRelationships(userId, contactId),
    }),

    create_relationship: tool({
      description: "Create a relationship",
      inputSchema: z.object({
        fromContactId: z.string().describe("From contact id"),
        toContactId: z.string().describe("To contact id"),
        typeId: z.string().describe("Relationship type id"),
        notes: z.string().optional().describe("Notes"),
      }),
      execute: async ({ fromContactId, toContactId, typeId, notes }) =>
        createRelationship(userId, { fromContactId, toContactId, typeId, notes }),
    }),

    update_relationship: tool({
      description: "Update a relationship by id",
      inputSchema: z.object({
        relationshipId: z.string().describe("Relationship id"),
        typeId: z.string().optional().describe("Relationship type id"),
        notes: z.string().optional().describe("Notes"),
      }),
      execute: async ({ relationshipId, typeId, notes }) =>
        updateRelationshipById(userId, relationshipId, { typeId, notes }),
    }),

    delete_relationship: tool({
      description: "Delete a relationship by id. IMPORTANT: Only call this AFTER the user has explicitly confirmed the deletion in a previous message. Never call this without prior confirmation.",
      inputSchema: z.object({
        relationshipId: z.string().describe("Relationship id"),
      }),
      execute: async ({ relationshipId }) =>
        deleteRelationshipById(userId, relationshipId),
    }),

    list_relationship_types: tool({
      description: "List relationship types",
      inputSchema: z.object({}),
      execute: async () => listRelationshipTypes(userId),
    }),

    create_relationship_type: tool({
      description: "Create a relationship type",
      inputSchema: z.object({
        name: z.string().describe("Type name"),
        reverseTypeId: z.string().optional().describe("Reverse type id"),
        maleReverseTypeId: z.string().optional().describe("Male reverse type id"),
        femaleReverseTypeId: z.string().optional().describe("Female reverse type id"),
        isSymmetric: z.boolean().optional().describe("Is symmetric"),
      }),
      execute: async ({
        name,
        reverseTypeId,
        maleReverseTypeId,
        femaleReverseTypeId,
        isSymmetric,
      }) =>
        createRelationshipType(userId, {
          name,
          reverseTypeId,
          maleReverseTypeId,
          femaleReverseTypeId,
          isSymmetric,
        }),
    }),

    update_relationship_type: tool({
      description: "Update a relationship type by id",
      inputSchema: z.object({
        typeId: z.string().describe("Type id"),
        name: z.string().optional().describe("Type name"),
        reverseTypeId: z.string().optional().describe("Reverse type id"),
        maleReverseTypeId: z.string().optional().describe("Male reverse type id"),
        femaleReverseTypeId: z.string().optional().describe("Female reverse type id"),
        isSymmetric: z.boolean().optional().describe("Is symmetric"),
      }),
      execute: async ({
        typeId,
        name,
        reverseTypeId,
        maleReverseTypeId,
        femaleReverseTypeId,
        isSymmetric,
      }) =>
        updateRelationshipTypeById(userId, typeId, {
          name,
          reverseTypeId,
          maleReverseTypeId,
          femaleReverseTypeId,
          isSymmetric,
        }),
    }),

    delete_relationship_type: tool({
      description: "Delete a relationship type by id. IMPORTANT: Only call this AFTER the user has explicitly confirmed the deletion in a previous message. Never call this without prior confirmation.",
      inputSchema: z.object({
        typeId: z.string().describe("Type id"),
      }),
      execute: async ({ typeId }) => deleteRelationshipTypeById(userId, typeId),
    }),

    // --- Smart tools (name-based, with disambiguation) ---

    set_my_contact: tool({
      description:
        "Link the logged-in user to their own contact record. Use this when the user confirms which contact is theirs, so future 'I'/'me'/'my' references resolve automatically.",
      inputSchema: z.object({
        contactId: z
          .string()
          .describe("The contact ID to link as the user's own contact"),
      }),
      execute: async ({ contactId }) => setMyContact(userId, contactId),
    }),

    resolve_contact: tool({
      description:
        "Resolve a person's name to a contact record. Returns the best match if clear, or top 5 candidates if ambiguous. Use this before creating relationships or when you need a contact ID from a name.",
      inputSchema: z.object({
        name: z.string().describe("The person's name to search for"),
      }),
      execute: async ({ name }) => resolveContactByName(userId, name),
    }),

    create_relationship_smart: tool({
      description:
        "Create a relationship between two contacts using names instead of IDs. Automatically resolves contact names and relationship type names via fuzzy matching. Use the user's contact ID for 'I'/'me'/'my' when available from the system prompt. If a contact or type can't be resolved, it returns candidates for disambiguation.",
      inputSchema: z.object({
        fromContactName: z
          .string()
          .optional()
          .describe("Name of the 'from' contact (e.g., the user's name)"),
        fromContactId: z
          .string()
          .optional()
          .describe("ID of the 'from' contact (use if already known, e.g., user's own contact ID from system prompt)"),
        toContactName: z
          .string()
          .optional()
          .describe("Name of the 'to' contact (e.g., 'Abhinav')"),
        toContactId: z
          .string()
          .optional()
          .describe("ID of the 'to' contact (use if already known)"),
        relationshipTypeName: z
          .string()
          .optional()
          .describe("Name of the relationship type (e.g., 'Son', 'Spouse', 'Colleague')"),
        relationshipTypeId: z
          .string()
          .optional()
          .describe("ID of the relationship type (use if already known)"),
        notes: z.string().optional().describe("Optional notes about the relationship"),
      }),
      execute: async ({
        fromContactName,
        fromContactId,
        toContactName,
        toContactId,
        relationshipTypeName,
        relationshipTypeId,
        notes,
      }) =>
        createRelationshipByNames(userId, {
          fromContactName,
          fromContactId,
          toContactName,
          toContactId,
          relationshipTypeName,
          relationshipTypeId,
          notes,
        }),
    }),
  };

  // Fetch user context for personalized system prompt
  const userContext = await getUserContext(userId);

  const modelMessages = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  console.log(`[assistant:llm] Starting LLM processing with ${modelMessages.length} message(s)`);
  console.log(`[assistant:llm] User context: ${userContext.userName || "(no name)"}, primaryContact: ${userContext.primaryContactId || "(not set)"}`);
  const aiModel = process.env.AI_MODEL || "gemini-flash-lite-latest";
  console.log(`[assistant:llm] Model: ${aiModel}`);

  let capturedToolResults: Array<{ output?: ToolResult }> = [];
  let stepIndex = 0;

  const result = await generate({
    model: google(aiModel),
    system: buildSystemPrompt(userContext),
    messages: modelMessages,
    tools,
    stopWhen: stepCountIs(8),
    onStepFinish: (event) => {
      stepIndex++;
      const toolCalls = event.toolCalls || [];
      const toolResultsList = event.toolResults || [];

      if (toolCalls.length > 0) {
        console.log(`[assistant:llm] Step ${stepIndex} — ${toolCalls.length} tool call(s):`);
        for (const tc of toolCalls) {
          const argsPreview = tc.args ? JSON.stringify(tc.args).substring(0, 300) : "(no args)";
          console.log(`  ↳ ${tc.toolName}(${argsPreview})`);
        }
        for (const tr of toolResultsList) {
          const resultObj = tr as { output?: ToolResult };
          if (resultObj.output) {
            const typeInfo = resultObj.output.type || "unknown";
            console.log(`  ← result type: ${typeInfo}`);
          }
        }
      } else if (event.text) {
        const preview = event.text.substring(0, 200);
        console.log(`[assistant:llm] Step ${stepIndex} — text response: "${preview}${event.text.length > 200 ? "..." : ""}"`);
      } else {
        console.log(`[assistant:llm] Step ${stepIndex} — (no tool calls or text)`);
      }
    },
    onFinish: (event) => {
      const stepResults = event.steps.flatMap((step) => step.toolResults || []);
      capturedToolResults = stepResults as Array<{ output?: ToolResult }>;
      console.log(`[assistant:llm] Finished — ${event.steps.length} step(s), ${capturedToolResults.length} tool result(s)`);
    },
  });

  const fallbackToolResults = result.toolResults as Array<{ output?: ToolResult }>;
  const toolResults = capturedToolResults.length > 0 ? capturedToolResults : fallbackToolResults;
  const ui = buildUiFromToolResults(toolResults);
  const text = summarizeUiText(ui, result.text);

  console.log(`[assistant:llm] Final text (${text.length} chars), UI: ${ui ? ui.kind : "none"}`);

  return { text, ui };
}

// POST /api/assistant - Process chat message
app.post("/", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();

  const validation = chatSchema.safeParse(body);
  if (!validation.success) {
    console.warn("[assistant] Invalid request body:", JSON.stringify(validation.error.issues));
    return c.json({ error: validation.error.issues }, 400);
  }

  const { messages } = validation.data;

  // Get the last user message
  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");

  if (!lastUserMessage) {
    console.warn("[assistant] No user message found in request");
    return c.json({ error: "No user message provided" }, 400);
  }

  console.log(`\n${"=".repeat(70)}`);
  console.log(`[assistant] 💬 User question: "${lastUserMessage.content}"`);
  console.log(`[assistant] Chat history: ${messages.length} message(s)`);
  console.log(`${"=".repeat(70)}`);

  const startTime = Date.now();

  try {
    const response = await processMessageLLM(userId, messages as ChatMessage[]);

    const elapsed = Date.now() - startTime;
    console.log(`[assistant] ✅ Response (${elapsed}ms): "${response.text.substring(0, 200)}${response.text.length > 200 ? "..." : ""}"`);
    if (response.ui) {
      console.log(`[assistant] 🎨 UI attached: kind=${response.ui.kind}`);
    }
    console.log(`${"=".repeat(70)}\n`);

    return c.json({
      role: "assistant",
      content: response.text,
      ui: response.ui,
    });
  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`[assistant] ❌ Error after ${elapsed}ms:`, error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ error: `Failed to process message: ${message}` }, 500);
  }
});

export default app;
