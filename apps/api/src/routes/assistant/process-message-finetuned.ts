/**
 * Single-pass fine-tuned model flow for the Orbit CRM assistant.
 *
 * Instead of multi-step agentic tool calling (classify → search → confirm → execute),
 * this flow calls the fine-tuned model once to get structured JSON output containing
 * intents, search instructions, action parameters, and response text. The API layer
 * then deterministically executes searches and CRUD operations.
 */

import type { ChatMessage, AssistantUi, AssistantAction, AssistantIntent, StatusCallback } from "./types";
import { getFinetunedModel, getFinetunedModelName, getProviderApiKeyEnvGuard } from "./model";
import { isExplicitUserConfirmation, isExplicitUserRejection, anyIntentRequiresConfirmation } from "./guardrails";
import { SCHEMA_ENUM_CONFIG, loadAssistantEnumConfig } from "./enums";
import { getUserContext } from "./db-helpers";
import { buildUiFromToolResults, summarizeUiText } from "./ui-builder";
import { parseModelOutput, getActions } from "./finetuned-types";
import type { OrbitModelOutput } from "./finetuned-types";
import { executeSearches } from "./search-executor";
import { executeActions } from "./action-executor";
import type { ActionResult } from "./action-executor";
import { formatToday } from "./types";
import { extractLastUserText } from "./error-helpers";
import { eq, and, desc } from "drizzle-orm";
import { db, assistantMessages } from "../../db";
import { ASSISTANT_INTENTS } from "./constants";

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

export async function processMessageFinetuned(
  userId: string,
  messages: ChatMessage[],
  assistantConversationId?: string,
  onStatus?: StatusCallback,
  timezone?: string
): Promise<{
  text: string;
  ui: AssistantUi | null;
  actions?: AssistantAction[];
  cachedIntents?: AssistantIntent[];
  modelName?: string;
  inputTokens?: number;
  outputTokens?: number;
}> {
  const apiKeyGuard = getProviderApiKeyEnvGuard();
  if (!apiKeyGuard.configured) {
    return { text: apiKeyGuard.message, ui: null };
  }

  const lastUserText = extractLastUserText(messages as unknown[]);
  const isConfirmation = isExplicitUserConfirmation(lastUserText);
  const isRejection = isExplicitUserRejection(lastUserText);

  // Hard short-circuit: rejection needs no model call
  if (isRejection) {
    let rejectionCachedIntents: AssistantIntent[] | null = null;
    if (assistantConversationId) {
      rejectionCachedIntents = await loadCachedIntents(assistantConversationId);
    }
    console.log(`[assistant:finetuned] Rejection detected — skipping model call`);
    return {
      text: "Sure, what would you like to change?",
      ui: null,
      cachedIntents: rejectionCachedIntents ?? undefined,
    };
  }

  onStatus?.("Processing...");

  // Load context in parallel
  const tz = timezone || "UTC";
  const [enumConfig, userContext] = await Promise.all([
    loadAssistantEnumConfig(),
    getUserContext(userId),
  ]);

  // Build system prompt for the fine-tuned model (much simpler than the agentic one)
  const systemPrompt = buildFinetunedSystemPrompt(userContext, enumConfig, tz);

  // Build messages for the model
  const modelMessages = messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  console.log(`[assistant:finetuned] Starting single-pass inference`);
  console.log(`[assistant:finetuned] User: ${userContext.userName || "(no name)"}, timezone: ${tz}`);

  // Call the fine-tuned model
  const model = getFinetunedModel();
  const modelName = getFinetunedModelName();

  let rawOutput: string;
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;

  try {
    const { generateText } = await import("ai");
    const result = await generateText({
      model,
      system: systemPrompt,
      messages: modelMessages,
    });

    rawOutput = result.text;
    inputTokens = result.usage?.inputTokens;
    outputTokens = result.usage?.outputTokens;
  } catch (err) {
    console.error(`[assistant:finetuned] Model call failed:`, err);
    return {
      text: "I'm having trouble processing your request right now. Please try again.",
      ui: null,
    };
  }

  console.log(`[assistant:finetuned] Raw output (${rawOutput.length} chars): ${rawOutput.substring(0, 300)}`);

  // Parse the structured output
  let output: OrbitModelOutput;
  try {
    output = parseModelOutput(rawOutput);
  } catch (err) {
    console.error(`[assistant:finetuned] Failed to parse model output:`, err);
    // Fallback: return raw text as a response (the model might have generated free text)
    return {
      text: rawOutput || "I couldn't process that request. Could you rephrase?",
      ui: null,
      modelName,
      inputTokens,
      outputTokens,
    };
  }

  console.log(`[assistant:finetuned] Parsed — intents: [${output.intents.join(", ")}], searches: ${output.searches.length}, needs_confirmation: ${output.needs_confirmation}, needs_resolution: ${output.needs_resolution}`);

  const allActions = getActions(output);

  // ── Confirmation flow ─────────────────────────────────────────────
  // If the model says this needs confirmation and it's not a confirmation turn,
  // return the response text with confirmation buttons
  if (output.needs_confirmation && !isConfirmation) {
    const actions: AssistantAction[] = [
      { label: "Go ahead", message: "go ahead", style: "primary" },
      { label: "I need changes", message: "No, I need changes", style: "secondary" },
    ];

    // Build a preview UI if possible (confirmation kind)
    let ui: AssistantUi | null = null;
    if (allActions.length > 0) {
      const firstAction = allActions[0]!;
      ui = {
        kind: "confirmation",
        action: output.response,
        entityType: firstAction.entity_type,
        details: firstAction.params as Record<string, unknown>,
      };
    }

    return {
      text: output.response,
      ui,
      actions,
      cachedIntents: output.intents as AssistantIntent[],
      modelName,
      inputTokens,
      outputTokens,
    };
  }

  // ── Search resolution ─────────────────────────────────────────────
  let searchResults = new Map();
  if (output.searches.length > 0) {
    onStatus?.("Searching...");
    searchResults = await executeSearches(userId, output.searches);

    // Check for ambiguous results that need user resolution
    for (const [, search] of searchResults) {
      if (search.ambiguous && search.candidates.length > 1) {
        // Return a selection UI
        const selectionUi: AssistantUi = {
          kind: "selection",
          prompt: `I found multiple matching ${search.entity_type}s. Please pick one.`,
          options: search.candidates.slice(0, 5).map((c: { id: string; displayName: string }) => ({
            id: c.id,
            entityKind: search.entity_type as any,
            title: c.displayName,
            subtitle: null,
            selectMessage: `Use contact ID ${c.id} as the selected context for this request.`,
          })),
        };

        return {
          text: `I found multiple matching ${search.entity_type}s. Please pick one.`,
          ui: selectionUi,
          cachedIntents: output.intents as AssistantIntent[],
          modelName,
          inputTokens,
          outputTokens,
        };
      }
    }

    // Check for failed resolutions (no matches found)
    for (const search of output.searches) {
      const resolved = searchResults.get(search.id);
      if (resolved && search.purpose === "resolve_participant" && !resolved.best_match) {
        return {
          text: `I couldn't find a contact matching "${search.query}". Would you like to create a new contact?`,
          ui: null,
          cachedIntents: output.intents as AssistantIntent[],
          modelName,
          inputTokens,
          outputTokens,
        };
      }
    }
  }

  // ── For search-only intents, return display results ────────────────
  const isSearchOnly = output.intents.every(
    (i) => i.startsWith("search_") || i === "unknown"
  );
  if (isSearchOnly && output.searches.length > 0) {
    // Build UI from the search results directly
    const displaySearch = output.searches.find((s) => s.purpose === "display_results");
    if (displaySearch) {
      const resolved = searchResults.get(displaySearch.id);
      if (resolved) {
        const ui = buildSearchDisplayUi(resolved, displaySearch);
        const text = summarizeUiText(ui, output.response);
        return {
          text,
          ui,
          cachedIntents: output.intents as AssistantIntent[],
          modelName,
          inputTokens,
          outputTokens,
        };
      }
    }

    // Fallback: return the model's response text with no UI
    return {
      text: output.response,
      ui: null,
      cachedIntents: output.intents as AssistantIntent[],
      modelName,
      inputTokens,
      outputTokens,
    };
  }

  // ── Execute actions ───────────────────────────────────────────────
  if (allActions.length > 0) {
    onStatus?.("Executing...");
    const actionResults = await executeActions(
      userId,
      allActions,
      searchResults,
      tz,
      assistantConversationId
    );

    // Build UI from action results (reuse existing buildUiFromToolResults)
    const toolResults = actionResults.map((r) => ({ output: r.result }));
    const ui = buildUiFromToolResults(toolResults);
    const text = summarizeUiText(ui, output.response);

    return {
      text,
      ui,
      cachedIntents: output.intents as AssistantIntent[],
      modelName,
      inputTokens,
      outputTokens,
    };
  }

  // ── No actions, no searches — just return the response text ───────
  return {
    text: output.response,
    ui: null,
    cachedIntents: output.intents as AssistantIntent[],
    modelName,
    inputTokens,
    outputTokens,
  };
}

// ── System prompt for fine-tuned model ──────────────────────────────

function buildFinetunedSystemPrompt(
  userContext: { userName: string | null; userEmail: string; primaryContactId: string | null; primaryContactName: string | null },
  enumConfig: { conversationMediums: string[]; eventTypes: string[]; reminderStatuses: string[] },
  timezone: string
): string {
  const now = new Date();
  const todayStr = formatToday(now, timezone);

  return [
    "You are the Orbit CRM assistant. Output valid JSON matching the OrbitModelOutput schema.",
    "",
    `User: ${userContext.userName || userContext.userEmail} | Timezone: ${timezone} | ${todayStr}`,
    userContext.primaryContactId
      ? `User's contact: ${userContext.primaryContactName} (${userContext.primaryContactId})`
      : "",
    "",
    `Mediums: ${enumConfig.conversationMediums.join(", ")}`,
    `Event types: ${enumConfig.eventTypes.join(", ")}`,
    `Reminder statuses: ${enumConfig.reminderStatuses.join(", ")}`,
    "",
    "For time fields use relative tokens: NOW, TODAY_HH:MM, TOMORROW_HH:MM, YESTERDAY_HH:MM, +Nd_HH:MM, -Nd_HH:MM",
    "NEVER include database IDs in the response text.",
  ]
    .filter((line) => line !== undefined)
    .join("\n");
}

// ── Build display UI from search results ────────────────────────────

function buildSearchDisplayUi(
  resolved: { entity_type: string; candidates: Array<{ id: string; displayName: string }> },
  search: { entity_type: string }
): AssistantUi | null {
  if (resolved.candidates.length === 0) return null;

  switch (search.entity_type) {
    case "contact":
      return {
        kind: "contacts",
        count: resolved.candidates.length,
        contacts: resolved.candidates.map((c) => ({
          id: c.id,
          displayName: c.displayName,
        })),
      };
    default:
      return null;
  }
}
