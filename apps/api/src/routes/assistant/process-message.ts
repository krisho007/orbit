import { generateText, InvalidToolInputError, NoSuchToolError } from "ai";
import { google } from "@ai-sdk/google";
import { stepCountIs } from "ai";
import type { ChatMessage, ToolResult, ToolCallMeta, AssistantUi } from "./types";
import { SCHEMA_ENUM_CONFIG, loadAssistantEnumConfig, enumValueSchema } from "./enums";
import { identifyIntent } from "./guardrails";
import { isIntentRequiringConfirmation, isExplicitUserConfirmation } from "./guardrails";
import { MUTATING_TOOL_NAMES, DELETE_TOOL_NAMES, INTENT_TOOL_SETS } from "./constants";
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
  generate: typeof generateText = generateText
): Promise<{ text: string; ui: AssistantUi | null }> {
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

  const inferredIntent = await identifyIntent(messages, aiModel, generate);
  const lastUserText = extractLastUserText(messages as unknown[]);
  const confirmationRequired =
    isIntentRequiringConfirmation(inferredIntent) && !isExplicitUserConfirmation(lastUserText);

  const toolsWithAliases = buildToolSet(userId, {
    mediumSchema,
    optionalMediumSchema,
    eventTypeSchema,
    optionalEventTypeSchema,
    optionalReminderStatusSchema,
    completionStatusSchema,
  });

  // Fetch user context for personalized system prompt
  const userContext = usingMockGenerate
    ? { userName: null, userEmail: "", primaryContactId: null, primaryContactName: null }
    : await getUserContext(userId);
  // Intent-based tool scoping: only expose tools relevant to the classified intent
  const allowedToolNames = new Set(INTENT_TOOL_SETS[inferredIntent] ?? INTENT_TOOL_SETS.unknown);

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
  console.log(`[assistant:llm] Intent: ${inferredIntent}, confirmationRequired=${confirmationRequired}`);
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
    system: buildSystemPrompt(userContext, enumConfig, inferredIntent, confirmationRequired),
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
    stopWhen: stepCountIs(8),
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
        for (const tc of toolCalls) {
          const inputPreview = (tc as any).input
            ? JSON.stringify((tc as any).input).substring(0, 300)
            : "(no input)";
          const toolCallId = typeof (tc as any).toolCallId === "string" ? (tc as any).toolCallId : "n/a";
          const invalid = Boolean((tc as any).invalid);
          const errorSummary = invalid ? summarizeToolCallError((tc as any).error) : "";
          console.log(
            `  ↳ tool=${String((tc as any).toolName)} id=${toolCallId} invalid=${invalid} input=${inputPreview}`
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
        for (const tr of toolResultsList) {
          const resultObj = tr as { output?: ToolResult };
          if (resultObj.output) {
            const typeInfo = resultObj.output.type || "unknown";
            console.log(`  ← result type: ${typeInfo}`);
          }
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
  let text = summarizeUiText(ui, result.text);

  const createContactCalls = toolCalls.filter((call) => call.toolName === "create_contact");
  const contactCreated = toolResults.some(
    (toolResult) =>
      toolResult.output &&
      typeof toolResult.output === "object" &&
      toolResult.output.type === "contact_created"
  );
  if (createContactCalls.length > 0 && !contactCreated) {
    const lastUserText = messages[messages.length - 1]?.content || "";
    text = buildCreateContactFailureText(lastUserText, createContactCalls, toolResults);
  }

  console.log(`[assistant:llm] Final text (${text.length} chars), UI: ${ui ? ui.kind : "none"}`);

  return { text, ui };
}
