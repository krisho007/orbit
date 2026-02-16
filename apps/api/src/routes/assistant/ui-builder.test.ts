import { describe, expect, it } from "bun:test";
import { summarizeUiText } from "./ui-builder";
import type { AssistantUi } from "./types";

describe("summarizeUiText", () => {
  // ── List-type UIs override LLM text ──────────────────────────────────

  describe("contacts (list)", () => {
    it("overrides LLM text when contacts are present", () => {
      const ui: AssistantUi = {
        kind: "contacts",
        count: 3,
        contacts: [
          { id: "1", displayName: "Alice", primaryPhone: null, primaryEmail: null, company: null, jobTitle: null, location: null },
          { id: "2", displayName: "Bob", primaryPhone: null, primaryEmail: null, company: null, jobTitle: null, location: null },
          { id: "3", displayName: "Charlie", primaryPhone: null, primaryEmail: null, company: null, jobTitle: null, location: null },
        ],
      };
      const llmText = "Here are the contacts:\n1. Alice\n2. Bob\n3. Charlie";
      expect(summarizeUiText(ui, llmText)).toBe("Showing 3 contacts.");
    });

    it("uses singular for single contact", () => {
      const ui: AssistantUi = {
        kind: "contacts",
        count: 1,
        contacts: [
          { id: "1", displayName: "Alice", primaryPhone: null, primaryEmail: null, company: null, jobTitle: null, location: null },
        ],
      };
      expect(summarizeUiText(ui, "Found Alice")).toBe("Showing 1 contact.");
    });

    it("shows partial count when paginated", () => {
      const ui: AssistantUi = {
        kind: "contacts",
        count: 25,
        contacts: [
          { id: "1", displayName: "Alice", primaryPhone: null, primaryEmail: null, company: null, jobTitle: null, location: null },
          { id: "2", displayName: "Bob", primaryPhone: null, primaryEmail: null, company: null, jobTitle: null, location: null },
        ],
      };
      expect(summarizeUiText(ui, "lots of contacts")).toBe("Showing 2 of 25 contacts.");
    });

    it("preserves LLM text for zero results", () => {
      const ui: AssistantUi = { kind: "contacts", count: 0, contacts: [] };
      const llmText = "No contacts found matching 'Xyzzy'. Want to create one?";
      expect(summarizeUiText(ui, llmText)).toBe(llmText);
    });

    it("falls back to generic text for zero results with no LLM text", () => {
      const ui: AssistantUi = { kind: "contacts", count: 0, contacts: [] };
      expect(summarizeUiText(ui, "")).toBe("No contacts found.");
    });
  });

  describe("conversations (list)", () => {
    it("overrides LLM text when conversations are present", () => {
      const ui: AssistantUi = {
        kind: "conversations",
        count: 2,
        conversations: [
          { id: "1", medium: "PHONE", happenedAt: "2024-01-01", content: null, participants: [] },
          { id: "2", medium: "EMAIL", happenedAt: "2024-01-02", content: null, participants: [] },
        ],
      };
      expect(summarizeUiText(ui, "Here are the conversations:\n1. Phone call\n2. Email"))
        .toBe("Showing 2 conversations.");
    });

    it("preserves LLM text for zero results", () => {
      const ui: AssistantUi = { kind: "conversations", count: 0, conversations: [] };
      const llmText = "No conversations found with that contact.";
      expect(summarizeUiText(ui, llmText)).toBe(llmText);
    });
  });

  describe("events (list)", () => {
    it("overrides LLM text when events are present", () => {
      const ui: AssistantUi = {
        kind: "events",
        count: 1,
        events: [{ id: "1", title: "Dinner", startAt: "2024-01-01", location: null, participants: [] }],
      };
      expect(summarizeUiText(ui, "Found 1 event:\n1. Dinner")).toBe("Showing 1 event.");
    });

    it("preserves LLM text for zero results", () => {
      const ui: AssistantUi = { kind: "events", count: 0, events: [] };
      expect(summarizeUiText(ui, "No upcoming events.")).toBe("No upcoming events.");
    });
  });

  describe("reminders (list)", () => {
    it("overrides LLM text when reminders are present", () => {
      const ui: AssistantUi = {
        kind: "reminders",
        count: 2,
        reminders: [
          { id: "1", title: "Call Mom", dueAt: "2024-01-01", status: "OPEN", participants: [] },
          { id: "2", title: "Send email", dueAt: "2024-01-02", status: "OPEN", participants: [] },
        ],
      };
      expect(summarizeUiText(ui, "Your reminders:\n1. Call Mom\n2. Send email"))
        .toBe("Showing 2 reminders.");
    });

    it("preserves LLM text for zero results", () => {
      const ui: AssistantUi = { kind: "reminders", count: 0, reminders: [] };
      expect(summarizeUiText(ui, "You have no open reminders.")).toBe("You have no open reminders.");
    });
  });

  // ── Selection ────────────────────────────────────────────────────────

  describe("selection", () => {
    it("generates pick prompt with option count", () => {
      const ui: AssistantUi = {
        kind: "selection",
        prompt: "Which one?",
        options: [
          { id: "1", entityKind: "contact", title: "Alice A.", subtitle: null, selectMessage: "Use 1" },
          { id: "2", entityKind: "contact", title: "Alice B.", subtitle: null, selectMessage: "Use 2" },
          { id: "3", entityKind: "contact", title: "Alice C.", subtitle: null, selectMessage: "Use 3" },
        ],
      };
      expect(summarizeUiText(ui, "Multiple matches found")).toBe(
        "Please pick one of the 3 options below."
      );
    });
  });

  // ── Non-list UIs preserve LLM text ──────────────────────────────────

  describe("created", () => {
    it("prefers LLM text when available", () => {
      const ui: AssistantUi = {
        kind: "created",
        cards: [{ kind: "contact", contact: { id: "1", displayName: "Alice", primaryPhone: null, primaryEmail: null, company: null, jobTitle: null, location: null } }],
      };
      expect(summarizeUiText(ui, "I've created Alice's contact.")).toBe(
        "I've created Alice's contact."
      );
    });

    it("falls back to generated summary when LLM text is empty", () => {
      const ui: AssistantUi = {
        kind: "created",
        cards: [
          { kind: "contact", contact: { id: "1", displayName: "Alice", primaryPhone: null, primaryEmail: null, company: null, jobTitle: null, location: null } },
          { kind: "conversation", conversation: { id: "2", medium: "PHONE", happenedAt: "2024-01-01", content: null, participants: [] } },
        ],
      };
      expect(summarizeUiText(ui, "")).toBe("Logged 1 contact, 1 conversation.");
    });
  });

  describe("contact (detail)", () => {
    it("prefers LLM text when available", () => {
      const ui: AssistantUi = {
        kind: "contact",
        contact: { id: "1", displayName: "Alice", primaryPhone: null, primaryEmail: null, company: null, jobTitle: null, location: null },
      };
      expect(summarizeUiText(ui, "Here's Alice's info.")).toBe("Here's Alice's info.");
    });

    it("falls back to generic text when LLM text is empty", () => {
      const ui: AssistantUi = {
        kind: "contact",
        contact: { id: "1", displayName: "Alice", primaryPhone: null, primaryEmail: null, company: null, jobTitle: null, location: null },
      };
      expect(summarizeUiText(ui, "")).toBe("Here are the contact details.");
    });
  });

  describe("confirmation", () => {
    it("prefers LLM text when available", () => {
      const ui: AssistantUi = {
        kind: "confirmation",
        action: "delete_contact",
        details: { name: "Alice" },
      };
      expect(summarizeUiText(ui, "Shall I delete Alice?")).toBe("Shall I delete Alice?");
    });
  });

  // ── Edge cases ──────────────────────────────────────────────────────

  describe("edge cases", () => {
    it("returns fallback when ui is null", () => {
      expect(summarizeUiText(null, "Some text")).toBe("Some text");
    });

    it("returns empty fallback when ui is null and fallback is empty", () => {
      expect(summarizeUiText(null, "")).toBe("");
    });
  });
});
