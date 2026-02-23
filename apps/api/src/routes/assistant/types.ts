import { z } from "zod";

// ── Message schemas ──────────────────────────────────────────────────
export const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

export const chatSchema = z.object({
  messages: z.array(messageSchema),
  conversationId: z.string().optional(),
  timezone: z.string().optional(),
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
  | { kind: "selection"; prompt: string; options: AssistantSelectionOption[] }
  | { kind: "confirmation"; action: string; entityType?: string; details?: Record<string, unknown> };

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
