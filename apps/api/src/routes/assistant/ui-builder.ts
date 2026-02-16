import type { ToolResult, AssistantUi, AssistantCreatedCard } from "./types";

export function buildUiFromToolResults(
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

  // Check for confirmation requests
  for (const toolResult of toolResults) {
    const output = toolResult.output;
    if (output?.type === "confirmation_requested") {
      return {
        kind: "confirmation",
        action: String(output.action || ""),
        details: output.details as Record<string, unknown> | undefined,
      };
    }
  }

  for (let i = toolResults.length - 1; i >= 0; i -= 1) {
    const output = toolResults[i]?.output;
    if (!output || typeof output !== "object") continue;

    if (output.type === "contact_ambiguous") {
      const candidates = Array.isArray(output.candidates) ? output.candidates : [];
      return {
        kind: "selection",
        prompt:
          typeof output.message === "string" && output.message.trim().length > 0
            ? output.message
            : "I found multiple matching contacts. Please pick one.",
        options: candidates
          .map((candidate: any) => ({
            id: String(candidate?.id || ""),
            entityKind: "contact" as const,
            title: String(candidate?.displayName || "Unknown contact"),
            subtitle: candidate?.primaryPhone
              ? String(candidate.primaryPhone)
              : candidate?.primaryEmail
                ? String(candidate.primaryEmail)
                : null,
            selectMessage: `Use contact ID ${String(candidate?.id || "")} as the selected context for this request.`,
          }))
          .filter((option) => option.id.length > 0),
      };
    }

    if (output.type === "relationship_type_ambiguous") {
      const candidates = Array.isArray(output.candidates) ? output.candidates : [];
      return {
        kind: "selection",
        prompt:
          typeof output.message === "string" && output.message.trim().length > 0
            ? output.message
            : "I found multiple matching relationship types. Please pick one.",
        options: candidates
          .map((candidate: any) => ({
            id: String(candidate?.id || ""),
            entityKind: "relationship_type" as const,
            title: String(candidate?.name || "Unknown relationship type"),
            subtitle: null,
            selectMessage: `Use relationship type ID ${String(candidate?.id || "")} as the selected context for this request.`,
          }))
          .filter((option) => option.id.length > 0),
      };
    }

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

export function summarizeUiText(ui: AssistantUi | null, fallback: string): string {
  if (!ui) return fallback;

  // ── List-type UIs: cards handle display, so use concise generated text ──
  // For non-zero counts we always override the LLM text (which tends to
  // contain redundant numbered lists).  For zero counts we prefer the LLM
  // text because it may contain a helpful follow-up like "No contacts found
  // matching 'Xyzzy'. Want to create one?"

  if (ui.kind === "contacts") {
    if (ui.count === 0) return fallback || "No contacts found.";
    if (ui.contacts.length < ui.count) {
      return `Showing ${ui.contacts.length} of ${ui.count} contacts.`;
    }
    return `Showing ${ui.count} contact${ui.count === 1 ? "" : "s"}.`;
  }

  if (ui.kind === "conversations") {
    if (ui.count === 0) return fallback || "No conversations found.";
    if (ui.conversations.length < ui.count) {
      return `Showing ${ui.conversations.length} of ${ui.count} conversations.`;
    }
    return `Showing ${ui.count} conversation${ui.count === 1 ? "" : "s"}.`;
  }

  if (ui.kind === "events") {
    if (ui.count === 0) return fallback || "No events found.";
    if (ui.events.length < ui.count) {
      return `Showing ${ui.events.length} of ${ui.count} events.`;
    }
    return `Showing ${ui.count} event${ui.count === 1 ? "" : "s"}.`;
  }

  if (ui.kind === "reminders") {
    if (ui.count === 0) return fallback || "No reminders found.";
    if (ui.reminders.length < ui.count) {
      return `Showing ${ui.reminders.length} of ${ui.count} reminders.`;
    }
    return `Showing ${ui.count} reminder${ui.count === 1 ? "" : "s"}.`;
  }

  if (ui.kind === "selection") {
    return `Please pick one of the ${ui.options.length} options below.`;
  }

  // ── Non-list UIs: prefer LLM text when available ──

  if (fallback && fallback.trim().length > 0) return fallback;

  if (ui.kind === "created") {
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

  if (ui.kind === "contact") {
    return "Here are the contact details.";
  }

  return fallback;
}
