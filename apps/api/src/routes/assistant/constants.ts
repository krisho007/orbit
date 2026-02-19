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

export const MUTATING_TOOL_NAMES = new Set([
  "create_contact",
  "update_contact",
  "update_contact_by_id",
  "add_contact_image",
  "create_conversation",
  "create_conversation_by_ids",
  "update_conversation_by_id",
  "create_event",
  "create_event_by_ids",
  "update_event_by_id",
  "create_reminder_by_ids",
  "update_reminder_by_id",
  "complete_reminder",
  "create_tag",
  "update_tag",
  "create_relationship",
  "update_relationship",
  "create_relationship_type",
  "update_relationship_type",
  "set_my_contact",
  "create_relationship_smart",
]);

export const DELETE_TOOL_NAMES = new Set([
  "delete_contact",
  "delete_contact_image",
  "delete_conversation",
  "delete_event",
  "delete_reminder",
  "delete_tag",
  "delete_relationship",
  "delete_relationship_type",
]);

// Intent-to-tool-set mapping: each intent only sees the tools it needs.
// Fewer tools = higher LLM accuracy in tool selection and parameter filling.
export const INTENT_TOOL_SETS: Record<AssistantIntent, string[]> = {
  create_contact: [
    "create_contact", "list_tags", "request_confirmation",
  ],
  create_conversation: [
    "search_contacts_fuzzy", "query_contacts", "get_contact_details",
    "update_contact_by_id", "create_conversation",
    "create_conversation_by_ids", "request_confirmation",
  ],
  create_conversation_with_contact: [
    "search_contacts_fuzzy", "query_contacts", "get_contact_details",
    "update_contact_by_id", "create_contact",
    "create_conversation", "create_conversation_by_ids", "request_confirmation",
  ],
  create_event: [
    "search_contacts_fuzzy", "query_contacts", "create_event",
    "create_event_by_ids", "request_confirmation",
  ],
  create_event_with_conversation: [
    "search_contacts_fuzzy", "create_event", "create_event_by_ids",
    "create_conversation_by_ids", "request_confirmation",
  ],
  create_reminder: [
    "search_contacts_fuzzy", "query_contacts", "create_reminder_by_ids",
    "request_confirmation",
  ],
  create_reminder_with_context: [
    "search_contacts_fuzzy", "searchConversations", "searchEvents",
    "create_reminder_by_ids", "request_confirmation",
  ],
  edit_contact: [
    "search_contacts_fuzzy", "get_contact_details", "update_contact",
    "update_contact_by_id", "list_tags", "request_confirmation",
  ],
  edit_conversation: [
    "search_contacts_fuzzy", "searchConversations", "get_conversation",
    "update_conversation_by_id", "request_confirmation",
  ],
  edit_event: [
    "search_contacts_fuzzy", "searchEvents", "get_event",
    "update_event_by_id", "request_confirmation",
  ],
  edit_reminder: [
    "searchReminders", "get_reminder", "update_reminder_by_id",
    "complete_reminder", "request_confirmation",
  ],
  search_contact: [
    "search_contacts_fuzzy", "query_contacts", "searchContacts",
    "get_contact_details", "list_contacts", "search_contacts_by_phone",
    "list_relationships", "list_relationship_types",
  ],
  search_conversation: [
    "searchConversations", "query_conversations", "list_conversations",
    "get_conversation", "search_contacts_fuzzy",
  ],
  search_event: [
    "searchEvents", "query_events", "list_events", "get_event",
    "search_contacts_fuzzy",
  ],
  search_reminder: [
    "searchReminders", "list_reminders", "get_reminder",
    "search_contacts_fuzzy",
  ],
  delete_entity: [
    "search_contacts_fuzzy", "searchConversations", "searchEvents",
    "searchReminders",
  ],
  // Unknown intent: broad read-only tools so LLM can figure it out
  unknown: [
    "search_contacts_fuzzy", "query_contacts", "searchContacts",
    "get_contact_details", "searchConversations", "query_conversations",
    "searchEvents", "query_events", "searchReminders", "list_reminders",
    "list_tags", "list_relationship_types", "list_relationships",
    "resolve_contact", "create_relationship_smart", "set_my_contact",
    "request_confirmation",
  ],
};

export function unionToolSets(intents: AssistantIntent[]): string[] {
  const union = new Set<string>();
  for (const intent of intents) {
    const tools = INTENT_TOOL_SETS[intent] ?? INTENT_TOOL_SETS.unknown;
    for (const tool of tools) union.add(tool);
  }
  return [...union];
}
