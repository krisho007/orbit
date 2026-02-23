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
        entityType: z.enum(["contact", "conversation", "event", "reminder"]).describe("The type of entity being created or updated"),
        details: z.string().optional().describe("JSON object with key details of the proposed action, e.g. '{\"title\":\"Meeting\",\"date\":\"2025-03-01\"}'"),
      }),
      execute: async ({ action, entityType, details }) => {
        let parsed: Record<string, unknown> | undefined;
        if (details) {
          try { parsed = JSON.parse(details); } catch { parsed = { summary: details }; }
        }
        return { type: "confirmation_requested", action, entityType, details: parsed };
      },
    }),
  };

  const toolsWithAliases = {
    ...tools,
    SearchConversations: tools.searchConversations,
    SearchEvents: tools.searchEvents,
  };

  return toolsWithAliases;
}
