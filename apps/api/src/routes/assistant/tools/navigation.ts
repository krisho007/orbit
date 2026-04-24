import { z } from "zod";
import { tool } from "ai";

type Ctx = { userId: string };

const screenEnum = z.enum(["contacts", "conversations", "events", "reminders", "assistant", "profile"]);

export function navigationTools(_ctx: Ctx) {
  return {
    navigate_to_contact: tool({
      description:
        "Open a contact's detail screen in the app. Use when the user asks to 'open', 'show', or 'go to' a specific contact and you already know its id.",
      inputSchema: z.object({ contactId: z.string() }),
      execute: async ({ contactId }) => ({
        action: "navigate" as const,
        path: `/contact/${contactId}`,
        contactId,
      }),
    }),

    navigate_to_conversation: tool({
      description: "Open a conversation's detail screen by id.",
      inputSchema: z.object({ conversationId: z.string() }),
      execute: async ({ conversationId }) => ({
        action: "navigate" as const,
        path: `/conversation/${conversationId}`,
        conversationId,
      }),
    }),

    navigate_to_event: tool({
      description: "Open an event's detail screen by id.",
      inputSchema: z.object({ eventId: z.string() }),
      execute: async ({ eventId }) => ({
        action: "navigate" as const,
        path: `/event/${eventId}`,
        eventId,
      }),
    }),

    navigate_to_reminder: tool({
      description: "Open a reminder's detail screen by id.",
      inputSchema: z.object({ reminderId: z.string() }),
      execute: async ({ reminderId }) => ({
        action: "navigate" as const,
        path: `/reminder/${reminderId}`,
        reminderId,
      }),
    }),

    navigate_to_screen: tool({
      description:
        "Open a top-level screen in the app (contacts, conversations, events, reminders, assistant, profile).",
      inputSchema: z.object({ screen: screenEnum }),
      execute: async ({ screen }) => ({
        action: "navigate" as const,
        path: `/(tabs)/${screen}`,
        screen,
      }),
    }),

    open_contact_create_form: tool({
      description:
        "Open the new-contact form, optionally pre-filled. Use when the user wants to review/edit fields before saving, or when some fields are ambiguous.",
      inputSchema: z.object({
        displayName: z.string().optional(),
        primaryPhone: z.string().optional(),
        primaryEmail: z.string().optional(),
        company: z.string().optional(),
        jobTitle: z.string().optional(),
        location: z.string().optional(),
        notes: z.string().optional(),
      }),
      execute: async (prefill) => ({
        action: "open_form" as const,
        path: "/contact/new",
        prefill,
      }),
    }),

    open_conversation_create_form: tool({
      description:
        "Open the new-conversation form, optionally pre-filled. Use when the user wants to review details before logging a conversation.",
      inputSchema: z.object({
        content: z.string().optional(),
        medium: z.string().optional(),
        happenedAt: z.string().optional(),
        participantIds: z.array(z.string()).optional(),
      }),
      execute: async (prefill) => ({
        action: "open_form" as const,
        path: "/conversation/new",
        prefill,
      }),
    }),

    open_event_create_form: tool({
      description: "Open the new-event form, optionally pre-filled.",
      inputSchema: z.object({
        title: z.string().optional(),
        eventType: z.string().optional(),
        startAt: z.string().optional(),
        endAt: z.string().optional(),
        location: z.string().optional(),
        description: z.string().optional(),
        participantIds: z.array(z.string()).optional(),
      }),
      execute: async (prefill) => ({
        action: "open_form" as const,
        path: "/event/new",
        prefill,
      }),
    }),

    open_reminder_create_form: tool({
      description: "Open the new-reminder form, optionally pre-filled.",
      inputSchema: z.object({
        title: z.string().optional(),
        dueAt: z.string().optional(),
        notes: z.string().optional(),
        participantIds: z.array(z.string()).optional(),
      }),
      execute: async (prefill) => ({
        action: "open_form" as const,
        path: "/reminder/new",
        prefill,
      }),
    }),
  };
}
