import type { AssistantIntent } from "./types";

export const ASSISTANT_INTENTS = [
  "create_contact",
  "search_contact",
  "edit_contact",
  "create_conversation",
  "create_conversation_with_contact",
  "search_conversation",
  "edit_conversation",
  "create_event",
  "create_event_with_conversation",
  "search_event",
  "edit_event",
  "create_reminder",
  "create_reminder_with_context",
  "search_reminder",
  "edit_reminder",
  "delete_entity",
  "unknown",
] as const;

export type { AssistantIntent };
// Re-derive the type from the const array for local use
export type AssistantIntentFromConst = (typeof ASSISTANT_INTENTS)[number];

export const MUTATING_INTENTS = new Set<AssistantIntent>([
  "create_contact",
  "edit_contact",
  "create_conversation",
  "create_conversation_with_contact",
  "edit_conversation",
  "create_event",
  "create_event_with_conversation",
  "edit_event",
  "create_reminder",
  "create_reminder_with_context",
  "edit_reminder",
  "delete_entity",
]);
