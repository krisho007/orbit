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
  });
});
