/**
 * Single-pass structured output flow using Gemini Flash Lite with few-shot examples.
 *
 * Path 3: Instead of fine-tuning a model, this uses the existing Gemini model with
 * a detailed system prompt containing schema definitions and few-shot examples to
 * produce OrbitModelOutput JSON in a single call. All downstream infrastructure
 * (search execution, action execution, UI building) is shared with Path 2.
 */

import type { ChatMessage, AssistantUi, AssistantAction, AssistantIntent, StatusCallback, ToolResult } from "./types";
import { getModel, getModelName, getProviderApiKeyEnvGuard, supportsStructuredOutput } from "./model";
import { isExplicitUserConfirmation, isExplicitUserRejection, parseUserSelection, isSkipContactSelection, isCreateNewContactSelection, isShowMoreDisambiguation } from "./guardrails";
import { loadAssistantEnumConfig } from "./enums";
import { getUserContext } from "./db-helpers";
import { buildUiFromToolResults, summarizeUiText } from "./ui-builder";
import { orbitModelOutputSchema, parseModelOutput, getActions } from "./finetuned-types";
import type { OrbitModelOutput, ActionInstruction, SearchInstruction } from "./finetuned-types";
import { executeSearches } from "./search-executor";
import type { ResolvedSearch } from "./search-executor";
import { executeActions } from "./action-executor";
import { listConversationsByContacts } from "./tools/conversations";
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

const DISAMBIGUATION_PAGE_SIZE = 5;

type CachedOutput = {
  intents: string[];
  actions: ActionInstruction[];
  searches: SearchInstruction[];
  response: string;
  // Disambiguation state: all search results keyed by search ID
  resolvedSearches?: Record<string, ResolvedSearch>;
  // Search IDs still needing user selection
  pendingAmbiguous?: string[];
  // Current offset into candidates for "Show more" pagination
  disambiguationOffset?: number;
};

// ── Participant fallback: when resolve_participant searches fail ─────

type ParticipantFallback = {
  fallbackActions: ActionInstruction[];
  fallbackSearches: SearchInstruction[];
  fallbackIntents: string[];
  fallbackResponse: string;
  failedSearchQueries: string[];
};

/**
 * When a resolve_participant search for a contact returns no match, instead of
 * dead-ending, synthesize a create_contact action and rewrite participant_refs
 * so the original actions can still execute.
 *
 * Does NOT trigger for resolve_target failures (e.g. "update Alice's phone"
 * when Alice is not found — dead-end is appropriate there).
 */
function buildParticipantFallback(
  searches: SearchInstruction[],
  searchResults: Map<string, { best_match: { id: string; displayName: string } | null; [key: string]: unknown }>,
  actions: ActionInstruction[],
  intents: string[],
  response: string
): ParticipantFallback | null {
  // Find failed resolve_participant contact searches
  const failedParticipantSearches = searches.filter((s) => {
    if (s.entity_type !== "contact" || s.purpose !== "resolve_participant") return false;
    const resolved = searchResults.get(s.id);
    return resolved && !resolved.best_match;
  });

  if (failedParticipantSearches.length === 0) return null;

  // Build a set of names already being created by the original actions
  const existingCreateNames = new Set(
    actions
      .filter((a) => a.operation === "create" && a.entity_type === "contact")
      .map((a) => (a.params.displayName as string || "").toLowerCase())
  );

  const fallbackActions: ActionInstruction[] = [];
  const rewriteMap = new Map<string, string>(); // "s1.best_match" -> "created_contact_s1.best_match"
  const failedSearchQueries: string[] = [];

  for (const search of failedParticipantSearches) {
    const name = search.query;
    failedSearchQueries.push(name);

    if (existingCreateNames.has(name.toLowerCase())) {
      // Original actions already create this contact — just rewrite refs
      rewriteMap.set(`${search.id}.best_match`, "created_contact.best_match");
    } else {
      // Synthesize a create_contact action
      fallbackActions.push({
        operation: "create",
        entity_type: "contact",
        params: { displayName: name, _fallbackSearchId: search.id },
      });
      rewriteMap.set(`${search.id}.best_match`, `created_contact_${search.id}.best_match`);
    }
  }

  // Rewrite participant_refs in all original actions
  const rewrittenActions = actions.map((a) => {
    if (!a.participant_refs || a.participant_refs.length === 0) return a;
    const newRefs = a.participant_refs.map((ref) => rewriteMap.get(ref) ?? ref);
    return { ...a, participant_refs: newRefs };
  });

  // Remove failed searches from the list (not needed on replay)
  const failedIds = new Set(failedParticipantSearches.map((s) => s.id));
  const cleanedSearches = searches.filter((s) => !failedIds.has(s.id));

  // Combine: fallback create_contact actions first, then rewritten original actions
  const allActions = [...fallbackActions, ...rewrittenActions];

  // Add create_contact intent if not already present
  const fallbackIntents = [...intents];
  if (!fallbackIntents.includes("create_contact")) {
    fallbackIntents.unshift("create_contact");
  }

  const nameList = failedSearchQueries.join(", ");
  const fallbackResponse = `I couldn't find ${nameList} in your contacts. I'll create ${failedSearchQueries.length === 1 ? "a new contact" : "new contacts"} and proceed with the original request.`;

  return {
    fallbackActions: allActions,
    fallbackSearches: cleanedSearches,
    fallbackIntents,
    fallbackResponse,
    failedSearchQueries,
  };
}

// ── Disambiguation action buttons: show more / skip / create new ────

function buildDisambiguationActions(
  search: SearchInstruction,
  hasMore: boolean,
): AssistantAction[] | undefined {
  const actions: AssistantAction[] = [];
  if (hasMore) {
    actions.push({ label: "Show more", message: "Show more", style: "secondary" });
  }
  if (search.purpose === "resolve_participant" && search.entity_type === "contact") {
    actions.push(
      { label: "None of these", message: "None of these — skip contact", style: "secondary" },
      { label: `Create "${search.query}"`, message: `Create a new contact named "${search.query}"`, style: "secondary" },
    );
  }
  return actions.length > 0 ? actions : undefined;
}

async function loadCachedOutput(assistantConversationId: string): Promise<CachedOutput | null> {
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
    // Load cached output if it has actions OR searches (search-only intents
    // like "conversations with Vikram" have actions=[] but need the cache
    // for disambiguation flow).
    const co = parsed?._cachedOutput;
    if (co && (co.actions?.length > 0 || co.searches?.length > 0)) {
      return co as CachedOutput;
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
  cachedOutput?: CachedOutput;
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

  // ── Selection shortcut: user picked from disambiguation list ──────
  // Also handles "None of these" (skip) and "Create new contact" actions
  const selection = parseUserSelection(lastUserText);
  const isSkip = isSkipContactSelection(lastUserText);
  const isCreateNew = isCreateNewContactSelection(lastUserText);
  const isShowMore = isShowMoreDisambiguation(lastUserText);

  if ((selection || isSkip || isCreateNew || isShowMore) && assistantConversationId) {
    const cached = await loadCachedOutput(assistantConversationId);
    if (cached && cached.resolvedSearches && cached.pendingAmbiguous && cached.pendingAmbiguous.length > 0) {
      const currentSearchId = cached.pendingAmbiguous[0]!;
      const currentResolved = cached.resolvedSearches[currentSearchId];

      // ── "Show more" pagination — page through cached candidates ──
      if (isShowMore) {
        if (currentResolved && currentResolved.candidates.length > 0) {
          const currentSearch = cached.searches.find((s) => s.id === currentSearchId);
          const newOffset = (cached.disambiguationOffset ?? 0) + DISAMBIGUATION_PAGE_SIZE;
          const pageSlice = currentResolved.candidates.slice(newOffset, newOffset + DISAMBIGUATION_PAGE_SIZE);
          const total = currentResolved.candidates.length;
          const hasMore = newOffset + DISAMBIGUATION_PAGE_SIZE < total;
          const updatedCached: CachedOutput = { ...cached, disambiguationOffset: newOffset };
          return {
            text: `Showing results ${newOffset + 1}–${newOffset + pageSlice.length} of ${total}.`,
            ui: {
              kind: "selection" as const,
              prompt: "Please pick one.",
              options: pageSlice.map((c) => ({
                id: c.id,
                entityKind: currentResolved.entity_type as any,
                title: c.displayName,
                subtitle: null,
                selectMessage: `Use ${currentResolved.entity_type} ID ${c.id} as the selected context for this request.`,
              })),
              totalCount: total,
            },
            actions: currentSearch ? buildDisambiguationActions(currentSearch, hasMore) : undefined,
            cachedIntents: cached.intents as AssistantIntent[],
            cachedOutput: updatedCached,
          };
        }
      }

      if (selection) {
        // Regular selection — update best_match to the chosen candidate
        console.log(`[assistant:structured] Selection detected — entity ${selection.entityId}`);
        if (currentResolved) {
          const selectedCandidate = currentResolved.candidates.find((c) => c.id === selection.entityId);
          if (selectedCandidate) {
            currentResolved.best_match = { id: selectedCandidate.id, displayName: selectedCandidate.displayName };
            currentResolved.ambiguous = false;
          }
        }
      } else {
        // Skip or Create New — clear best_match, no contact selected
        console.log(`[assistant:structured] ${isSkip ? "Skip" : "Create new"} detected for search ${currentSearchId}`);
        if (currentResolved) {
          currentResolved.best_match = null;
          currentResolved.ambiguous = false;
        }
        if (isSkip) {
          // Mark purpose as "skipped" so buildParticipantFallback won't
          // try to create a contact for it
          const searchInstruction = cached.searches.find((s) => s.id === currentSearchId);
          if (searchInstruction) searchInstruction.purpose = "skipped";
        }
        // For isCreateNew: leave purpose as "resolve_participant" so
        // buildParticipantFallback will synthesize a create_contact action
      }

      // Remove from pending
      const remainingPending = cached.pendingAmbiguous.slice(1);

      if (remainingPending.length > 0) {
        // More ambiguous searches to resolve — show next selection UI
        const nextSearchId = remainingPending[0]!;
        const nextResolved = cached.resolvedSearches[nextSearchId];

        if (nextResolved && nextResolved.candidates.length > 0) {
          const nextSearch = cached.searches.find((s) => s.id === nextSearchId);
          const pageSlice = nextResolved.candidates.slice(0, DISAMBIGUATION_PAGE_SIZE);
          const total = nextResolved.candidates.length;
          const hasMore = DISAMBIGUATION_PAGE_SIZE < total;
          const updatedCached: CachedOutput = {
            ...cached,
            resolvedSearches: cached.resolvedSearches,
            pendingAmbiguous: remainingPending,
            disambiguationOffset: 0,
          };
          return {
            text: `I found multiple matching ${nextResolved.entity_type}s. Please pick one.`,
            ui: {
              kind: "selection" as const,
              prompt: `I found multiple matching ${nextResolved.entity_type}s. Please pick one.`,
              options: pageSlice.map((c) => ({
                id: c.id,
                entityKind: nextResolved.entity_type as any,
                title: c.displayName,
                subtitle: null,
                selectMessage: `Use ${nextResolved.entity_type} ID ${c.id} as the selected context for this request.`,
              })),
              totalCount: total,
            },
            actions: nextSearch ? buildDisambiguationActions(nextSearch, hasMore) : undefined,
            cachedIntents: cached.intents as AssistantIntent[],
            cachedOutput: updatedCached,
          };
        }
      }

      // No more pending — check for participant fallback (0-match searches)
      const searchResultsMap = new Map(Object.entries(cached.resolvedSearches));
      const participantFallback = buildParticipantFallback(
        cached.searches,
        searchResultsMap as Map<string, { best_match: { id: string; displayName: string } | null; [key: string]: unknown }>,
        cached.actions,
        cached.intents,
        cached.response
      );
      if (participantFallback) {
        const fbItems = buildConfirmationItems(
          participantFallback.fallbackActions,
          searchResultsMap as Map<string, ResolvedSearch>,
          cached.searches
        );
        const fallbackCached: CachedOutput = {
          intents: participantFallback.fallbackIntents,
          actions: participantFallback.fallbackActions,
          searches: participantFallback.fallbackSearches,
          response: participantFallback.fallbackResponse,
          resolvedSearches: cached.resolvedSearches,
        };
        return {
          text: participantFallback.fallbackResponse,
          ui: {
            kind: "confirmation",
            action: participantFallback.fallbackResponse,
            entityType: fbItems[0]?.entityType ?? "contact",
            details: fbItems[0]?.details ?? {},
            items: fbItems.length > 1 ? fbItems : undefined,
          },
          actions: [
            { label: "Go ahead", message: "go ahead", style: "primary" },
            { label: "I need changes", message: "No, I need changes", style: "secondary" },
          ],
          cachedIntents: participantFallback.fallbackIntents as AssistantIntent[],
          cachedOutput: fallbackCached,
        };
      }

      // Check for failed resolve_target — dead-end
      for (const search of cached.searches) {
        const resolved = cached.resolvedSearches[search.id];
        if (resolved && search.purpose === "resolve_target" && !resolved.best_match) {
          return {
            text: `I couldn't find a ${search.entity_type} matching "${search.query}". Would you like to try a different name?`,
            ui: null,
            cachedIntents: cached.intents as AssistantIntent[],
          };
        }
      }

      // For search-only intents (no actions), show display_results UI
      // instead of a confirmation card. This handles the case where a
      // contact resolve_target was disambiguated before showing conversation/
      // event/reminder display results.
      const isSearchOnlyIntent = cached.intents.every(
        (i) => typeof i === "string" && (i.startsWith("search_") || i === "unknown")
      );
      if (isSearchOnlyIntent && cached.actions.length === 0) {
        const displaySearch = cached.searches.find((s) => s.purpose === "display_results");
        if (displaySearch) {
          // Check if there's a resolved contact from a resolve_target search
          // so we can re-execute the display search using the disambiguated contact.
          const resolveSearch = cached.searches.find(
            (s) => s.purpose === "resolve_target" && s.entity_type === "contact"
          );
          const resolvedContact = resolveSearch
            ? cached.resolvedSearches[resolveSearch.id]?.best_match
            : null;

          // Re-execute the display search with the resolved contact ID.
          // The original search ran in parallel and may have picked a
          // different contact via findBestContactMatch, giving stale results.
          if (resolvedContact) {
            const freshResult = await reExecuteDisplaySearch(
              userId,
              displaySearch as SearchInstruction,
              resolvedContact.id
            );
            if (freshResult) {
              const ui = buildUiFromToolResults([{ output: freshResult }]);
              const text = summarizeUiText(ui, cached.response);
              return {
                text,
                ui,
                cachedIntents: cached.intents as AssistantIntent[],
              };
            }
          }

          // Fall through to cached results if no contact to resolve with
          const displayResolved = cached.resolvedSearches[displaySearch.id];
          if (displayResolved) {
            const ui = buildSearchDisplayUi(
              displayResolved as ResolvedSearch,
              displaySearch as SearchInstruction
            );
            const text = summarizeUiText(ui, cached.response);
            return {
              text,
              ui,
              cachedIntents: cached.intents as AssistantIntent[],
            };
          }
        }
      }

      // All resolved — show confirmation card with enriched names
      const cachedSearchMap = new Map(Object.entries(cached.resolvedSearches));
      let disambiguatedUi: AssistantUi | null = null;
      if (cached.actions.length > 0) {
        const items = buildConfirmationItems(
          cached.actions,
          cachedSearchMap as Map<string, ResolvedSearch>,
          cached.searches
        );
        disambiguatedUi = {
          kind: "confirmation",
          action: cached.response,
          entityType: items[0]!.entityType,
          details: items[0]!.details,
          items: items.length > 1 ? items : undefined,
        };
      }

      const updatedCached: CachedOutput = {
        ...cached,
        resolvedSearches: cached.resolvedSearches,
        pendingAmbiguous: [],
      };
      return {
        text: cached.response,
        ui: disambiguatedUi,
        actions: [
          { label: "Go ahead", message: "go ahead", style: "primary" },
          { label: "I need changes", message: "No, I need changes", style: "secondary" },
        ],
        cachedIntents: cached.intents as AssistantIntent[],
        cachedOutput: updatedCached,
      };
    }
  }

  // ── Confirmation shortcut: replay cached actions without re-calling LLM ──
  if (isConfirmation && assistantConversationId) {
    const cached = await loadCachedOutput(assistantConversationId);
    if (cached && cached.actions.length > 0) {
      console.log(`[assistant:structured] Confirmation detected — executing ${cached.actions.length} cached action(s)`);
      const tz = timezone || "UTC";

      let searchResults = new Map<string, ResolvedSearch>();

      if (cached.resolvedSearches) {
        // Use pre-resolved searches from disambiguation flow — no re-running
        console.log(`[assistant:structured] Using ${Object.keys(cached.resolvedSearches).length} pre-resolved search(es) from cache`);
        searchResults = new Map(Object.entries(cached.resolvedSearches));
      } else if (cached.searches.length > 0) {
        // Legacy/backward compat: re-run searches
        onStatus?.("Searching...");
        searchResults = await executeSearches(userId, cached.searches);

        // Check for ambiguous results
        for (const [searchId, search] of searchResults) {
          if (search.ambiguous && search.candidates.length > 1) {
            const searchInstruction = cached.searches.find((s) => s.id === searchId);
            const pageSlice = search.candidates.slice(0, DISAMBIGUATION_PAGE_SIZE);
            const total = search.candidates.length;
            const hasMore = DISAMBIGUATION_PAGE_SIZE < total;
            return {
              text: `I found multiple matching ${search.entity_type}s. Please pick one.`,
              ui: {
                kind: "selection" as const,
                prompt: `I found multiple matching ${search.entity_type}s. Please pick one.`,
                options: pageSlice.map((c: { id: string; displayName: string }) => ({
                  id: c.id,
                  entityKind: search.entity_type as any,
                  title: c.displayName,
                  subtitle: null,
                  selectMessage: `Use contact ID ${c.id} as the selected context for this request.`,
                })),
                totalCount: total,
              },
              actions: searchInstruction ? buildDisambiguationActions(searchInstruction, hasMore) : undefined,
              cachedIntents: cached.intents as AssistantIntent[],
            };
          }
        }

        // Check for failed resolve_participant — try fallback instead of dead-ending
        const participantFallback = buildParticipantFallback(
          cached.searches,
          searchResults as Map<string, { best_match: { id: string; displayName: string } | null; [key: string]: unknown }>,
          cached.actions,
          cached.intents,
          cached.response
        );
        if (participantFallback) {
          const fbItems2 = buildConfirmationItems(
            participantFallback.fallbackActions,
            searchResults as Map<string, ResolvedSearch>,
            cached.searches
          );
          const fallbackCached: CachedOutput = {
            intents: participantFallback.fallbackIntents,
            actions: participantFallback.fallbackActions,
            searches: participantFallback.fallbackSearches,
            response: participantFallback.fallbackResponse,
          };
          return {
            text: participantFallback.fallbackResponse,
            ui: {
              kind: "confirmation",
              action: participantFallback.fallbackResponse,
              entityType: fbItems2[0]?.entityType ?? "contact",
              details: fbItems2[0]?.details ?? {},
              items: fbItems2.length > 1 ? fbItems2 : undefined,
            },
            actions: [
              { label: "Go ahead", message: "go ahead", style: "primary" },
              { label: "I need changes", message: "No, I need changes", style: "secondary" },
            ],
            cachedIntents: participantFallback.fallbackIntents as AssistantIntent[],
            cachedOutput: fallbackCached,
          };
        }

        // Check for failed resolve_target — dead-end is appropriate here
        for (const search of cached.searches) {
          const resolved = searchResults.get(search.id);
          if (resolved && search.purpose === "resolve_target" && !resolved.best_match) {
            return {
              text: `I couldn't find a ${search.entity_type} matching "${search.query}". Would you like to try a different name?`,
              ui: null,
              cachedIntents: cached.intents as AssistantIntent[],
            };
          }
        }
      }

      onStatus?.("Executing...");
      const actionResults = await executeActions(
        userId,
        cached.actions,
        searchResults,
        tz,
        assistantConversationId
      );

      // Check for execution failures
      const failedActions = actionResults.filter((r) => !r.success);
      if (failedActions.length > 0) {
        if (failedActions.length === actionResults.length) {
          // All failed
          const errorMsg = failedActions[0]?.result?.message || "Unknown error";
          console.error(`[assistant:structured] All actions failed:`, errorMsg);
          return {
            text: `Something went wrong: ${errorMsg}. Please try again.`,
            ui: null,
            cachedIntents: cached.intents as AssistantIntent[],
          };
        }
        // Partial failure — show successes + report failures
        const toolResults = actionResults.filter((r) => r.success).map((r) => ({ output: r.result }));
        const ui = buildUiFromToolResults(toolResults);
        const failureNotes = failedActions.map((f) =>
          `Failed to ${f.action.operation} ${f.action.entity_type}: ${f.result?.message || "Unknown error"}`
        ).join(". ");
        const text = `${summarizeUiText(ui, cached.response)} However, ${failureNotes}.`;
        return {
          text,
          ui,
          cachedIntents: cached.intents as AssistantIntent[],
        };
      }

      const toolResults = actionResults.filter((r) => r.success).map((r) => ({ output: r.result }));
      const ui = buildUiFromToolResults(toolResults);
      const text = summarizeUiText(ui, cached.response);

      return {
        text,
        ui,
        cachedIntents: cached.intents as AssistantIntent[],
      };
    }
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

  // Call the model with the few-shot prompt (retry up to 3 times on parse failures)
  const model = getModel();
  const modelName = getModelName();

  console.log(`[assistant:structured] Starting single-pass inference (${modelName})`);
  console.log(`[assistant:structured] User: ${userContext.userName || "(no name)"}, timezone: ${tz}`);

  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  let output: OrbitModelOutput;

  const inferenceStart = Date.now();
  if (supportsStructuredOutput()) {
    try {
      const { generateObject } = await import("ai");
      const result = await generateObject({
        model,
        schema: orbitModelOutputSchema,
        schemaName: "OrbitModelOutput",
        system: systemPrompt,
        messages: modelMessages,
        maxOutputTokens: 2048,
      });

      output = result.object;
      inputTokens = result.usage?.inputTokens;
      outputTokens = result.usage?.outputTokens;
    } catch (err) {
      console.error(`[assistant:structured] generateObject failed:`, err);
      return {
        text: "I had trouble understanding how to process that. Could you try rephrasing your request?",
        ui: null,
        modelName,
      };
    }
  } else {
    // Fallback: generateText + manual JSON parsing (for providers without JSON schema support)
    try {
      const { generateText } = await import("ai");
      const result = await generateText({
        model,
        system: systemPrompt,
        messages: modelMessages,
        maxOutputTokens: 2048,
      });

      inputTokens = result.usage?.inputTokens;
      outputTokens = result.usage?.outputTokens;
      output = parseModelOutput(result.text);
    } catch (err) {
      console.error(`[assistant:structured] generateText/parse failed:`, err);
      return {
        text: "I had trouble understanding how to process that. Could you try rephrasing your request?",
        ui: null,
        modelName,
      };
    }
  }

  console.log(`[assistant:structured] Usage — model: ${modelName}, time: ${((Date.now() - inferenceStart) / 1000).toFixed(1)}s, input: ${inputTokens ?? "n/a"}, output: ${outputTokens ?? "n/a"}`);

  console.log(`[assistant:structured] Parsed — intents: [${output.intents.join(", ")}], searches: ${output.searches.length}, needs_confirmation: ${output.needs_confirmation}, needs_resolution: ${output.needs_resolution}`);

  const allActions = getActions(output);

  // ── Search resolution (BEFORE confirmation) ─────────────────────
  // Execute all searches upfront so we can detect ambiguity before showing
  // the confirmation card. This prevents the bug where confirmation appears
  // before disambiguation.
  let searchResults = new Map<string, ResolvedSearch>();
  if (output.searches.length > 0) {
    onStatus?.("Searching...");
    searchResults = await executeSearches(userId, output.searches);

    // Log search results for debugging
    for (const [searchId, search] of searchResults) {
      console.log(`[assistant:structured] Search ${searchId}: entity=${search.entity_type}, purpose=${search.purpose}, candidates=${search.candidates.length}, ambiguous=${search.ambiguous}, bestMatch=${search.best_match?.displayName ?? "none"}`);
    }

    // Collect ambiguous search IDs
    const ambiguousSearchIds: string[] = [];
    for (const [searchId, search] of searchResults) {
      if (search.ambiguous && search.candidates.length > 1) {
        ambiguousSearchIds.push(searchId);
      }
    }

    // If any searches are ambiguous, show selection UI for the first one
    // and cache the full state so subsequent selections can proceed
    if (ambiguousSearchIds.length > 0) {
      const firstAmbiguousId = ambiguousSearchIds[0]!;
      const firstAmbiguous = searchResults.get(firstAmbiguousId)!;
      const ambiguousSearch = output.searches.find((s) => s.id === firstAmbiguousId);

      // Build resolvedSearches record from the Map
      const resolvedSearches: Record<string, ResolvedSearch> = {};
      for (const [id, resolved] of searchResults) {
        resolvedSearches[id] = resolved;
      }

      const pageSlice = firstAmbiguous.candidates.slice(0, DISAMBIGUATION_PAGE_SIZE);
      const total = firstAmbiguous.candidates.length;
      const hasMore = DISAMBIGUATION_PAGE_SIZE < total;

      const cachedOutput: CachedOutput = {
        intents: output.intents,
        actions: allActions,
        searches: output.searches,
        response: output.response,
        resolvedSearches,
        pendingAmbiguous: ambiguousSearchIds,
        disambiguationOffset: 0,
      };

      return {
        text: `I found multiple matching ${firstAmbiguous.entity_type}s. Please pick one.`,
        ui: {
          kind: "selection" as const,
          prompt: `I found multiple matching ${firstAmbiguous.entity_type}s. Please pick one.`,
          options: pageSlice.map((c) => ({
            id: c.id,
            entityKind: firstAmbiguous.entity_type as any,
            title: c.displayName,
            subtitle: null,
            selectMessage: `Use ${firstAmbiguous.entity_type} ID ${c.id} as the selected context for this request.`,
          })),
          totalCount: total,
        },
        actions: ambiguousSearch ? buildDisambiguationActions(ambiguousSearch, hasMore) : undefined,
        cachedIntents: output.intents as AssistantIntent[],
        cachedOutput,
        modelName,
        inputTokens,
        outputTokens,
      };
    }

    // Check for failed resolve_participant — try fallback instead of dead-ending
    const participantFallback = buildParticipantFallback(
      output.searches,
      searchResults as Map<string, { best_match: { id: string; displayName: string } | null; [key: string]: unknown }>,
      allActions,
      output.intents,
      output.response
    );
    if (participantFallback) {
      const fbItems3 = buildConfirmationItems(
        participantFallback.fallbackActions,
        searchResults as Map<string, ResolvedSearch>,
        output.searches
      );
      // Build resolvedSearches record for cache
      const resolvedSearches: Record<string, ResolvedSearch> = {};
      for (const [id, resolved] of searchResults) {
        resolvedSearches[id] = resolved;
      }
      const fallbackCached: CachedOutput = {
        intents: participantFallback.fallbackIntents,
        actions: participantFallback.fallbackActions,
        searches: participantFallback.fallbackSearches,
        response: participantFallback.fallbackResponse,
        resolvedSearches,
      };
      return {
        text: participantFallback.fallbackResponse,
        ui: {
          kind: "confirmation",
          action: participantFallback.fallbackResponse,
          entityType: fbItems3[0]?.entityType ?? "contact",
          details: fbItems3[0]?.details ?? {},
          items: fbItems3.length > 1 ? fbItems3 : undefined,
        },
        actions: [
          { label: "Go ahead", message: "go ahead", style: "primary" },
          { label: "I need changes", message: "No, I need changes", style: "secondary" },
        ],
        cachedIntents: participantFallback.fallbackIntents as AssistantIntent[],
        cachedOutput: fallbackCached,
        modelName,
        inputTokens,
        outputTokens,
      };
    }

    // Check for failed resolve_target — dead-end is appropriate here
    for (const search of output.searches) {
      const resolved = searchResults.get(search.id);
      if (resolved && search.purpose === "resolve_target" && !resolved.best_match) {
        return {
          text: `I couldn't find a ${search.entity_type} matching "${search.query}". Would you like to try a different name?`,
          ui: null,
          cachedIntents: output.intents as AssistantIntent[],
          modelName,
          inputTokens,
          outputTokens,
        };
      }
    }
  }

  // ── Confirmation flow (now with resolved search data) ──────────────
  if (output.needs_confirmation && !isConfirmation) {
    const actions: AssistantAction[] = [
      { label: "Go ahead", message: "go ahead", style: "primary" },
      { label: "I need changes", message: "No, I need changes", style: "secondary" },
    ];

    let ui: AssistantUi | null = null;
    let cachedOutput: CachedOutput | undefined;

    if (allActions.length > 0) {
      // Build confirmation items for all actions (not just the first)
      const confirmationItems = buildConfirmationItems(allActions, searchResults, output.searches);

      ui = {
        kind: "confirmation",
        action: output.response,
        entityType: confirmationItems[0]!.entityType,
        details: confirmationItems[0]!.details,
        items: confirmationItems.length > 1 ? confirmationItems : undefined,
      };

      // Build resolvedSearches record for cache so confirmation shortcut
      // can skip re-running searches
      const resolvedSearches: Record<string, ResolvedSearch> = {};
      for (const [id, resolved] of searchResults) {
        resolvedSearches[id] = resolved;
      }

      cachedOutput = {
        intents: output.intents,
        actions: allActions,
        searches: output.searches,
        response: output.response,
        resolvedSearches: Object.keys(resolvedSearches).length > 0 ? resolvedSearches : undefined,
      };
    }

    return {
      text: output.response,
      ui,
      actions,
      cachedIntents: output.intents as AssistantIntent[],
      cachedOutput,
      modelName,
      inputTokens,
      outputTokens,
    };
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

    // Check for execution failures
    const failedActions = actionResults.filter((r) => !r.success);
    if (failedActions.length > 0) {
      if (failedActions.length === actionResults.length) {
        // All failed
        const errorMsg = failedActions[0]?.result?.message || "Unknown error";
        console.error(`[assistant:structured] All actions failed:`, errorMsg);
        return {
          text: `Something went wrong: ${errorMsg}. Please try again.`,
          ui: null,
          cachedIntents: output.intents as AssistantIntent[],
          modelName,
          inputTokens,
          outputTokens,
        };
      }
      // Partial failure — show successes + report failures
      const toolResults = actionResults.filter((r) => r.success).map((r) => ({ output: r.result }));
      const ui = buildUiFromToolResults(toolResults);
      const failureNotes = failedActions.map((f) =>
        `Failed to ${f.action.operation} ${f.action.entity_type}: ${f.result?.message || "Unknown error"}`
      ).join(". ");
      const text = `${summarizeUiText(ui, output.response)} However, ${failureNotes}.`;
      return {
        text,
        ui,
        cachedIntents: output.intents as AssistantIntent[],
        modelName,
        inputTokens,
        outputTokens,
      };
    }

    const toolResults = actionResults.filter((r) => r.success).map((r) => ({ output: r.result }));
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

// ── Build confirmation items from actions ────────────────────────────

function buildConfirmationItems(
  actions: ActionInstruction[],
  searchResults: Map<string, ResolvedSearch>,
  searches: SearchInstruction[]
): Array<{ entityType: string; details: Record<string, unknown> }> {
  return actions.map((action) => {
    const details = { ...action.params } as Record<string, unknown>;
    if (action.participant_refs && action.participant_refs.length > 0) {
      const names = action.participant_refs
        .map((ref) => {
          const searchId = ref.split(".")[0]!;
          const resolved = searchResults.get(searchId);
          if (resolved?.best_match?.displayName) return resolved.best_match.displayName;
          return searches.find((s) => s.id === searchId)?.query;
        })
        .filter(Boolean);
      if (names.length > 0) details.participants = names.join(", ");
    }
    return { entityType: action.entity_type, details };
  });
}

// ── Re-execute display search after disambiguation ──────────────────

/**
 * After contact disambiguation, re-execute a display_results search using the
 * resolved contact ID. The original search ran in parallel with the contact
 * search and may have used findBestContactMatch to pick a different contact.
 */
async function reExecuteDisplaySearch(
  userId: string,
  search: SearchInstruction,
  contactId: string
): Promise<ToolResult | null> {
  try {
    switch (search.entity_type) {
      case "conversation":
        return await listConversationsByContacts(userId, [contactId], undefined, undefined, undefined, 5);
      default:
        return null;
    }
  } catch (err) {
    console.error(`[assistant:structured] Failed to re-execute display search:`, err);
    return null;
  }
}

// ── Build display UI from search results ────────────────────────────

function buildSearchDisplayUi(
  resolved: ResolvedSearch,
  search: SearchInstruction
): AssistantUi | null {
  if (resolved.candidates.length === 0) return null;

  // When raw ToolResult is available, delegate to buildUiFromToolResults
  // which already handles all entity types (contacts, conversations, events, reminders)
  if (resolved.rawResult) {
    return buildUiFromToolResults([{ output: resolved.rawResult as ToolResult }]);
  }

  // Fallback for contacts without rawResult (backward compatibility)
  if (search.entity_type === "contact") {
    return {
      kind: "contacts",
      count: resolved.candidates.length,
      contacts: resolved.candidates.map((c) => ({
        id: c.id,
        displayName: c.displayName,
      })),
    };
  }

  return null;
}
