/**
 * Single-pass structured output flow using Gemini Flash Lite with few-shot examples.
 *
 * Path 3: Instead of fine-tuning a model, this uses the existing Gemini model with
 * a detailed system prompt containing schema definitions and few-shot examples to
 * produce OrbitModelOutput JSON in a single call. All downstream infrastructure
 * (search execution, action execution, UI building) is shared with Path 2.
 */

import type { ChatMessage, AssistantUi, AssistantAction, AssistantIntent, StatusCallback } from "./types";
import { getModel, getModelName, getProviderApiKeyEnvGuard } from "./model";
import { isExplicitUserConfirmation, isExplicitUserRejection } from "./guardrails";
import { loadAssistantEnumConfig } from "./enums";
import { getUserContext } from "./db-helpers";
import { buildUiFromToolResults, summarizeUiText } from "./ui-builder";
import { parseModelOutput, getActions } from "./finetuned-types";
import type { OrbitModelOutput } from "./finetuned-types";
import { executeSearches } from "./search-executor";
import { executeActions } from "./action-executor";
import { extractLastUserText } from "./error-helpers";
import { buildStructuredSystemPrompt } from "./structured-prompt";
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

export async function processMessageStructured(
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
    console.log(`[assistant:structured] Rejection detected — skipping model call`);
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

  // Build the rich system prompt with schema + few-shot examples
  const systemPrompt = buildStructuredSystemPrompt(userContext, enumConfig, tz);

  // Build messages for the model
  const modelMessages = messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  console.log(`[assistant:structured] Starting single-pass inference (Gemini few-shot)`);
  console.log(`[assistant:structured] User: ${userContext.userName || "(no name)"}, timezone: ${tz}`);

  // Call the Gemini model with the few-shot prompt
  const model = getModel();
  const modelName = getModelName();

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
    console.error(`[assistant:structured] Model call failed:`, err);
    return {
      text: "I'm having trouble processing your request right now. Please try again.",
      ui: null,
    };
  }

  console.log(`[assistant:structured] Raw output (${rawOutput.length} chars): ${rawOutput.substring(0, 300)}`);
  console.log(`[assistant:structured] Usage — model: ${modelName}, input: ${inputTokens ?? "n/a"}, output: ${outputTokens ?? "n/a"}`);

  // Parse the structured output
  let output: OrbitModelOutput;
  try {
    output = parseModelOutput(rawOutput);
  } catch (err) {
    console.error(`[assistant:structured] Failed to parse model output:`, err);
    // Fallback: return raw text as a response (the model might have generated free text)
    return {
      text: rawOutput || "I couldn't process that request. Could you rephrase?",
      ui: null,
      modelName,
      inputTokens,
      outputTokens,
    };
  }

  console.log(`[assistant:structured] Parsed — intents: [${output.intents.join(", ")}], searches: ${output.searches.length}, needs_confirmation: ${output.needs_confirmation}, needs_resolution: ${output.needs_resolution}`);

  const allActions = getActions(output);

  // ── Confirmation flow ─────────────────────────────────────────────
  if (output.needs_confirmation && !isConfirmation) {
    const actions: AssistantAction[] = [
      { label: "Go ahead", message: "go ahead", style: "primary" },
      { label: "I need changes", message: "No, I need changes", style: "secondary" },
    ];

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
