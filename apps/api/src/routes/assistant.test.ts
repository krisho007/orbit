import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { generateText } from "ai";

describe("processMessageLLM", () => {
  const originalApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const originalDatabaseUrl = process.env.DATABASE_URL;
  let processMessageLLM: typeof import("./assistant").processMessageLLM;

  beforeEach(async () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key";
    process.env.DATABASE_URL ??= "postgres://postgres:postgres@localhost:5432/orbit_test";
    ({ processMessageLLM } = await import("./assistant"));
  });

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    } else {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = originalApiKey;
    }

    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  // ============================================
  // 1. CONTACTS
  // ============================================

  describe("Contacts", () => {
    it("creates a single contact and returns a contact card", async () => {
      const fakeGenerate = (async () => ({
        text: "Created contact John Doe.",
        toolResults: [
          {
            output: {
              type: "contact_created",
              id: "contact-1",
              displayName: "John Doe",
              primaryPhone: "+1 555 123 4567",
              primaryEmail: "john@example.com",
              company: "Acme Corp",
              jobTitle: "Engineer",
              location: "San Francisco",
            },
          },
        ],
      })) as unknown as typeof generateText;

      const response = await processMessageLLM(
        "user-1",
        [{ role: "user", content: "Create a contact for John Doe" }],
        fakeGenerate
      );

      expect(response.ui?.kind).toBe("created");
      if (!response.ui || response.ui.kind !== "created") {
        throw new Error("Expected created UI payload");
      }

      expect(response.ui.cards).toHaveLength(1);
      expect(response.ui.cards[0].kind).toBe("contact");
      if (response.ui.cards[0].kind !== "contact") {
        throw new Error("Expected contact card");
      }

      expect(response.ui.cards[0].contact.displayName).toBe("John Doe");
      expect(response.ui.cards[0].contact.primaryPhone).toBe("+1 555 123 4567");
      expect(response.ui.cards[0].contact.primaryEmail).toBe("john@example.com");
      expect(response.ui.cards[0].contact.company).toBe("Acme Corp");
      expect(response.ui.cards[0].contact.jobTitle).toBe("Engineer");
      expect(response.ui.cards[0].contact.location).toBe("San Francisco");
    });

    it("creates a contact with minimal fields (name only)", async () => {
      const fakeGenerate = (async () => ({
        text: "Created contact Jane.",
        toolResults: [
          {
            output: {
              type: "contact_created",
              id: "contact-2",
              displayName: "Jane",
            },
          },
        ],
      })) as unknown as typeof generateText;

      const response = await processMessageLLM(
        "user-1",
        [{ role: "user", content: "Create a contact named Jane" }],
        fakeGenerate
      );

      expect(response.ui?.kind).toBe("created");
      if (!response.ui || response.ui.kind !== "created") {
        throw new Error("Expected created UI payload");
      }

      expect(response.ui.cards).toHaveLength(1);
      if (response.ui.cards[0].kind !== "contact") {
        throw new Error("Expected contact card");
      }

      expect(response.ui.cards[0].contact.displayName).toBe("Jane");
      expect(response.ui.cards[0].contact.primaryPhone).toBeNull();
      expect(response.ui.cards[0].contact.primaryEmail).toBeNull();
      expect(response.ui.cards[0].contact.company).toBeNull();
      expect(response.ui.cards[0].contact.jobTitle).toBeNull();
      expect(response.ui.cards[0].contact.location).toBeNull();
    });

    it("searches contacts and returns a contacts list", async () => {
      const fakeGenerate = (async () => ({
        text: "Found 2 contacts.",
        toolResults: [
          {
            output: {
              type: "contacts_found",
              count: 2,
              contacts: [
                {
                  id: "contact-1",
                  displayName: "Alice Smith",
                  primaryPhone: "+1 555 111 1111",
                  primaryEmail: "alice@example.com",
                  company: "Tech Co",
                  jobTitle: "Developer",
                  location: "NYC",
                },
                {
                  id: "contact-2",
                  displayName: "Bob Johnson",
                  primaryPhone: null,
                  primaryEmail: "bob@example.com",
                  company: null,
                  jobTitle: null,
                  location: null,
                },
              ],
            },
          },
        ],
      })) as unknown as typeof generateText;

      const response = await processMessageLLM(
        "user-1",
        [{ role: "user", content: "Search for contacts named Smith" }],
        fakeGenerate
      );

      expect(response.ui?.kind).toBe("contacts");
      if (!response.ui || response.ui.kind !== "contacts") {
        throw new Error("Expected contacts UI payload");
      }

      expect(response.ui.count).toBe(2);
      expect(response.ui.contacts).toHaveLength(2);
      expect(response.ui.contacts[0].displayName).toBe("Alice Smith");
      expect(response.ui.contacts[1].displayName).toBe("Bob Johnson");
    });

    it("returns empty contacts list when no matches found", async () => {
      const fakeGenerate = (async () => ({
        text: "No contacts found.",
        toolResults: [
          {
            output: {
              type: "contacts_found",
              count: 0,
              contacts: [],
            },
          },
        ],
      })) as unknown as typeof generateText;

      const response = await processMessageLLM(
        "user-1",
        [{ role: "user", content: "Find contacts named Nonexistent" }],
        fakeGenerate
      );

      expect(response.ui?.kind).toBe("contacts");
      if (!response.ui || response.ui.kind !== "contacts") {
        throw new Error("Expected contacts UI payload");
      }

      expect(response.ui.count).toBe(0);
      expect(response.ui.contacts).toHaveLength(0);
      expect(response.text).toBe("No contacts found.");
    });

    it("gets contact details and returns a single contact card", async () => {
      const fakeGenerate = (async () => ({
        text: "Here are the contact details.",
        toolResults: [
          {
            output: {
              type: "contact_details",
              id: "contact-1",
              displayName: "Charlie Brown",
              primaryPhone: "+1 555 222 3333",
              primaryEmail: "charlie@example.com",
              company: "Peanuts Inc",
              jobTitle: "Manager",
              location: "Boston",
            },
          },
        ],
      })) as unknown as typeof generateText;

      const response = await processMessageLLM(
        "user-1",
        [{ role: "user", content: "Get details for Charlie Brown" }],
        fakeGenerate
      );

      expect(response.ui?.kind).toBe("contact");
      if (!response.ui || response.ui.kind !== "contact") {
        throw new Error("Expected contact UI payload");
      }

      expect(response.ui.contact.displayName).toBe("Charlie Brown");
      expect(response.ui.contact.primaryPhone).toBe("+1 555 222 3333");
      expect(response.text).toBe("Here are the contact details.");
    });
  });

  // ============================================
  // 2. CONVERSATIONS
  // ============================================

  describe("Conversations", () => {
    it("creates a conversation and returns a conversation card", async () => {
      const fakeGenerate = (async () => ({
        text: "Logged conversation.",
        toolResults: [
          {
            output: {
              type: "conversation_created",
              id: "conversation-1",
              medium: "PHONE_CALL",
              happenedAt: "2026-02-09T10:00:00.000Z",
              content: "Discussed project timeline",
              participants: ["Alice", "Bob"],
            },
          },
        ],
      })) as unknown as typeof generateText;

      const response = await processMessageLLM(
        "user-1",
        [{ role: "user", content: "Log a phone call with Alice and Bob" }],
        fakeGenerate
      );

      expect(response.ui?.kind).toBe("created");
      if (!response.ui || response.ui.kind !== "created") {
        throw new Error("Expected created UI payload");
      }

      expect(response.ui.cards).toHaveLength(1);
      expect(response.ui.cards[0].kind).toBe("conversation");
      if (response.ui.cards[0].kind !== "conversation") {
        throw new Error("Expected conversation card");
      }

      expect(response.ui.cards[0].conversation.medium).toBe("PHONE_CALL");
      expect(response.ui.cards[0].conversation.happenedAt).toBe("2026-02-09T10:00:00.000Z");
      expect(response.ui.cards[0].conversation.content).toBe("Discussed project timeline");
      expect(response.ui.cards[0].conversation.participants).toEqual(["Alice", "Bob"]);
    });

    it("searches conversations and returns a conversations list", async () => {
      const fakeGenerate = (async () => ({
        text: "Found 2 conversations.",
        toolResults: [
          {
            output: {
              type: "conversations_found",
              count: 2,
              conversations: [
                {
                  id: "conversation-1",
                  medium: "EMAIL",
                  happenedAt: "2026-02-08T14:00:00.000Z",
                  content: "Follow-up email",
                  participants: ["Alice"],
                },
                {
                  id: "conversation-2",
                  medium: "WHATSAPP",
                  happenedAt: "2026-02-07T09:00:00.000Z",
                  content: null,
                  participants: ["Bob", "Charlie"],
                },
              ],
            },
          },
        ],
      })) as unknown as typeof generateText;

      const response = await processMessageLLM(
        "user-1",
        [{ role: "user", content: "Show recent conversations" }],
        fakeGenerate
      );

      expect(response.ui?.kind).toBe("conversations");
      if (!response.ui || response.ui.kind !== "conversations") {
        throw new Error("Expected conversations UI payload");
      }

      expect(response.ui.count).toBe(2);
      expect(response.ui.conversations).toHaveLength(2);
      expect(response.ui.conversations[0].medium).toBe("EMAIL");
      expect(response.ui.conversations[1].medium).toBe("WHATSAPP");
    });

    it("creates a conversation with followUp and returns card", async () => {
      const fakeGenerate = (async () => ({
        text: "Logged conversation with follow-up.",
        toolResults: [
          {
            output: {
              type: "conversation_created",
              id: "conversation-3",
              medium: "IN_PERSON_MEETING",
              happenedAt: "2026-02-09T15:00:00.000Z",
              content: "Discussed Q1 goals",
              participants: ["David"],
            },
          },
        ],
      })) as unknown as typeof generateText;

      const response = await processMessageLLM(
        "user-1",
        [{ role: "user", content: "Log meeting with David, follow up next week" }],
        fakeGenerate
      );

      expect(response.ui?.kind).toBe("created");
      if (!response.ui || response.ui.kind !== "created") {
        throw new Error("Expected created UI payload");
      }

      expect(response.ui.cards).toHaveLength(1);
      if (response.ui.cards[0].kind !== "conversation") {
        throw new Error("Expected conversation card");
      }

      expect(response.ui.cards[0].conversation.content).toBe("Discussed Q1 goals");
    });

    it("returns empty conversations list when no matches found", async () => {
      const fakeGenerate = (async () => ({
        text: "No conversations found.",
        toolResults: [
          {
            output: {
              type: "conversations_found",
              count: 0,
              conversations: [],
            },
          },
        ],
      })) as unknown as typeof generateText;

      const response = await processMessageLLM(
        "user-1",
        [{ role: "user", content: "Find conversations with Nonexistent" }],
        fakeGenerate
      );

      expect(response.ui?.kind).toBe("conversations");
      if (!response.ui || response.ui.kind !== "conversations") {
        throw new Error("Expected conversations UI payload");
      }

      expect(response.ui.count).toBe(0);
      expect(response.ui.conversations).toHaveLength(0);
      expect(response.text).toBe("No conversations found.");
    });
  });

  // ============================================
  // 3. EVENTS
  // ============================================

  describe("Events", () => {
    it("creates an event and returns an event card", async () => {
      const fakeGenerate = (async () => ({
        text: "Created event.",
        toolResults: [
          {
            output: {
              type: "event_created",
              id: "event-1",
              title: "Team Meeting",
              startAt: "2026-02-15T10:00:00.000Z",
              location: "Conference Room A",
              participants: ["Alice", "Bob", "Charlie"],
            },
          },
        ],
      })) as unknown as typeof generateText;

      const response = await processMessageLLM(
        "user-1",
        [{ role: "user", content: "Create a team meeting event" }],
        fakeGenerate
      );

      expect(response.ui?.kind).toBe("created");
      if (!response.ui || response.ui.kind !== "created") {
        throw new Error("Expected created UI payload");
      }

      expect(response.ui.cards).toHaveLength(1);
      expect(response.ui.cards[0].kind).toBe("event");
      if (response.ui.cards[0].kind !== "event") {
        throw new Error("Expected event card");
      }

      expect(response.ui.cards[0].event.title).toBe("Team Meeting");
      expect(response.ui.cards[0].event.startAt).toBe("2026-02-15T10:00:00.000Z");
      expect(response.ui.cards[0].event.location).toBe("Conference Room A");
      expect(response.ui.cards[0].event.participants).toEqual(["Alice", "Bob", "Charlie"]);
    });

    it("searches events and returns an events list", async () => {
      const fakeGenerate = (async () => ({
        text: "Found 2 events.",
        toolResults: [
          {
            output: {
              type: "events_found",
              count: 2,
              events: [
                {
                  id: "event-1",
                  title: "Birthday Party",
                  startAt: "2026-03-01T18:00:00.000Z",
                  location: "Home",
                  participants: ["Family"],
                },
                {
                  id: "event-2",
                  title: "Conference",
                  startAt: "2026-04-10T09:00:00.000Z",
                  location: null,
                  participants: [],
                },
              ],
            },
          },
        ],
      })) as unknown as typeof generateText;

      const response = await processMessageLLM(
        "user-1",
        [{ role: "user", content: "Show upcoming events" }],
        fakeGenerate
      );

      expect(response.ui?.kind).toBe("events");
      if (!response.ui || response.ui.kind !== "events") {
        throw new Error("Expected events UI payload");
      }

      expect(response.ui.count).toBe(2);
      expect(response.ui.events).toHaveLength(2);
      expect(response.ui.events[0].title).toBe("Birthday Party");
      expect(response.ui.events[1].title).toBe("Conference");
    });

    it("returns empty events list when no matches found", async () => {
      const fakeGenerate = (async () => ({
        text: "No events found.",
        toolResults: [
          {
            output: {
              type: "events_found",
              count: 0,
              events: [],
            },
          },
        ],
      })) as unknown as typeof generateText;

      const response = await processMessageLLM(
        "user-1",
        [{ role: "user", content: "Find events with Nonexistent" }],
        fakeGenerate
      );

      expect(response.ui?.kind).toBe("events");
      if (!response.ui || response.ui.kind !== "events") {
        throw new Error("Expected events UI payload");
      }

      expect(response.ui.count).toBe(0);
      expect(response.ui.events).toHaveLength(0);
      expect(response.text).toBe("No events found.");
    });
  });

  // ============================================
  // 4. REMINDERS
  // ============================================

  describe("Reminders", () => {
    it("creates a reminder and returns a reminder card", async () => {
      const fakeGenerate = (async () => ({
        text: "Created reminder.",
        toolResults: [
          {
            output: {
              type: "reminder_created",
              id: "reminder-1",
              title: "Follow up with Alice",
              dueAt: "2026-02-12T10:00:00.000Z",
              status: "OPEN",
              participants: ["Alice"],
            },
          },
        ],
      })) as unknown as typeof generateText;

      const response = await processMessageLLM(
        "user-1",
        [{ role: "user", content: "Remind me to follow up with Alice" }],
        fakeGenerate
      );

      expect(response.ui?.kind).toBe("created");
      if (!response.ui || response.ui.kind !== "created") {
        throw new Error("Expected created UI payload");
      }

      expect(response.ui.cards).toHaveLength(1);
      expect(response.ui.cards[0].kind).toBe("reminder");
      if (response.ui.cards[0].kind !== "reminder") {
        throw new Error("Expected reminder card");
      }

      expect(response.ui.cards[0].reminder.title).toBe("Follow up with Alice");
      expect(response.ui.cards[0].reminder.dueAt).toBe("2026-02-12T10:00:00.000Z");
      expect(response.ui.cards[0].reminder.status).toBe("OPEN");
      expect(response.ui.cards[0].reminder.participants).toEqual(["Alice"]);
    });

    it("searches reminders and returns a reminders list", async () => {
      const fakeGenerate = (async () => ({
        text: "Found 2 reminders.",
        toolResults: [
          {
            output: {
              type: "reminders_found",
              count: 2,
              reminders: [
                {
                  id: "reminder-1",
                  title: "Call Bob",
                  dueAt: "2026-02-10T14:00:00.000Z",
                  status: "OPEN",
                  participants: ["Bob"],
                },
                {
                  id: "reminder-2",
                  title: "Send email",
                  dueAt: "2026-02-11T09:00:00.000Z",
                  status: "DONE",
                  participants: [],
                },
              ],
            },
          },
        ],
      })) as unknown as typeof generateText;

      const response = await processMessageLLM(
        "user-1",
        [{ role: "user", content: "Show my reminders" }],
        fakeGenerate
      );

      expect(response.ui?.kind).toBe("reminders");
      if (!response.ui || response.ui.kind !== "reminders") {
        throw new Error("Expected reminders UI payload");
      }

      expect(response.ui.count).toBe(2);
      expect(response.ui.reminders).toHaveLength(2);
      expect(response.ui.reminders[0].title).toBe("Call Bob");
      expect(response.ui.reminders[1].status).toBe("DONE");
    });

    it("gets a single reminder and returns reminder details", async () => {
      const fakeGenerate = (async () => ({
        text: "Here's the reminder.",
        toolResults: [
          {
            output: {
              type: "reminder_details",
              id: "reminder-1",
              title: "Review document",
              dueAt: "2026-02-13T16:00:00.000Z",
              status: "OPEN",
              participants: [
                { contact: { displayName: "Charlie" } },
              ],
            },
          },
        ],
      })) as unknown as typeof generateText;

      const response = await processMessageLLM(
        "user-1",
        [{ role: "user", content: "Get reminder details" }],
        fakeGenerate
      );

      expect(response.ui?.kind).toBe("reminders");
      if (!response.ui || response.ui.kind !== "reminders") {
        throw new Error("Expected reminders UI payload");
      }

      expect(response.ui.count).toBe(1);
      expect(response.ui.reminders).toHaveLength(1);
      expect(response.ui.reminders[0].title).toBe("Review document");
      expect(response.ui.reminders[0].participants).toEqual(["Charlie"]);
    });

    it("returns empty reminders list when no matches found", async () => {
      const fakeGenerate = (async () => ({
        text: "No reminders found.",
        toolResults: [
          {
            output: {
              type: "reminders_found",
              count: 0,
              reminders: [],
            },
          },
        ],
      })) as unknown as typeof generateText;

      const response = await processMessageLLM(
        "user-1",
        [{ role: "user", content: "Find reminders for Nonexistent" }],
        fakeGenerate
      );

      expect(response.ui?.kind).toBe("reminders");
      if (!response.ui || response.ui.kind !== "reminders") {
        throw new Error("Expected reminders UI payload");
      }

      expect(response.ui.count).toBe(0);
      expect(response.ui.reminders).toHaveLength(0);
      expect(response.text).toBe("No reminders found.");
    });
  });

  // ============================================
  // 5. MIXED / MULTI-ENTITY CREATION
  // ============================================

  describe("Mixed Creation", () => {
    it("returns created cards for mixed created entities in one assistant response", async () => {
      const fakeGenerate = (async () => ({
        text: "Logged everything.",
        toolResults: [
          {
            output: {
              type: "contact_created",
              id: "contact-1",
              displayName: "Keshav Anand",
              primaryPhone: "+1 555 111 2222",
            },
          },
          {
            output: {
              type: "conversation_created",
              id: "conversation-1",
              medium: "IN_PERSON_MEETING",
              happenedAt: "2026-02-06T10:00:00.000Z",
              content: "Came home with family.",
              participants: ["Keshav Anand", "Arpana"],
            },
          },
          {
            output: {
              type: "event_created",
              id: "event-1",
              title: "Keshav and family visit",
              startAt: "2026-02-06T10:00:00.000Z",
              location: "Home",
              participants: ["Keshav Anand", "Arpana"],
            },
          },
        ],
      })) as unknown as typeof generateText;

      const response = await processMessageLLM(
        "user-1",
        [{ role: "user", content: "Log this event and conversation." }],
        fakeGenerate
      );

      expect(response.text).toBe("Logged everything.");
      expect(response.ui?.kind).toBe("created");

      if (!response.ui || response.ui.kind !== "created") {
        throw new Error("Expected created UI payload");
      }

      const kinds = response.ui.cards.map((card) => card.kind);
      expect(kinds).toEqual(["contact", "conversation", "event"]);
      expect(response.ui.cards).toHaveLength(3);
    });

    it("deduplicates created cards with same id", async () => {
      const fakeGenerate = (async () => ({
        text: "Created contact.",
        toolResults: [
          {
            output: {
              type: "contact_created",
              id: "contact-1",
              displayName: "Duplicate Test",
            },
          },
          {
            output: {
              type: "contact_created",
              id: "contact-1",
              displayName: "Duplicate Test",
            },
          },
        ],
      })) as unknown as typeof generateText;

      const response = await processMessageLLM(
        "user-1",
        [{ role: "user", content: "Create contact" }],
        fakeGenerate
      );

      expect(response.ui?.kind).toBe("created");
      if (!response.ui || response.ui.kind !== "created") {
        throw new Error("Expected created UI payload");
      }

      expect(response.ui.cards).toHaveLength(1);
    });
  });

  // ============================================
  // 6. DELETE SAFETY (show card first, then confirm)
  // ============================================

  describe("Delete Safety", () => {
    it("delete contact: shows contact card first (no deletion)", async () => {
      const fakeGenerate = (async () => ({
        text: "Found this contact. Should I delete it?",
        toolResults: [
          {
            output: {
              type: "contacts_found",
              count: 1,
              contacts: [
                {
                  id: "contact-1",
                  displayName: "John Doe",
                  primaryPhone: "+1 555 123 4567",
                  primaryEmail: "john@example.com",
                  company: null,
                  jobTitle: null,
                  location: null,
                },
              ],
            },
          },
        ],
      })) as unknown as typeof generateText;

      const response = await processMessageLLM(
        "user-1",
        [{ role: "user", content: "Delete John Doe" }],
        fakeGenerate
      );

      expect(response.ui?.kind).toBe("contacts");
      if (!response.ui || response.ui.kind !== "contacts") {
        throw new Error("Expected contacts UI payload");
      }

      expect(response.ui.contacts).toHaveLength(1);
      expect(response.ui.contacts[0].displayName).toBe("John Doe");
      // The UI shows the card, which is the important part for delete safety
      expect(response.text).toBeTruthy();
    });

    it("delete contact: confirms deletion after showing card", async () => {
      const fakeGenerate = (async () => ({
        text: "Deleted contact John Doe.",
        toolResults: [
          {
            output: {
              type: "contact_deleted",
              id: "contact-1",
            },
          },
        ],
      })) as unknown as typeof generateText;

      const response = await processMessageLLM(
        "user-1",
        [
          { role: "user", content: "Delete John Doe" },
          { role: "assistant", content: "Found John Doe. Should I delete?" },
          { role: "user", content: "Yes, delete it" },
        ],
        fakeGenerate
      );

      expect(response.text).toContain("Deleted");
      expect(response.ui).toBeNull();
    });

    it("delete conversation: shows conversation card first", async () => {
      const fakeGenerate = (async () => ({
        text: "Found this conversation. Should I delete it?",
        toolResults: [
          {
            output: {
              type: "conversations_found",
              count: 1,
              conversations: [
                {
                  id: "conversation-1",
                  medium: "PHONE_CALL",
                  happenedAt: "2026-02-08T10:00:00.000Z",
                  content: "Discussed project",
                  participants: ["Alice"],
                },
              ],
            },
          },
        ],
      })) as unknown as typeof generateText;

      const response = await processMessageLLM(
        "user-1",
        [{ role: "user", content: "Delete that conversation with Alice" }],
        fakeGenerate
      );

      expect(response.ui?.kind).toBe("conversations");
      if (!response.ui || response.ui.kind !== "conversations") {
        throw new Error("Expected conversations UI payload");
      }

      expect(response.ui.conversations).toHaveLength(1);
      // The UI shows the card, which is the important part for delete safety
      expect(response.text).toBeTruthy();
    });

    it("delete conversation: confirms deletion after showing", async () => {
      const fakeGenerate = (async () => ({
        text: "Deleted the conversation.",
        toolResults: [
          {
            output: {
              type: "conversation_deleted",
              id: "conversation-1",
            },
          },
        ],
      })) as unknown as typeof generateText;

      const response = await processMessageLLM(
        "user-1",
        [
          { role: "user", content: "Delete conversation" },
          { role: "assistant", content: "Should I delete?" },
          { role: "user", content: "Yes" },
        ],
        fakeGenerate
      );

      expect(response.text).toContain("Deleted");
      expect(response.ui).toBeNull();
    });

    it("delete event: shows event card first", async () => {
      const fakeGenerate = (async () => ({
        text: "Found this event. Should I delete it?",
        toolResults: [
          {
            output: {
              type: "events_found",
              count: 1,
              events: [
                {
                  id: "event-1",
                  title: "Team Meeting",
                  startAt: "2026-02-15T10:00:00.000Z",
                  location: "Office",
                  participants: ["Team"],
                },
              ],
            },
          },
        ],
      })) as unknown as typeof generateText;

      const response = await processMessageLLM(
        "user-1",
        [{ role: "user", content: "Delete Team Meeting event" }],
        fakeGenerate
      );

      expect(response.ui?.kind).toBe("events");
      if (!response.ui || response.ui.kind !== "events") {
        throw new Error("Expected events UI payload");
      }

      expect(response.ui.events).toHaveLength(1);
      expect(response.ui.events[0].title).toBe("Team Meeting");
      // The UI shows the card, which is the important part for delete safety
      expect(response.text).toBeTruthy();
    });

    it("delete event: confirms deletion after showing", async () => {
      const fakeGenerate = (async () => ({
        text: "Deleted the event.",
        toolResults: [
          {
            output: {
              type: "event_deleted",
              id: "event-1",
            },
          },
        ],
      })) as unknown as typeof generateText;

      const response = await processMessageLLM(
        "user-1",
        [
          { role: "user", content: "Delete event" },
          { role: "assistant", content: "Should I delete?" },
          { role: "user", content: "Confirm" },
        ],
        fakeGenerate
      );

      expect(response.text).toContain("Deleted");
      expect(response.ui).toBeNull();
    });

    it("delete reminder: shows reminder card first", async () => {
      const fakeGenerate = (async () => ({
        text: "Found this reminder. Should I delete it?",
        toolResults: [
          {
            output: {
              type: "reminders_found",
              count: 1,
              reminders: [
                {
                  id: "reminder-1",
                  title: "Follow up",
                  dueAt: "2026-02-12T10:00:00.000Z",
                  status: "OPEN",
                  participants: ["Alice"],
                },
              ],
            },
          },
        ],
      })) as unknown as typeof generateText;

      const response = await processMessageLLM(
        "user-1",
        [{ role: "user", content: "Delete that reminder" }],
        fakeGenerate
      );

      expect(response.ui?.kind).toBe("reminders");
      if (!response.ui || response.ui.kind !== "reminders") {
        throw new Error("Expected reminders UI payload");
      }

      expect(response.ui.reminders).toHaveLength(1);
      // The UI shows the card, which is the important part for delete safety
      expect(response.text).toBeTruthy();
    });

    it("delete reminder: confirms deletion after showing", async () => {
      const fakeGenerate = (async () => ({
        text: "Deleted the reminder.",
        toolResults: [
          {
            output: {
              type: "reminder_deleted",
              id: "reminder-1",
            },
          },
        ],
      })) as unknown as typeof generateText;

      const response = await processMessageLLM(
        "user-1",
        [
          { role: "user", content: "Delete reminder" },
          { role: "assistant", content: "Should I delete?" },
          { role: "user", content: "Go ahead" },
        ],
        fakeGenerate
      );

      expect(response.text).toContain("Deleted");
      expect(response.ui).toBeNull();
    });
  });

  // ============================================
  // 7. ERROR / EDGE CASES
  // ============================================

  describe("Error and Edge Cases", () => {
    it("returns error text when API key is not set", async () => {
      delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      ({ processMessageLLM } = await import("./assistant"));

      const response = await processMessageLLM(
        "user-1",
        [{ role: "user", content: "Create a contact" }]
      );

      expect(response.text).toContain("Assistant is not configured");
      expect(response.ui).toBeNull();
    });

    it("handles tool error result gracefully", async () => {
      const fakeGenerate = (async () => ({
        text: "Could not find that contact.",
        toolResults: [
          {
            output: {
              type: "error",
              message: "Contact not found",
            },
          },
        ],
      })) as unknown as typeof generateText;

      const response = await processMessageLLM(
        "user-1",
        [{ role: "user", content: "Get details for Nonexistent" }],
        fakeGenerate
      );

      expect(response.text).toContain("Could not find");
      expect(response.ui).toBeNull();
    });

    it("handles empty tool results (no tools called)", async () => {
      const fakeGenerate = (async () => ({
        text: "I can help you with that.",
        toolResults: [],
      })) as unknown as typeof generateText;

      const response = await processMessageLLM(
        "user-1",
        [{ role: "user", content: "Hello" }],
        fakeGenerate
      );

      expect(response.text).toBe("I can help you with that.");
      expect(response.ui).toBeNull();
    });

    it("does not claim contact creation when create_contact was called without success", async () => {
      const fakeGenerate = (async () => ({
        text: "The contact was created successfully.",
        toolResults: [],
        steps: [
          {
            toolCalls: [
              {
                toolName: "create_contact",
                toolCallId: "tc-1",
                input: {},
                invalid: true,
                error: new Error("displayName is required"),
              },
            ],
            toolResults: [],
          },
        ],
      })) as unknown as typeof generateText;

      const response = await processMessageLLM(
        "user-1",
        [{ role: "user", content: "Create contact with number 9999999999" }],
        fakeGenerate
      );

      expect(response.text).toContain("contact name");
      expect(response.ui).toBeNull();
    });

    it("returns explicit failure when create_contact produced an error result", async () => {
      const fakeGenerate = (async () => ({
        text: "The contact has been created.",
        toolResults: [
          {
            output: {
              type: "error",
              message: "Failed to create contact",
            },
          },
        ],
        steps: [
          {
            toolCalls: [
              {
                toolName: "create_contact",
                toolCallId: "tc-2",
                input: { displayName: "Usha Medicals" },
                invalid: false,
              },
            ],
            toolResults: [
              {
                output: {
                  type: "error",
                  message: "Failed to create contact",
                },
              },
            ],
          },
        ],
      })) as unknown as typeof generateText;

      const response = await processMessageLLM(
        "user-1",
        [{ role: "user", content: "Add contact Usha Medicals" }],
        fakeGenerate
      );

      expect(response.text).toContain("couldn't create");
      expect(response.text).toContain("Failed to create contact");
      expect(response.ui).toBeNull();
    });

    it("returns selection UI for ambiguous contact context", async () => {
      const fakeGenerate = (async () => ({
        text: "Please choose the correct contact.",
        toolResults: [
          {
            output: {
              type: "contact_ambiguous",
              message: "Multiple contacts match Sam. Please pick one.",
              candidates: [
                { id: "contact-1", displayName: "Sam Lee" },
                { id: "contact-2", displayName: "Sam Levin" },
              ],
            },
          },
        ],
      })) as unknown as typeof generateText;

      const response = await processMessageLLM(
        "user-1",
        [{ role: "user", content: "Create reminder for Sam" }],
        fakeGenerate
      );

      expect(response.ui?.kind).toBe("selection");
      if (!response.ui || response.ui.kind !== "selection") {
        throw new Error("Expected selection UI payload");
      }

      expect(response.ui.options).toHaveLength(2);
      expect(response.ui.options[0].entityKind).toBe("contact");
      expect(response.ui.options[0].selectMessage).toContain("contact ID");
    });

    it("returns selection UI for ambiguous relationship type context", async () => {
      const fakeGenerate = (async () => ({
        text: "Please choose the relationship type.",
        toolResults: [
          {
            output: {
              type: "relationship_type_ambiguous",
              message: "Multiple relationship types match sibling. Please pick one.",
              candidates: [
                { id: "rt-1", name: "Sibling" },
                { id: "rt-2", name: "Step Sibling" },
              ],
            },
          },
        ],
      })) as unknown as typeof generateText;

      const response = await processMessageLLM(
        "user-1",
        [{ role: "user", content: "Rahul is my sibling" }],
        fakeGenerate
      );

      expect(response.ui?.kind).toBe("selection");
      if (!response.ui || response.ui.kind !== "selection") {
        throw new Error("Expected selection UI payload");
      }

      expect(response.ui.options).toHaveLength(2);
      expect(response.ui.options[0].entityKind).toBe("relationship_type");
      expect(response.ui.options[0].selectMessage).toContain("relationship type ID");
    });
  });

  // ============================================
  // 8. GUARDRAIL UNIT TESTS
  // ============================================

  describe("isExplicitUserConfirmation", () => {
    let isExplicitUserConfirmation: typeof import("./assistant").isExplicitUserConfirmation;

    beforeEach(async () => {
      ({ isExplicitUserConfirmation } = await import("./assistant"));
    });

    it("accepts exact confirmation tokens", () => {
      const positiveTokens = [
        "yes", "y", "yes please", "go ahead", "please go ahead",
        "proceed", "do it", "confirm", "confirmed", "looks good",
        "sounds good", "sure", "ok", "okay", "yep", "yup",
        "absolutely", "definitely",
      ];
      for (const token of positiveTokens) {
        expect(isExplicitUserConfirmation(token)).toBe(true);
      }
    });

    it("is case-insensitive", () => {
      expect(isExplicitUserConfirmation("Yes")).toBe(true);
      expect(isExplicitUserConfirmation("YES")).toBe(true);
      expect(isExplicitUserConfirmation("Go Ahead")).toBe(true);
      expect(isExplicitUserConfirmation("CONFIRM")).toBe(true);
    });

    it("trims whitespace", () => {
      expect(isExplicitUserConfirmation("  yes  ")).toBe(true);
      expect(isExplicitUserConfirmation("\tyes\n")).toBe(true);
    });

    it("rejects empty or whitespace-only input", () => {
      expect(isExplicitUserConfirmation("")).toBe(false);
      expect(isExplicitUserConfirmation("   ")).toBe(false);
    });

    it("does NOT match 'yesterday' (substring false positive)", () => {
      expect(isExplicitUserConfirmation("yesterday")).toBe(false);
    });

    it("does NOT match sentences containing confirmation words", () => {
      expect(isExplicitUserConfirmation("yes but change the date")).toBe(false);
      expect(isExplicitUserConfirmation("that sounds good to me but let me check")).toBe(false);
      expect(isExplicitUserConfirmation("go ahead and also add Bob")).toBe(false);
      expect(isExplicitUserConfirmation("sure thing")).toBe(false);
    });

    it("strips trailing punctuation (.!?)", () => {
      expect(isExplicitUserConfirmation("Sounds good.")).toBe(true);
      expect(isExplicitUserConfirmation("Yes!")).toBe(true);
      expect(isExplicitUserConfirmation("Sure.")).toBe(true);
      expect(isExplicitUserConfirmation("Go ahead!")).toBe(true);
      expect(isExplicitUserConfirmation("Ok.")).toBe(true);
      expect(isExplicitUserConfirmation("Confirmed!")).toBe(true);
      expect(isExplicitUserConfirmation("yes...")).toBe(true);
      expect(isExplicitUserConfirmation("yes?!")).toBe(true);
    });

    it("rejects arbitrary text", () => {
      expect(isExplicitUserConfirmation("create a contact")).toBe(false);
      expect(isExplicitUserConfirmation("no")).toBe(false);
      expect(isExplicitUserConfirmation("maybe")).toBe(false);
      expect(isExplicitUserConfirmation("cancel")).toBe(false);
    });
  });

  // ============================================
  // 9. INTENT PARSING UNIT TESTS
  // ============================================

  describe("parseIntentFromText", () => {
    let parseIntentFromText: typeof import("./assistant").parseIntentFromText;

    beforeEach(async () => {
      ({ parseIntentFromText } = await import("./assistant"));
    });

    it("parses JSON object with intent field", () => {
      expect(parseIntentFromText('{"intent": "create_contact"}')).toBe("create_contact");
      expect(parseIntentFromText('{"intent": "search_conversation"}')).toBe("search_conversation");
      expect(parseIntentFromText('{"intent": "delete_entity"}')).toBe("delete_entity");
    });

    it("parses JSON wrapped in code fences", () => {
      expect(parseIntentFromText('```json\n{"intent": "create_event"}\n```')).toBe("create_event");
      expect(parseIntentFromText('```\n{"intent": "edit_contact"}\n```')).toBe("edit_contact");
    });

    it("parses bare intent string", () => {
      expect(parseIntentFromText("create_contact")).toBe("create_contact");
      expect(parseIntentFromText("search_reminder")).toBe("search_reminder");
    });

    it("strips quotes from bare intent string", () => {
      expect(parseIntentFromText('"create_contact"')).toBe("create_contact");
      expect(parseIntentFromText("'edit_event'")).toBe("edit_event");
      expect(parseIntentFromText("`search_contact`")).toBe("search_contact");
    });

    it("returns 'unknown' for empty input", () => {
      expect(parseIntentFromText("")).toBe("unknown");
      expect(parseIntentFromText("   ")).toBe("unknown");
    });

    it("returns 'unknown' for invalid intent values", () => {
      expect(parseIntentFromText('{"intent": "not_a_real_intent"}')).toBe("unknown");
      expect(parseIntentFromText("gibberish")).toBe("unknown");
      expect(parseIntentFromText("hello world")).toBe("unknown");
    });

    it("returns 'unknown' for malformed JSON", () => {
      expect(parseIntentFromText("{malformed")).toBe("unknown");
      expect(parseIntentFromText('{"intent": 42}')).toBe("unknown");
    });
  });

  // ============================================
  // 9b. MULTI-INTENT PARSING UNIT TESTS
  // ============================================

  describe("parseIntentsFromText", () => {
    let parseIntentsFromText: typeof import("./assistant").parseIntentsFromText;

    beforeEach(async () => {
      ({ parseIntentsFromText } = await import("./assistant"));
    });

    it("parses JSON array format", () => {
      const result = parseIntentsFromText('{"intents":["create_event","create_conversation"]}');
      expect(result).toEqual(["create_event", "create_conversation"]);
    });

    it("falls back to old single-intent format", () => {
      const result = parseIntentsFromText('{"intent":"create_contact"}');
      expect(result).toEqual(["create_contact"]);
    });

    it("deduplicates repeated intents", () => {
      const result = parseIntentsFromText('{"intents":["create_event","create_event","edit_contact"]}');
      expect(result).toEqual(["create_event", "edit_contact"]);
    });

    it("filters invalid intents from array", () => {
      const result = parseIntentsFromText('{"intents":["create_event","not_real","edit_contact"]}');
      expect(result).toEqual(["create_event", "edit_contact"]);
    });

    it('returns ["unknown"] for empty array', () => {
      const result = parseIntentsFromText('{"intents":[]}');
      expect(result).toEqual(["unknown"]);
    });

    it('returns ["unknown"] for all-invalid array', () => {
      const result = parseIntentsFromText('{"intents":["fake1","fake2"]}');
      expect(result).toEqual(["unknown"]);
    });

    it("handles markdown code fences", () => {
      const result = parseIntentsFromText('```json\n{"intents":["create_event","edit_contact"]}\n```');
      expect(result).toEqual(["create_event", "edit_contact"]);
    });

    it("bare string fallback returns single-element array", () => {
      const result = parseIntentsFromText("create_contact");
      expect(result).toEqual(["create_contact"]);
    });

    it('returns ["unknown"] for empty input', () => {
      expect(parseIntentsFromText("")).toEqual(["unknown"]);
      expect(parseIntentsFromText("   ")).toEqual(["unknown"]);
    });

    it('returns ["unknown"] for gibberish', () => {
      expect(parseIntentsFromText("hello world")).toEqual(["unknown"]);
    });
  });

  // ============================================
  // 9c. UNION TOOL SETS UNIT TESTS
  // ============================================

  describe("unionToolSets", () => {
    let unionToolSets: typeof import("./assistant").unionToolSets;
    let INTENT_TOOL_SETS: typeof import("./assistant").INTENT_TOOL_SETS;

    beforeEach(async () => {
      ({ unionToolSets, INTENT_TOOL_SETS } = await import("./assistant"));
    });

    it("single intent returns same tools as INTENT_TOOL_SETS[intent]", () => {
      const result = unionToolSets(["create_event"]);
      expect(result.sort()).toEqual([...INTENT_TOOL_SETS.create_event].sort());
    });

    it("two intents produce deduplicated union", () => {
      const result = unionToolSets(["create_event", "edit_contact"]);
      const expected = new Set([
        ...INTENT_TOOL_SETS.create_event,
        ...INTENT_TOOL_SETS.edit_contact,
      ]);
      expect(result.sort()).toEqual([...expected].sort());
    });

    it('["unknown"] returns INTENT_TOOL_SETS.unknown', () => {
      const result = unionToolSets(["unknown"]);
      expect(result.sort()).toEqual([...INTENT_TOOL_SETS.unknown].sort());
    });

    it("union does not contain duplicates", () => {
      const result = unionToolSets(["create_event", "create_conversation"]);
      // Both share search_contacts_fuzzy — should only appear once
      const counts = result.reduce((acc, tool) => {
        acc[tool] = (acc[tool] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      for (const [tool, count] of Object.entries(counts)) {
        expect(count).toBe(1);
      }
    });
  });

  // ============================================
  // 9d. ANY INTENT REQUIRES CONFIRMATION TESTS
  // ============================================

  describe("anyIntentRequiresConfirmation", () => {
    let anyIntentRequiresConfirmation: typeof import("./assistant").anyIntentRequiresConfirmation;

    beforeEach(async () => {
      ({ anyIntentRequiresConfirmation } = await import("./assistant"));
    });

    it("returns true when any intent is mutating", () => {
      expect(anyIntentRequiresConfirmation(["search_contact", "create_event"])).toBe(true);
    });

    it("returns false when all intents are read-only", () => {
      expect(anyIntentRequiresConfirmation(["search_contact", "search_event"])).toBe(false);
    });

    it("returns false for unknown", () => {
      expect(anyIntentRequiresConfirmation(["unknown"])).toBe(false);
    });

    it("returns true for single mutating intent", () => {
      expect(anyIntentRequiresConfirmation(["create_contact"])).toBe(true);
    });
  });

  // ============================================
  // 10. ENUM ASSERTION UNIT TESTS
  // ============================================

  describe("Enum Assertions", () => {
    let assertValidMedium: typeof import("./assistant").assertValidMedium;
    let assertValidEventType: typeof import("./assistant").assertValidEventType;
    let assertValidReminderStatus: typeof import("./assistant").assertValidReminderStatus;
    let assertValidGender: typeof import("./assistant").assertValidGender;

    beforeEach(async () => {
      ({ assertValidMedium, assertValidEventType, assertValidReminderStatus, assertValidGender } =
        await import("./assistant"));
    });

    it("assertValidMedium accepts valid values", () => {
      expect(assertValidMedium("PHONE_CALL")).toBe("PHONE_CALL");
      expect(assertValidMedium("WHATSAPP")).toBe("WHATSAPP");
      expect(assertValidMedium("EMAIL")).toBe("EMAIL");
      expect(assertValidMedium("CHANCE_ENCOUNTER")).toBe("CHANCE_ENCOUNTER");
      expect(assertValidMedium("IN_PERSON_MEETING")).toBe("IN_PERSON_MEETING");
      expect(assertValidMedium("ONLINE_MEETING")).toBe("ONLINE_MEETING");
      expect(assertValidMedium("OTHER")).toBe("OTHER");
    });

    it("assertValidMedium rejects invalid values", () => {
      expect(() => assertValidMedium("INVALID")).toThrow("Invalid conversation medium");
      expect(() => assertValidMedium("phone_call")).toThrow("Invalid conversation medium");
      expect(() => assertValidMedium("")).toThrow("Invalid conversation medium");
    });

    it("assertValidEventType accepts valid values", () => {
      expect(assertValidEventType("MEETING")).toBe("MEETING");
      expect(assertValidEventType("CALL")).toBe("CALL");
      expect(assertValidEventType("BIRTHDAY")).toBe("BIRTHDAY");
      expect(assertValidEventType("ANNIVERSARY")).toBe("ANNIVERSARY");
    });

    it("assertValidEventType rejects invalid values", () => {
      expect(() => assertValidEventType("INVALID")).toThrow("Invalid event type");
      expect(() => assertValidEventType("meeting")).toThrow("Invalid event type");
    });

    it("assertValidReminderStatus accepts valid values", () => {
      expect(assertValidReminderStatus("OPEN")).toBe("OPEN");
      expect(assertValidReminderStatus("DONE")).toBe("DONE");
      expect(assertValidReminderStatus("CANCELED")).toBe("CANCELED");
    });

    it("assertValidReminderStatus rejects invalid values", () => {
      expect(() => assertValidReminderStatus("INVALID")).toThrow("Invalid reminder status");
      expect(() => assertValidReminderStatus("open")).toThrow("Invalid reminder status");
    });

    it("assertValidGender accepts valid values", () => {
      expect(assertValidGender("MALE")).toBe("MALE");
      expect(assertValidGender("FEMALE")).toBe("FEMALE");
    });

    it("assertValidGender rejects invalid values", () => {
      expect(() => assertValidGender("INVALID")).toThrow("Invalid gender");
      expect(() => assertValidGender("male")).toThrow("Invalid gender");
    });
  });

  // ============================================
  // 11. DELETE TOOL PROTECTION
  // ============================================

  describe("Delete Tool Protection", () => {
    let DELETE_TOOL_NAMES: typeof import("./assistant").DELETE_TOOL_NAMES;
    let MUTATING_TOOL_NAMES: typeof import("./assistant").MUTATING_TOOL_NAMES;

    beforeEach(async () => {
      ({ DELETE_TOOL_NAMES, MUTATING_TOOL_NAMES } = await import("./assistant"));
    });

    it("DELETE_TOOL_NAMES contains all delete tools", () => {
      const expected = [
        "delete_contact", "delete_contact_image", "delete_conversation",
        "delete_event", "delete_reminder", "delete_tag",
        "delete_relationship", "delete_relationship_type",
      ];
      for (const name of expected) {
        expect(DELETE_TOOL_NAMES.has(name)).toBe(true);
      }
      expect(DELETE_TOOL_NAMES.size).toBe(expected.length);
    });

    it("MUTATING_TOOL_NAMES does not include delete tools", () => {
      for (const deleteTool of DELETE_TOOL_NAMES) {
        expect(MUTATING_TOOL_NAMES.has(deleteTool)).toBe(false);
      }
    });
  });

  // ============================================
  // 12. INTENT TOOL SCOPING
  // ============================================

  describe("Intent Tool Scoping", () => {
    let INTENT_TOOL_SETS: typeof import("./assistant").INTENT_TOOL_SETS;
    let DELETE_TOOL_NAMES: typeof import("./assistant").DELETE_TOOL_NAMES;

    beforeEach(async () => {
      ({ INTENT_TOOL_SETS, DELETE_TOOL_NAMES } = await import("./assistant"));
    });

    it("every intent has a tool set", () => {
      const intents = [
        "create_contact", "search_contact", "edit_contact",
        "create_conversation", "create_conversation_with_contact",
        "search_conversation", "edit_conversation",
        "create_event", "create_event_with_conversation",
        "search_event", "edit_event",
        "create_reminder", "create_reminder_with_context",
        "search_reminder", "edit_reminder",
        "delete_entity", "unknown",
      ];
      for (const intent of intents) {
        expect(INTENT_TOOL_SETS[intent as keyof typeof INTENT_TOOL_SETS]).toBeDefined();
        expect(INTENT_TOOL_SETS[intent as keyof typeof INTENT_TOOL_SETS].length).toBeGreaterThan(0);
      }
    });

    it("no intent tool set includes delete tools", () => {
      for (const [intent, tools] of Object.entries(INTENT_TOOL_SETS)) {
        for (const tool of tools) {
          expect(DELETE_TOOL_NAMES.has(tool)).toBe(false);
        }
      }
    });

    it("mutating intents include request_confirmation", () => {
      const mutatingIntents = [
        "create_contact", "create_conversation", "create_conversation_with_contact",
        "create_event", "create_event_with_conversation",
        "create_reminder", "create_reminder_with_context",
        "edit_contact", "edit_conversation", "edit_event", "edit_reminder",
      ];
      for (const intent of mutatingIntents) {
        expect(INTENT_TOOL_SETS[intent as keyof typeof INTENT_TOOL_SETS]).toContain("request_confirmation");
      }
    });

    it("search intents do NOT include request_confirmation", () => {
      const searchIntents = [
        "search_contact", "search_conversation", "search_event", "search_reminder",
      ];
      for (const intent of searchIntents) {
        expect(INTENT_TOOL_SETS[intent as keyof typeof INTENT_TOOL_SETS]).not.toContain("request_confirmation");
      }
    });

    it("scoped tool sets are smaller than 20 tools each", () => {
      for (const [intent, tools] of Object.entries(INTENT_TOOL_SETS)) {
        expect(tools.length).toBeLessThan(20);
      }
    });
  });

  // ============================================
  // 13. CONFIRMATION UI CARD
  // ============================================

  describe("Confirmation UI", () => {
    it("returns confirmation UI when request_confirmation tool is called", async () => {
      const fakeGenerate = (async () => ({
        text: "I'd like to create a contact for Alice. Shall I proceed?",
        toolResults: [
          {
            output: {
              type: "confirmation_requested",
              action: "Create contact Alice with phone +1 555 000 1111",
              details: { displayName: "Alice", primaryPhone: "+1 555 000 1111" },
            },
          },
        ],
      })) as unknown as typeof generateText;

      const response = await processMessageLLM(
        "user-1",
        [{ role: "user", content: "Add a contact for Alice" }],
        fakeGenerate
      );

      expect(response.ui?.kind).toBe("confirmation");
      if (!response.ui || response.ui.kind !== "confirmation") {
        throw new Error("Expected confirmation UI payload");
      }

      expect(response.ui.action).toBe("Create contact Alice with phone +1 555 000 1111");
      expect(response.ui.details).toEqual({ displayName: "Alice", primaryPhone: "+1 555 000 1111" });
    });
  });
});
