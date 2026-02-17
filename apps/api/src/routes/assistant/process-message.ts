import { generateText, InvalidToolInputError, NoSuchToolError } from "ai";
import { google } from "@ai-sdk/google";
import { stepCountIs } from "ai";
import type { ChatMessage, ToolResult, ToolCallMeta, AssistantUi, AssistantAction } from "./types";
import { SCHEMA_ENUM_CONFIG, loadAssistantEnumConfig, enumValueSchema } from "./enums";
import { identifyIntents } from "./guardrails";
import { anyIntentRequiresConfirmation, isExplicitUserConfirmation } from "./guardrails";
import { MUTATING_TOOL_NAMES, DELETE_TOOL_NAMES, unionToolSets } from "./constants";
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

export async function processMessageLLM(
  userId: string,
  messages: ChatMessage[],
  generate: typeof generateText = generateText,
  assistantConversationId?: string
): Promise<{ text: string; ui: AssistantUi | null; actions?: AssistantAction[] }> {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return {
      text:
        "Assistant is not configured. Set GOOGLE_GENERATIVE_AI_API_KEY in apps/api/.env to enable LLM features.",
      ui: null,
    };
  }

  const aiModel = process.env.AI_MODEL || "gemini-flash-lite-latest";
  const usingMockGenerate = generate !== generateText;
  const enumConfig = usingMockGenerate
    ? {
        conversationMediums: [...SCHEMA_ENUM_CONFIG.conversationMediums],
        eventTypes: [...SCHEMA_ENUM_CONFIG.eventTypes],
        reminderStatuses: [...SCHEMA_ENUM_CONFIG.reminderStatuses],
      }
    : await loadAssistantEnumConfig();

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

  const lastUserText = extractLastUserText(messages as unknown[]);
  const isConfirmation = isExplicitUserConfirmation(lastUserText);

  // On confirmation turns, classify intents from earlier messages so the original
  // intents (and their tool sets) are recovered instead of classifying "Sounds good." as unknown.
  const messagesForClassification =
    isConfirmation && messages.length >= 3 ? messages.slice(0, -2) : messages;
  const inferredIntents = await identifyIntents(messagesForClassification, aiModel, generate);
  const confirmationRequired =
    anyIntentRequiresConfirmation(inferredIntents) && !isConfirmation;

  const toolsWithAliases = buildToolSet(userId, {
    mediumSchema,
    optionalMediumSchema,
    eventTypeSchema,
    optionalEventTypeSchema,
    optionalReminderStatusSchema,
    completionStatusSchema,
  }, assistantConversationId);

  // Fetch user context for personalized system prompt
  const userContext = usingMockGenerate
    ? { userName: null, userEmail: "", primaryContactId: null, primaryContactName: null }
    : await getUserContext(userId);
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
  console.log(`[assistant:llm] Model: ${aiModel}`);
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
    model: google(aiModel),
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

  // Suppress intermediate search UIs during confirmation turns.
  // During create/edit flows, contact searches are context resolution,
  // not the user's requested result.
  const isIntermediateSearchUi =
    confirmationRequired &&
    ui !== null &&
    ["contacts", "conversations", "events", "reminders"].includes(ui.kind) &&
    !inferredIntents.some((i) => i.startsWith("search_"));

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
    /\b(going to|will|plan to|about to|shall I)\b/i.test(result.text) &&
    /\b(go ahead|confirm|proceed|changes)\b/i.test(result.text);

  const shouldShowConfirmationButtons =
    confirmationRequired && (hasConfirmationProposal || textIndicatesPlan);

  const actions: AssistantAction[] | undefined = shouldShowConfirmationButtons
    ? [
        { label: "Go ahead", message: "go ahead", style: "primary" },
        { label: "I need changes", message: "No, I need changes", style: "secondary" },
      ]
    : undefined;

  console.log(`[assistant:llm] Final text (${text.length} chars), UI: ${effectiveUi ? effectiveUi.kind : "none"}, actions: ${actions ? actions.length : "none"}`);

  return { text, ui: effectiveUi, actions };
}
