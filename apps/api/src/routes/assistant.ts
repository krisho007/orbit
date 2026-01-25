// AI Assistant API Route
import { Hono } from "hono";
import { streamText } from "hono/streaming";
import { z } from "zod";
import { eq, and, desc, sql, ilike } from "drizzle-orm";
import {
  db,
  contacts,
  conversations,
  conversationParticipants,
  events,
  eventParticipants,
  tags,
  contactTags,
  relationships,
  relationshipTypes,
  socialLinks,
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

// Map natural language to ConversationMedium
function mapMedium(text: string): string {
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

// Fuzzy search for contacts
async function findBestContactMatch(userId: string, name: string) {
  try {
    const results = await db.execute(sql`
      SELECT
        id,
        "displayName",
        GREATEST(
          similarity("displayName", ${name}),
          word_similarity(${name}, "displayName")
        ) as similarity
      FROM contacts
      WHERE
        "userId" = ${userId}
        AND (
          similarity("displayName", ${name}) > 0.3
          OR word_similarity(${name}, "displayName") > 0.3
        )
      ORDER BY similarity DESC
      LIMIT 1
    `);

    const rows = results.rows || results;
    if (rows.length > 0) {
      return rows[0] as { id: string; displayName: string };
    }

    // Fallback to ILIKE
    const [contact] = await db
      .select({ id: contacts.id, displayName: contacts.displayName })
      .from(contacts)
      .where(and(eq(contacts.userId, userId), ilike(contacts.displayName, `%${name}%`)))
      .limit(1);

    return contact || null;
  } catch {
    // Fallback to ILIKE if trigram not available
    const [contact] = await db
      .select({ id: contacts.id, displayName: contacts.displayName })
      .from(contacts)
      .where(and(eq(contacts.userId, userId), ilike(contacts.displayName, `%${name}%`)))
      .limit(1);

    return contact || null;
  }
}

// Parse comma-separated names
function parseNames(namesString: string): string[] {
  return namesString
    .split(",")
    .map((n) => n.trim())
    .filter((n) => n.length > 0);
}

// Tool definitions for the AI
interface ToolResult {
  type: string;
  [key: string]: unknown;
}

// Tool implementations
async function createConversation(
  userId: string,
  participantNames: string,
  medium: string,
  content?: string,
  happenedAt?: string
): Promise<ToolResult> {
  const names = parseNames(participantNames);
  const participantIds: string[] = [];

  for (const name of names) {
    const contact = await findBestContactMatch(userId, name);
    if (contact) {
      participantIds.push(contact.id);
    }
  }

  if (participantIds.length === 0) {
    return {
      type: "error",
      message: `Could not find contacts named: ${participantNames}`,
    };
  }

  const mappedMedium = mapMedium(medium || "");

  const [conversation] = await db
    .insert(conversations)
    .values({
      content: content || null,
      medium: mappedMedium as any,
      happenedAt: happenedAt ? new Date(happenedAt) : new Date(),
      userId,
    })
    .returning();

  // Add participants
  if (participantIds.length > 0) {
    await db.insert(conversationParticipants).values(
      participantIds.map((contactId) => ({
        conversationId: conversation.id,
        contactId,
      }))
    );
  }

  // Get participant names
  const participantContacts = await db
    .select({ displayName: contacts.displayName })
    .from(contacts)
    .where(sql`${contacts.id} = ANY(${participantIds})`);

  return {
    type: "conversation_created",
    id: conversation.id,
    medium: conversation.medium,
    happenedAt: conversation.happenedAt,
    participants: participantContacts.map((p) => p.displayName),
  };
}

async function queryConversations(
  userId: string,
  participantName?: string,
  medium?: string,
  limit?: number
): Promise<ToolResult> {
  const conditions = [eq(conversations.userId, userId)];

  let contactFilter: string | null = null;
  if (participantName) {
    const contact = await findBestContactMatch(userId, participantName);
    if (contact) {
      contactFilter = contact.id;
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
    .limit(limit || 10);

  // Filter by participant if needed
  if (contactFilter) {
    const participantConvIds = await db
      .select({ conversationId: conversationParticipants.conversationId })
      .from(conversationParticipants)
      .where(eq(conversationParticipants.contactId, contactFilter));

    const convIds = participantConvIds.map((p) => p.conversationId);
    conversationsList = conversationsList.filter((c) => convIds.includes(c.id));
  }

  // Get participants for each conversation
  const convIds = conversationsList.map((c) => c.id);
  const participants =
    convIds.length > 0
      ? await db
          .select()
          .from(conversationParticipants)
          .innerJoin(contacts, eq(conversationParticipants.contactId, contacts.id))
          .where(sql`${conversationParticipants.conversationId} = ANY(${convIds})`)
      : [];

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
  endAt?: string,
  location?: string,
  description?: string,
  eventType?: string
): Promise<ToolResult> {
  const participantIds: string[] = [];

  if (participantNames) {
    const names = parseNames(participantNames);
    for (const name of names) {
      const contact = await findBestContactMatch(userId, name);
      if (contact) {
        participantIds.push(contact.id);
      }
    }
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

  // Add participants
  if (participantIds.length > 0) {
    await db.insert(eventParticipants).values(
      participantIds.map((contactId) => ({
        eventId: event.id,
        contactId,
      }))
    );
  }

  // Get participant names
  const participantContacts =
    participantIds.length > 0
      ? await db
          .select({ displayName: contacts.displayName })
          .from(contacts)
          .where(sql`${contacts.id} = ANY(${participantIds})`)
      : [];

  return {
    type: "event_created",
    id: event.id,
    title: event.title,
    eventType: event.eventType,
    startAt: event.startAt,
    participants: participantContacts.map((p) => p.displayName),
  };
}

async function queryEvents(
  userId: string,
  participantName?: string,
  limit?: number
): Promise<ToolResult> {
  let contactFilter: string | null = null;
  if (participantName) {
    const contact = await findBestContactMatch(userId, participantName);
    if (contact) {
      contactFilter = contact.id;
    }
  }

  let eventsList = await db
    .select()
    .from(events)
    .where(eq(events.userId, userId))
    .orderBy(desc(events.startAt))
    .limit(limit || 10);

  // Filter by participant if needed
  if (contactFilter) {
    const participantEventIds = await db
      .select({ eventId: eventParticipants.eventId })
      .from(eventParticipants)
      .where(eq(eventParticipants.contactId, contactFilter));

    const eventIds = participantEventIds.map((p) => p.eventId);
    eventsList = eventsList.filter((e) => eventIds.includes(e.id));
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
  company?: string,
  jobTitle?: string,
  location?: string,
  notes?: string
): Promise<ToolResult> {
  const [contact] = await db
    .insert(contacts)
    .values({
      displayName,
      primaryPhone: primaryPhone || null,
      primaryEmail: primaryEmail || null,
      company: company || null,
      jobTitle: jobTitle || null,
      location: location || null,
      notes: notes || null,
      userId,
    })
    .returning();

  return {
    type: "contact_created",
    id: contact.id,
    displayName: contact.displayName,
  };
}

async function getContactDetails(userId: string, contactName: string): Promise<ToolResult> {
  const contact = await findBestContactMatch(userId, contactName);

  if (!contact) {
    return {
      type: "error",
      message: `Could not find a contact named: ${contactName}`,
    };
  }

  const [fullContact] = await db
    .select()
    .from(contacts)
    .where(eq(contacts.id, contact.id));

  // Get tags
  const contactTagsList = await db
    .select()
    .from(contactTags)
    .innerJoin(tags, eq(contactTags.tagId, tags.id))
    .where(eq(contactTags.contactId, contact.id));

  // Get relationships
  const relationshipsFrom = await db
    .select()
    .from(relationships)
    .innerJoin(contacts, eq(relationships.toContactId, contacts.id))
    .innerJoin(relationshipTypes, eq(relationships.typeId, relationshipTypes.id))
    .where(eq(relationships.fromContactId, contact.id));

  const relationshipsTo = await db
    .select()
    .from(relationships)
    .innerJoin(contacts, eq(relationships.fromContactId, contacts.id))
    .innerJoin(relationshipTypes, eq(relationships.typeId, relationshipTypes.id))
    .where(eq(relationships.toContactId, contact.id));

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
  const takeLimit = limit || 10;

  if (searchTerm) {
    try {
      const results = await db.execute(sql`
        SELECT
          id,
          "displayName",
          company,
          "primaryEmail",
          "primaryPhone"
        FROM contacts
        WHERE
          "userId" = ${userId}
          AND (
            similarity("displayName", ${searchTerm}) > 0.3
            OR "displayName" ILIKE ${"%" + searchTerm + "%"}
            OR company ILIKE ${"%" + searchTerm + "%"}
          )
        ORDER BY similarity("displayName", ${searchTerm}) DESC
        LIMIT ${takeLimit}
      `);

      const rows = results.rows || results;
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

// Simple intent detection and response (without external AI API)
// In production, you would integrate with Google AI, OpenAI, etc.
async function processMessage(userId: string, userMessage: string): Promise<string> {
  const lower = userMessage.toLowerCase();

  // Create conversation
  if (
    lower.includes("had a") ||
    lower.includes("talked to") ||
    lower.includes("called") ||
    lower.includes("met with") ||
    lower.includes("emailed")
  ) {
    // Extract names - simple pattern matching
    const withPattern = /(?:with|to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/;
    const match = userMessage.match(withPattern);
    if (match) {
      const name = match[1];
      const medium = lower.includes("called") || lower.includes("phone")
        ? "phone call"
        : lower.includes("email")
        ? "email"
        : lower.includes("met")
        ? "in-person meeting"
        : "other";

      const result = await createConversation(userId, name, medium, userMessage);
      if (result.type === "conversation_created") {
        return `✅ I've logged your ${result.medium?.toLowerCase().replace("_", " ")} with ${(result.participants as string[]).join(", ")}.`;
      } else {
        return `❌ ${result.message}`;
      }
    }
  }

  // Query conversations
  if (
    (lower.includes("conversations") || lower.includes("talked")) &&
    (lower.includes("show") || lower.includes("what") || lower.includes("list"))
  ) {
    const withPattern = /(?:with|about)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/;
    const match = userMessage.match(withPattern);
    const result = await queryConversations(userId, match?.[1], undefined, 5);

    if (result.type === "conversations_found" && (result.count as number) > 0) {
      const convs = result.conversations as any[];
      const list = convs
        .map(
          (c) =>
            `• ${c.medium.replace("_", " ")} with ${c.participants.join(", ")} on ${new Date(c.happenedAt).toLocaleDateString()}`
        )
        .join("\n");
      return `📋 Found ${result.count} conversation(s):\n\n${list}`;
    }
    return "No conversations found.";
  }

  // Create event
  if (
    lower.includes("schedule") ||
    lower.includes("create event") ||
    lower.includes("add event") ||
    lower.includes("meeting with")
  ) {
    const withPattern = /(?:with)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/;
    const nameMatch = userMessage.match(withPattern);
    const title = lower.includes("meeting") ? "Meeting" : "Event";

    const result = await createEvent(
      userId,
      title + (nameMatch ? ` with ${nameMatch[1]}` : ""),
      new Date().toISOString(),
      nameMatch?.[1]
    );

    if (result.type === "event_created") {
      return `✅ Created event: ${result.title}`;
    }
    return `❌ ${result.message}`;
  }

  // Query events
  if (
    (lower.includes("events") || lower.includes("schedule")) &&
    (lower.includes("show") || lower.includes("what") || lower.includes("list") || lower.includes("my"))
  ) {
    const result = await queryEvents(userId, undefined, 5);

    if (result.type === "events_found" && (result.count as number) > 0) {
      const evts = result.events as any[];
      const list = evts
        .map(
          (e) =>
            `• ${e.title} on ${new Date(e.startAt).toLocaleDateString()}${e.location ? ` at ${e.location}` : ""}`
        )
        .join("\n");
      return `📅 Found ${result.count} event(s):\n\n${list}`;
    }
    return "No upcoming events found.";
  }

  // Create contact
  if (lower.includes("add contact") || lower.includes("create contact") || lower.includes("new contact")) {
    const namePattern = /(?:named?|called?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/;
    const match = userMessage.match(namePattern);
    if (match) {
      const result = await createContact(userId, match[1]);
      return `✅ Created contact: ${result.displayName}`;
    }
    return "Please specify a name for the contact.";
  }

  // Get contact details
  if (
    (lower.includes("phone") || lower.includes("email") || lower.includes("details") || lower.includes("info")) &&
    lower.includes("for")
  ) {
    const forPattern = /(?:for|about)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/;
    const match = userMessage.match(forPattern);
    if (match) {
      const result = await getContactDetails(userId, match[1]);
      if (result.type === "contact_details") {
        const details = [];
        if (result.primaryPhone) details.push(`📞 ${result.primaryPhone}`);
        if (result.primaryEmail) details.push(`📧 ${result.primaryEmail}`);
        if (result.company) details.push(`🏢 ${result.company}`);
        if (result.jobTitle) details.push(`💼 ${result.jobTitle}`);
        if (result.location) details.push(`📍 ${result.location}`);

        return `👤 **${result.displayName}**\n\n${details.join("\n") || "No details available."}`;
      }
      return `❌ ${result.message}`;
    }
  }

  // Search contacts
  if (
    lower.includes("find") ||
    lower.includes("search") ||
    (lower.includes("contacts") && lower.includes("show"))
  ) {
    const searchPattern = /(?:find|search|for)\s+([A-Za-z]+)/;
    const match = userMessage.match(searchPattern);
    const result = await queryContacts(userId, match?.[1], 5);

    if (result.type === "contacts_found" && (result.count as number) > 0) {
      const ctcts = result.contacts as any[];
      const list = ctcts
        .map((c) => `• ${c.displayName}${c.company ? ` (${c.company})` : ""}`)
        .join("\n");
      return `👥 Found ${result.count} contact(s):\n\n${list}`;
    }
    return "No contacts found.";
  }

  // Default response
  return `I can help you with:
• **Log conversations**: "I called John yesterday about the project"
• **Show conversations**: "Show my conversations with Sarah"
• **Create events**: "Schedule a meeting with Mike tomorrow"
• **Show events**: "What are my upcoming events?"
• **Add contacts**: "Add a new contact named Alex Smith"
• **Find contacts**: "Find contacts named John"
• **Get contact info**: "What's the phone number for Sarah?"

What would you like to do?`;
}

// POST /api/assistant - Process chat message
app.post("/", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();

  const validation = chatSchema.safeParse(body);
  if (!validation.success) {
    return c.json({ error: validation.error.errors }, 400);
  }

  const { messages } = validation.data;

  // Get the last user message
  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");

  if (!lastUserMessage) {
    return c.json({ error: "No user message provided" }, 400);
  }

  try {
    const response = await processMessage(userId, lastUserMessage.content);

    return c.json({
      role: "assistant",
      content: response,
    });
  } catch (error) {
    console.error("Assistant error:", error);
    return c.json({ error: "Failed to process message" }, 500);
  }
});

export default app;
