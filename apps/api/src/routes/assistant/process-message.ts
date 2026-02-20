import { generateText, InvalidToolInputError, NoSuchToolError } from "ai";
import { getModel, getProviderApiKeyEnvGuard, getProvider } from "./model";
import { stepCountIs } from "ai";
import type { ChatMessage, ToolResult, ToolCallMeta, AssistantUi, AssistantAction, AssistantIntent, StatusCallback } from "./types";
import { eq, and, desc } from "drizzle-orm";
import { db, assistantMessages } from "../../db";
import { SCHEMA_ENUM_CONFIG, loadAssistantEnumConfig, enumValueSchema } from "./enums";
import { identifyIntents } from "./guardrails";
import { anyIntentRequiresConfirmation, isExplicitUserConfirmation, isExplicitUserRejection } from "./guardrails";
import { ASSISTANT_INTENTS, MUTATING_TOOL_NAMES, DELETE_TOOL_NAMES, unionToolSets } from "./constants";
import { getUserContext } from "./db-helpers";
import { buildSystemPrompt } from "./system-prompt";
import { buildUiFromToolResults, summarizeUiText } from "./ui-builder";
import {
  sanitizeCreateContactInput,
  extractDisplayNameFromUserText,
  extractLastUserText,
  missingCreateContactFields,
  summarizeToolCallError,
  buildCreateContactFailureText,
} from "./error-helpers";
import { buildToolSet } from "./tools";

const TOOL_STATUS_MAP: Record<string, string> = {
  // Contact tools
  search_contacts_fuzzy: "Searching contacts...",
  query_contacts: "Searching contacts...",
  searchContacts: "Searching contacts...",
  list_contacts: "Loading contacts...",
  get_contact_details: "Loading contact details...",
  search_contacts_by_phone: "Searching by phone...",
  resolve_contact: "Resolving contact...",
  create_contact: "Creating contact...",
  update_contact: "Updating contact...",
  update_contact_by_id: "Updating contact...",
  add_contact_image: "Adding contact image...",
  set_my_contact: "Setting your contact...",
  // Conversation tools
  searchConversations: "Searching conversations...",
  query_conversations: "Searching conversations...",
  list_conversations: "Loading conversations...",
  get_conversation: "Loading conversation...",
  create_conversation: "Logging conversation...",
  create_conversation_by_ids: "Logging conversation...",
  update_conversation_by_id: "Updating conversation...",
  // Event tools
  searchEvents: "Searching events...",
  query_events: "Searching events...",
  list_events: "Loading events...",
  get_event: "Loading event...",
  create_event: "Creating event...",
  create_event_by_ids: "Creating event...",
  update_event_by_id: "Updating event...",
  // Reminder tools
  searchReminders: "Searching reminders...",
  list_reminders: "Loading reminders...",
  get_reminder: "Loading reminder...",
  create_reminder_by_ids: "Creating reminder...",
  update_reminder_by_id: "Updating reminder...",
  complete_reminder: "Completing reminder...",
  // Tag & relationship tools
  list_tags: "Loading tags...",
  create_tag: "Creating tag...",
  update_tag: "Updating tag...",
  list_relationships: "Loading relationships...",
  list_relationship_types: "Loading relationship types...",
  create_relationship: "Creating relationship...",
  create_relationship_smart: "Creating relationship...",
  update_relationship: "Updating relationship...",
  create_relationship_type: "Creating relationship type...",
  update_relationship_type: "Updating relationship type...",
  // Confirmation
  request_confirmation: "Reviewing changes...",
};

function toolNameToStatus(toolName: string): string | null {
  return TOOL_STATUS_MAP[toolName] ?? null;
}

async function loadCachedIntents(assistantConversationId: string): Promise<AssistantIntent[] | null> {
  const [lastMsg] = await db
    .select({ ui: assistantMessages.ui })
    .from(assistantMessages)
    .where(
      and(
        eq(assistantMessages.assistantConversationId, assistantConversationId),
        eq(assistantMessages.role, "assistant")
      )
    )
    .orderBy(desc(assistantMessages.createdAt))
    .limit(1);

  if (!lastMsg?.ui) return null;

  try {
    const parsed = JSON.parse(lastMsg.ui);
    if (Array.isArray(parsed?._cachedIntents) && parsed._cachedIntents.length > 0) {
      const valid = parsed._cachedIntents.filter(
        (i: unknown) => typeof i === "string" && ASSISTANT_INTENTS.includes(i as AssistantIntent)
      ) as AssistantIntent[];
      return valid.length > 0 ? valid : null;
    }
  } catch {
    // Invalid JSON, fall through
  }
  return null;
}

export async function processMessageLLM(
  userId: string,
  messages: ChatMessage[],
  generate: typeof generateText = generateText,
  assistantConversationId?: string,
  onStatus?: StatusCallback
): Promise<{ text: string; ui: AssistantUi | null; actions?: AssistantAction[]; cachedIntents?: AssistantIntent[] }> {
  const apiKeyGuard = getProviderApiKeyEnvGuard();
  if (!apiKeyGuard.configured) {
    return { text: apiKeyGuard.message, ui: null };
  }

  const provider = getProvider();
  const usingMockGenerate = generate !== generateText;
  const defaultEnumConfig = {
    conversationMediums: [...SCHEMA_ENUM_CONFIG.conversationMediums],
    eventTypes: [...SCHEMA_ENUM_CONFIG.eventTypes],
    reminderStatuses: [...SCHEMA_ENUM_CONFIG.reminderStatuses],
  };
  const defaultContext = { userName: null, userEmail: "", primaryContactId: null, primaryContactName: null };

  const lastUserText = extractLastUserText(messages as unknown[]);
  const isConfirmation = isExplicitUserConfirmation(lastUserText);
  const isRejection = isExplicitUserRejection(lastUserText);

  // Hard short-circuit: rejection needs no LLM call at all — just ask what to change
  if (isRejection) {
    let rejectionCachedIntents: AssistantIntent[] | null = null;
    if (assistantConversationId) {
      rejectionCachedIntents = await loadCachedIntents(assistantConversationId);
    }
    console.log(`[assistant:llm] Rejection detected — skipping LLM, cached intents: [${rejectionCachedIntents?.join(", ") ?? "none"}]`);
    return {
      text: "Sure, what would you like to change?",
      ui: null,
      cachedIntents: rejectionCachedIntents ?? undefined,
    };
  }

  onStatus?.("Classifying intent...");

  // On confirmation turns, use cached intents from the previous assistant message
  // instead of re-classifying (LLM classification is non-deterministic and may drop intents).
  let cachedIntents: AssistantIntent[] | null = null;
  if (isConfirmation && assistantConversationId) {
    cachedIntents = await loadCachedIntents(assistantConversationId);
    if (cachedIntents) {
      console.log(`[assistant:llm] Using cached intents from previous turn: [${cachedIntents.join(", ")}]`);
    }
  }

  // Fallback: classify from earlier messages if no cache hit
  const messagesForClassification =
    isConfirmation && messages.length >= 3 ? messages.slice(0, -2) : messages;

  // Run independent operations in parallel: enum config, intent classification, and user context
  const [enumConfig, inferredIntents, userContext] = await Promise.all([
    usingMockGenerate ? Promise.resolve(defaultEnumConfig) : loadAssistantEnumConfig(),
    cachedIntents
      ? Promise.resolve(cachedIntents)
      : identifyIntents(messagesForClassification, generate),
    usingMockGenerate ? Promise.resolve(defaultContext) : getUserContext(userId),
  ]);

  const confirmationRequired =
    anyIntentRequiresConfirmation(inferredIntents) && !isConfirmation;

  const mediumSchema = enumValueSchema(enumConfig.conversationMediums, "Conversation medium");
  const optionalMediumSchema = enumValueSchema(
    enumConfig.conversationMediums,
    "Conversation medium",
    true
  );
  const eventTypeSchema = enumValueSchema(enumConfig.eventTypes, "Event type");
  const optionalEventTypeSchema = enumValueSchema(enumConfig.eventTypes, "Event type", true);
  const optionalReminderStatusSchema = enumValueSchema(
    enumConfig.reminderStatuses,
    "Reminder status",
    true
  );
  const completionStatusValues = enumConfig.reminderStatuses.filter(
    (value) => value === "DONE" || value === "CANCELED"
  );
  const completionStatusSchema = enumValueSchema(
    completionStatusValues,
    "Reminder completion status",
    true
  );

  const toolsWithAliases = buildToolSet(userId, {
    mediumSchema,
    optionalMediumSchema,
    eventTypeSchema,
    optionalEventTypeSchema,
    optionalReminderStatusSchema,
    completionStatusSchema,
  }, assistantConversationId);
  // Intent-based tool scoping: union tool sets from all classified intents
  const allowedToolNames = new Set(unionToolSets(inferredIntents));

  const toolsForRun = Object.fromEntries(
    Object.entries(toolsWithAliases).filter(([toolName]) => {
      if (DELETE_TOOL_NAMES.has(toolName)) return false;
      if (!allowedToolNames.has(toolName)) return false;
      if (confirmationRequired && MUTATING_TOOL_NAMES.has(toolName)) return false;
      return true;
    })
  ) as typeof toolsWithAliases;

  const modelMessages = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  console.log(`[assistant:llm] Starting LLM processing with ${modelMessages.length} message(s)`);
  console.log(`[assistant:llm] User context: ${userContext.userName || "(no name)"}, primaryContact: ${userContext.primaryContactId || "(not set)"}`);
  console.log(`[assistant:llm] Provider: ${provider}, Model: ${process.env.AI_MODEL || "(default)"}`);
  console.log(`[assistant:llm] Intents: [${inferredIntents.join(", ")}], confirmationRequired=${confirmationRequired}`);
  const toolNames = Object.keys(toolsForRun);
  console.log(`[assistant:llm] Tools scoped: ${toolNames.length} tools — [${toolNames.join(", ")}]`);
  console.log(
    `[assistant:llm] Enum values — mediums=${enumConfig.conversationMediums.length}, eventTypes=${enumConfig.eventTypes.length}, reminderStatuses=${enumConfig.reminderStatuses.length}`
  );

  let capturedToolResults: Array<{ output?: ToolResult }> = [];
  let capturedToolCalls: ToolCallMeta[] = [];
  let stepIndex = 0;

  const result = await generate({
    model: getModel(),
    system: buildSystemPrompt(userContext, enumConfig, inferredIntents, confirmationRequired),
    messages: modelMessages,
    tools: toolsForRun,
    experimental_repairToolCall: async ({ toolCall, error, messages }) => {
      if (toolCall.toolName !== "create_contact") {
        return null;
      }
      if (!InvalidToolInputError.isInstance(error) && !NoSuchToolError.isInstance(error)) {
        return null;
      }

      let parsedInput: unknown = {};
      try {
        parsedInput = toolCall.input?.trim() ? JSON.parse(toolCall.input) : {};
      } catch {
        parsedInput = {};
      }

      const sanitized = sanitizeCreateContactInput(parsedInput);
      const currentDisplayName = sanitized.displayName;
      if (typeof currentDisplayName !== "string" || currentDisplayName.trim().length === 0) {
        const lastUserText = extractLastUserText(messages as unknown[]);
        const inferredName = extractDisplayNameFromUserText(lastUserText);
        if (inferredName) {
          sanitized.displayName = inferredName;
        }
      }

      if (missingCreateContactFields(sanitized).length > 0) {
        return null;
      }

      return {
        ...toolCall,
        input: JSON.stringify(sanitized),
      };
    },
    stopWhen: stepCountIs(inferredIntents.length > 2 ? 10 : 8),
    onStepFinish: (event) => {
      stepIndex++;
      const toolCalls = event.toolCalls || [];
      const toolResultsList = event.toolResults || [];

      // Emit status for the first recognized tool call in this step
      if (onStatus && toolCalls.length > 0) {
        for (const tc of toolCalls) {
          const status = toolNameToStatus(String((tc as any).toolName || ""));
          if (status) {
            onStatus(status);
            break;
          }
        }
      }
      const failedToolCalls = toolCalls.filter((tc) => (tc as any).invalid).length;
      capturedToolCalls.push(
        ...toolCalls.map((tc) => ({
          toolName: String((tc as any).toolName || ""),
          toolCallId: typeof (tc as any).toolCallId === "string" ? (tc as any).toolCallId : undefined,
          input: (tc as any).input,
          invalid: Boolean((tc as any).invalid),
          error: (tc as any).error,
        }))
      );

      if (toolCalls.length > 0) {
        console.log(
          `[assistant:llm] Step ${stepIndex} — ${toolCalls.length} tool call(s), ${toolResultsList.length} result(s), ${failedToolCalls} failed`
        );
        for (let i = 0; i < toolCalls.length; i++) {
          const tc = toolCalls[i];
          const inputPreview = (tc as any).input
            ? JSON.stringify((tc as any).input).substring(0, 300)
            : "(no input)";
          const toolCallId = typeof (tc as any).toolCallId === "string" ? (tc as any).toolCallId : "n/a";
          const invalid = Boolean((tc as any).invalid);
          const errorSummary = invalid ? summarizeToolCallError((tc as any).error) : "";
          const matchedResult = toolResultsList[i] as { output?: ToolResult } | undefined;
          const resultStatus = matchedResult?.output
            ? `✓ ${matchedResult.output.type || "ok"}`
            : "⏳ pending";
          console.log(
            `  ↳ tool=${String((tc as any).toolName)} id=${toolCallId} invalid=${invalid} → ${resultStatus} input=${inputPreview}`
          );
          if (invalid) {
            console.log(`    ↳ validation_error=${errorSummary}`);
            if ((tc as any).toolName === "create_contact") {
              const missing = missingCreateContactFields((tc as any).input);
              if (missing.length > 0) {
                console.log(`    ↳ missing_required=${missing.join(",")}`);
              }
            }
          }
        }
        if (toolResultsList.length < toolCalls.length) {
          console.log(`  ⚠ ${toolCalls.length - toolResultsList.length} tool result(s) pending (will appear in final summary)`);
        }
      } else if (event.text) {
        const preview = event.text.substring(0, 200);
        console.log(`[assistant:llm] Step ${stepIndex} — text response: "${preview}${event.text.length > 200 ? "..." : ""}"`);
      } else {
        console.log(`[assistant:llm] Step ${stepIndex} — (no tool calls or text)`);
      }
    },
    onFinish: (event) => {
      const stepResults = event.steps.flatMap((step) => step.toolResults || []);
      capturedToolResults = stepResults as Array<{ output?: ToolResult }>;
      capturedToolCalls = event.steps.flatMap((step) =>
        (step.toolCalls || []).map((tc: any) => ({
          toolName: String(tc?.toolName || ""),
          toolCallId: typeof tc?.toolCallId === "string" ? tc.toolCallId : undefined,
          input: tc?.input,
          invalid: Boolean(tc?.invalid),
          error: tc?.error,
        }))
      );
      console.log(`[assistant:llm] Finished — ${event.steps.length} step(s), ${capturedToolResults.length} tool result(s)`);
    },
  });

  onStatus?.("Preparing response...");

  const fallbackToolResults = result.toolResults as Array<{ output?: ToolResult }>;
  const toolResults = capturedToolResults.length > 0 ? capturedToolResults : fallbackToolResults;
  const stepToolCalls = ((result as any).steps || []).flatMap((step: any) =>
    (step?.toolCalls || []).map((tc: any) => ({
      toolName: String(tc?.toolName || ""),
      toolCallId: typeof tc?.toolCallId === "string" ? tc.toolCallId : undefined,
      input: tc?.input,
      invalid: Boolean(tc?.invalid),
      error: tc?.error,
    }))
  ) as ToolCallMeta[];
  const toolCalls = capturedToolCalls.length > 0 ? capturedToolCalls : stepToolCalls;
  const ui = buildUiFromToolResults(toolResults);

  // Suppress intermediate search UIs during create/edit flows.
  // Contact/entity searches during these flows are context resolution (e.g.
  // looking up a contact to link to a conversation), not the user's requested result.
  // This applies both to confirmation turns AND execution turns.
  const isMutatingFlow = inferredIntents.some(
    (i) => i.startsWith("create_") || i.startsWith("edit_")
  );
  const isSearchUi =
    ui !== null &&
    ["contacts", "conversations", "events", "reminders"].includes(ui.kind);
  const isUserSearchIntent = inferredIntents.some((i) => i.startsWith("search_"));
  // If we have a "created" card, always prefer it over a search result
  const hasCreatedUi = ui !== null && ui.kind === "created";
  const isIntermediateSearchUi =
    isSearchUi && isMutatingFlow && !isUserSearchIntent && !hasCreatedUi;

  const effectiveUi = isIntermediateSearchUi ? null : ui;

  let text = summarizeUiText(effectiveUi, result.text, confirmationRequired);

  const createContactCalls = toolCalls.filter((call) => call.toolName === "create_contact");
  const contactCreated = toolResults.some(
    (toolResult) =>
      toolResult.output &&
      typeof toolResult.output === "object" &&
      toolResult.output.type === "contact_created"
  );
  if (createContactCalls.length > 0 && !contactCreated) {
    // Only override text if no other mutations succeeded (e.g. event/conversation created).
    // In multi-intent flows, other actions may have completed; keep the LLM's summary.
    const hasOtherSuccessfulMutations = toolResults.some(
      (toolResult) =>
        toolResult.output &&
        typeof toolResult.output === "object" &&
        typeof toolResult.output.type === "string" &&
        toolResult.output.type !== "contact_created" &&
        (toolResult.output.type.endsWith("_created") || toolResult.output.type.endsWith("_updated"))
    );
    if (!hasOtherSuccessfulMutations) {
      const lastUserText = messages[messages.length - 1]?.content || "";
      text = buildCreateContactFailureText(lastUserText, createContactCalls, toolResults);
    }
  }

  const hasConfirmationProposal = toolResults.some(
    (tr) => tr.output?.type === "confirmation_requested"
  );
  const textIndicatesPlan =
    /\b(going to|will|plan to|about to|shall I|would you like me to|want me to|should I|ready to)\b/i.test(result.text) &&
    /\b(go ahead|confirm|proceed|changes|create|log|add|set up|schedule|save)\b/i.test(result.text);

  const shouldShowConfirmationButtons =
    confirmationRequired && (hasConfirmationProposal || textIndicatesPlan);

  const actions: AssistantAction[] | undefined = shouldShowConfirmationButtons
    ? [
        { label: "Go ahead", message: "go ahead", style: "primary" },
        { label: "I need changes", message: "No, I need changes", style: "secondary" },
      ]
    : undefined;

  console.log(`[assistant:llm] Final text (${text.length} chars), UI: ${effectiveUi ? effectiveUi.kind : "none"}, actions: ${actions ? actions.length : "none"}`);

  return { text, ui: effectiveUi, actions, cachedIntents: inferredIntents };
}
