import { z } from "zod";
import { tool } from "ai";
import { createContactTools } from "./contacts";
import { createConversationTools } from "./conversations";
import { createEventTools } from "./events";
import { createReminderTools } from "./reminders";
import { createTagTools } from "./tags";
import { createRelationshipTools } from "./relationships";

export type AllSchemas = {
  mediumSchema: any;
  optionalMediumSchema: any;
  eventTypeSchema: any;
  optionalEventTypeSchema: any;
  optionalReminderStatusSchema: any;
  completionStatusSchema: any;
};

export function buildToolSet(userId: string, schemas: AllSchemas, assistantConversationId?: string) {
  const contactTools = createContactTools(userId, schemas, assistantConversationId);
  const conversationTools = createConversationTools(userId, schemas, assistantConversationId);
  const eventTools = createEventTools(userId, schemas, assistantConversationId);
  const reminderTools = createReminderTools(userId, {
    optionalReminderStatusSchema: schemas.optionalReminderStatusSchema,
    completionStatusSchema: schemas.completionStatusSchema,
  }, assistantConversationId);
  const tagTools = createTagTools(userId);
  const relationshipTools = createRelationshipTools(userId);

  const tools = {
    ...contactTools,
    ...conversationTools,
    ...eventTools,
    ...reminderTools,
    ...tagTools,
    ...relationshipTools,

    request_confirmation: tool({
      description: "Propose a create/update action and ask the user to confirm before executing. Use this to present a clear summary of what you plan to do.",
      inputSchema: z.object({
        action: z.string().describe("What you intend to do, e.g. 'Create a phone call conversation with Alice about project timeline'"),
        details: z.record(z.string(), z.unknown()).optional().describe("Key details of the proposed action"),
      }),
      execute: async ({ action, details }) => ({
        type: "confirmation_requested",
        action,
        details,
      }),
    }),
  };

  const toolsWithAliases = {
    ...tools,
    SearchConversations: tools.searchConversations,
    SearchEvents: tools.searchEvents,
  };

  return toolsWithAliases;
}
