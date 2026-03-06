import { z } from "zod";

// ── Message schemas ──────────────────────────────────────────────────
export const MAX_USER_MESSAGE_LENGTH = 2_000;
export const MAX_USER_MESSAGES_PER_CONVERSATION = 10;

export const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

export const chatSchema = z.object({
  messages: z.array(messageSchema),
  conversationId: z.string().optional(),
  timezone: z.string().optional(),
}).superRefine((data, ctx) => {
  // Only limit length on user messages — assistant messages can be longer (tool results, etc.)
  for (let i = 0; i < data.messages.length; i++) {
    const msg = data.messages[i]!;
    if (msg.role === "user" && msg.content.length > MAX_USER_MESSAGE_LENGTH) {
      ctx.addIssue({
        code: "too_big",
        origin: "string",
        maximum: MAX_USER_MESSAGE_LENGTH,
        inclusive: true,
        message: "Message too long (max 2000 characters)",
        path: ["messages", i, "content"],
      });
    }
  }
});

export const PAGE_SIZE = 20;

// ── Chat types ───────────────────────────────────────────────────────
export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

// ── Tool result ──────────────────────────────────────────────────────
export interface ToolResult {
  type: string;
  [key: string]: unknown;
}

// ── UI card types ────────────────────────────────────────────────────
export type AssistantContactCard = {
  id: string;
  displayName: string;
  primaryPhone?: string | null;
  primaryEmail?: string | null;
  company?: string | null;
  jobTitle?: string | null;
  location?: string | null;
};

export type AssistantConversationCard = {
  id: string;
  medium: string;
  happenedAt: string;
  content?: string | null;
  participants?: string[];
};

export type AssistantEventCard = {
  id: string;
  title: string;
  startAt: string;
  location?: string | null;
  participants?: string[];
};

export type AssistantReminderCard = {
  id: string;
  title: string;
  dueAt: string;
  status: string;
  participants?: string[];
};

export type AssistantCreatedCard =
  | { kind: "contact"; contact: AssistantContactCard }
  | { kind: "conversation"; conversation: AssistantConversationCard }
  | { kind: "event"; event: AssistantEventCard }
  | { kind: "reminder"; reminder: AssistantReminderCard };

export type AssistantSelectionOption = {
  id: string;
  entityKind: "contact" | "conversation" | "event" | "reminder" | "relationship_type";
  title: string;
  subtitle?: string | null;
  selectMessage: string;
};

export type AssistantUi =
  | { kind: "contact"; contact: AssistantContactCard }
  | { kind: "contacts"; count: number; contacts: AssistantContactCard[] }
  | { kind: "conversations"; count: number; conversations: AssistantConversationCard[] }
  | { kind: "events"; count: number; events: AssistantEventCard[] }
  | { kind: "reminders"; count: number; reminders: AssistantReminderCard[] }
  | { kind: "created"; cards: AssistantCreatedCard[] }
  | { kind: "selection"; prompt: string; options: AssistantSelectionOption[]; totalCount?: number }
  | { kind: "confirmation"; action: string; entityType?: string; details?: Record<string, unknown>; items?: Array<{ entityType: string; details: Record<string, unknown> }> };

// ── Action buttons ──────────────────────────────────────────────────
export type AssistantAction = {
  label: string;
  message: string;
  style: "primary" | "secondary";
};

// ── Status callback ─────────────────────────────────────────────────
export type StatusCallback = (message: string) => void;

// ── Tool call metadata ───────────────────────────────────────────────
export type ToolCallMeta = {
  toolName: string;
  toolCallId?: string;
  input?: unknown;
  invalid?: boolean;
  error?: unknown;
};

// ── User context ─────────────────────────────────────────────────────
export type UserContext = {
  userName: string | null;
  userEmail: string;
  primaryContactId: string | null;
  primaryContactName: string | null;
};

// ── Intent type ──────────────────────────────────────────────────────
export type AssistantIntent =
  | "create_contact"
  | "search_contact"
  | "edit_contact"
  | "create_conversation"
  | "create_conversation_with_contact"
  | "search_conversation"
  | "edit_conversation"
  | "create_event"
  | "create_event_with_conversation"
  | "search_event"
  | "edit_event"
  | "create_reminder"
  | "create_reminder_with_context"
  | "search_reminder"
  | "edit_reminder"
  | "delete_entity"
  | "unknown";

// ── Enum config ──────────────────────────────────────────────────────
export type AssistantEnumConfig = {
  conversationMediums: string[];
  eventTypes: string[];
  reminderStatuses: string[];
};

// ── Contact creation allow-list ──────────────────────────────────────
export const createContactAllowedFields = new Set([
  "displayName",
  "primaryPhone",
  "primaryEmail",
  "dateOfBirth",
  "gender",
  "company",
  "jobTitle",
  "location",
  "notes",
  "tagIds",
]);

// ── Date formatting ──────────────────────────────────────────────────
export function formatToday(date: Date, timezone?: string): string {
  const tz = timezone || "UTC";
  const datePart = date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: tz,
  });
  const timePart = date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: tz,
  });
  const iso = date.toISOString();
  return `${datePart}, current time: ${timePart} (UTC: ${iso})`;
}
