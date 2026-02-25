/**
 * Executes ActionInstruction[] from the fine-tuned model output.
 * Resolves search references (e.g. "s1.best_match") to actual entity IDs,
 * then calls the existing DB operation functions.
 */

import type { ActionInstruction, ResolvedSearch } from "./finetuned-types";
import type { ToolResult } from "./types";
import { resolveParamsTime } from "./time-resolver";
import { createContact, updateContactById } from "./tools/contacts";
import { createConversation, updateConversationById } from "./tools/conversations";
import { createEvent, updateEventById } from "./tools/events";
import { createReminderByIds, updateReminderById, completeReminderById } from "./tools/reminders";

export type ActionResult = {
  action: ActionInstruction;
  result: ToolResult;
  success: boolean;
};

export async function executeActions(
  userId: string,
  actions: ActionInstruction[],
  searchResults: Map<string, ResolvedSearch>,
  timezone: string,
  assistantConversationId?: string
): Promise<ActionResult[]> {
  const results: ActionResult[] = [];

  // Execute actions sequentially — order may matter (e.g. create contact then create conversation)
  for (const action of actions) {
    const result = await executeSingleAction(
      userId,
      action,
      searchResults,
      timezone,
      assistantConversationId
    );
    results.push(result);

    // If a create action produced an ID, store it so subsequent actions can reference it
    if (result.success && result.result.id) {
      // Update search results with newly created entity
      updateSearchResultsWithCreated(action, result.result, searchResults);
    }
  }

  return results;
}

/**
 * When a create action succeeds, we need to make its ID available for
 * subsequent actions that might reference it via target_ref or participant_refs.
 * We store it under a synthetic search ID derived from the action's entity type.
 */
function updateSearchResultsWithCreated(
  action: ActionInstruction,
  result: ToolResult,
  searchResults: Map<string, ResolvedSearch>
) {
  const id = result.id as string;
  const displayName = (result.displayName ?? result.title ?? action.entity_type) as string;

  // Store under "created_<entity_type>" so it can be referenced
  const key = `created_${action.entity_type}`;
  searchResults.set(key, {
    id: key,
    entity_type: action.entity_type as any,
    purpose: "resolve_target",
    best_match: { id, displayName },
    candidates: [{ id, displayName }],
    ambiguous: false,
  });

  // If this action was synthesized by the participant fallback, also register
  // under "created_contact_<searchId>" so subsequent actions referencing
  // "created_contact_s1.best_match" can resolve correctly.
  const fallbackSearchId = action.params._fallbackSearchId as string | undefined;
  if (fallbackSearchId) {
    const fallbackKey = `created_contact_${fallbackSearchId}`;
    searchResults.set(fallbackKey, {
      id: fallbackKey,
      entity_type: action.entity_type as any,
      purpose: "resolve_target",
      best_match: { id, displayName },
      candidates: [{ id, displayName }],
      ambiguous: false,
    });
  }
}

async function executeSingleAction(
  userId: string,
  action: ActionInstruction,
  searchResults: Map<string, ResolvedSearch>,
  timezone: string,
  assistantConversationId?: string
): Promise<ActionResult> {
  try {
    // Resolve time tokens in params
    const resolvedParams = resolveParamsTime(action.params, timezone);

    // Resolve participant references to IDs
    const participantIds = resolveParticipantRefs(action.participant_refs, searchResults);

    // Resolve target reference to ID
    const targetId = resolveRef(action.target_ref, searchResults);

    let result: ToolResult;

    switch (action.entity_type) {
      case "contact":
        result = await executeContactAction(userId, action.operation, resolvedParams, targetId, assistantConversationId);
        break;
      case "conversation":
        result = await executeConversationAction(userId, action.operation, resolvedParams, participantIds, targetId, assistantConversationId);
        break;
      case "event":
        result = await executeEventAction(userId, action.operation, resolvedParams, participantIds, targetId, assistantConversationId);
        break;
      case "reminder":
        result = await executeReminderAction(userId, action.operation, resolvedParams, participantIds, targetId, assistantConversationId);
        break;
      default:
        result = { type: "error", message: `Unsupported entity type: ${action.entity_type}` };
    }

    const success = result.type !== "error";
    return { action, result, success };
  } catch (err) {
    console.error(`[finetuned:action] Error executing action:`, err);
    return {
      action,
      result: { type: "error", message: err instanceof Error ? err.message : "Unknown error" },
      success: false,
    };
  }
}

// ── Reference resolution ────────────────────────────────────────────

function resolveRef(
  ref: string | undefined,
  searchResults: Map<string, ResolvedSearch>
): string | null {
  if (!ref) return null;

  // Format: "s1.best_match" or "s1.candidates[0]"
  const [searchId, accessor] = ref.split(".");
  if (!searchId) return null;

  const search = searchResults.get(searchId);
  if (!search) return null;

  if (accessor === "best_match" || !accessor) {
    return search.best_match?.id ?? null;
  }

  // Handle candidates[N] accessor
  const indexMatch = accessor.match(/^candidates\[(\d+)\]$/);
  if (indexMatch) {
    const idx = parseInt(indexMatch[1]!, 10);
    return search.candidates[idx]?.id ?? null;
  }

  return search.best_match?.id ?? null;
}

function resolveParticipantRefs(
  refs: string[] | undefined,
  searchResults: Map<string, ResolvedSearch>
): string[] {
  if (!refs || refs.length === 0) return [];

  const ids: string[] = [];
  for (const ref of refs) {
    const id = resolveRef(ref, searchResults);
    if (id) ids.push(id);
  }
  return [...new Set(ids)]; // deduplicate
}

// ── Contact actions ─────────────────────────────────────────────────

async function executeContactAction(
  userId: string,
  operation: string,
  params: Record<string, unknown>,
  targetId: string | null,
  assistantConversationId?: string
): Promise<ToolResult> {
  if (operation === "create") {
    return createContact(
      userId,
      params.displayName as string,
      params.primaryPhone as string | undefined,
      params.primaryEmail as string | undefined,
      params.dateOfBirth as string | undefined,
      params.gender as string | undefined,
      params.company as string | undefined,
      params.jobTitle as string | undefined,
      params.location as string | undefined,
      params.notes as string | undefined,
      params.tagIds as string[] | undefined,
      assistantConversationId
    );
  }

  if (operation === "update" && targetId) {
    return updateContactById(userId, targetId, {
      displayName: params.displayName as string | undefined,
      primaryPhone: params.primaryPhone as string | undefined,
      primaryEmail: params.primaryEmail as string | undefined,
      dateOfBirth: params.dateOfBirth as string | undefined,
      gender: params.gender as string | undefined,
      company: params.company as string | undefined,
      jobTitle: params.jobTitle as string | undefined,
      location: params.location as string | undefined,
      notes: params.notes as string | undefined,
      tagIds: params.tagIds as string[] | undefined,
    });
  }

  return { type: "error", message: `Unsupported contact operation: ${operation}` };
}

// ── Conversation actions ────────────────────────────────────────────

async function executeConversationAction(
  userId: string,
  operation: string,
  params: Record<string, unknown>,
  participantIds: string[],
  targetId: string | null,
  assistantConversationId?: string
): Promise<ToolResult> {
  if (operation === "create") {
    return createConversation(
      userId,
      participantIds,
      params.medium as string,
      params.content as string | undefined,
      params.happenedAt as string | undefined,
      params.followUpAt as string | undefined,
      params.eventId as string | undefined,
      assistantConversationId
    );
  }

  if (operation === "update" && targetId) {
    return updateConversationById(userId, targetId, {
      content: params.content as string | undefined,
      medium: params.medium as string | undefined,
      happenedAt: params.happenedAt as string | undefined,
      followUpAt: params.followUpAt as string | undefined,
      eventId: params.eventId as string | undefined,
      participantIds: participantIds.length > 0 ? participantIds : undefined,
    });
  }

  return { type: "error", message: `Unsupported conversation operation: ${operation}` };
}

// ── Event actions ───────────────────────────────────────────────────

async function executeEventAction(
  userId: string,
  operation: string,
  params: Record<string, unknown>,
  participantIds: string[],
  targetId: string | null,
  assistantConversationId?: string
): Promise<ToolResult> {
  if (operation === "create") {
    return createEvent(
      userId,
      params.title as string,
      params.startAt as string,
      participantIds.length > 0 ? participantIds : undefined,
      params.endAt as string | undefined,
      params.location as string | undefined,
      params.description as string | undefined,
      params.eventType as string | undefined,
      assistantConversationId
    );
  }

  if (operation === "update" && targetId) {
    return updateEventById(userId, targetId, {
      title: params.title as string | undefined,
      description: params.description as string | undefined,
      eventType: params.eventType as string | undefined,
      startAt: params.startAt as string | undefined,
      endAt: params.endAt as string | undefined,
      location: params.location as string | undefined,
      participantIds: participantIds.length > 0 ? participantIds : undefined,
    });
  }

  return { type: "error", message: `Unsupported event operation: ${operation}` };
}

// ── Reminder actions ────────────────────────────────────────────────

async function executeReminderAction(
  userId: string,
  operation: string,
  params: Record<string, unknown>,
  participantIds: string[],
  targetId: string | null,
  assistantConversationId?: string
): Promise<ToolResult> {
  if (operation === "create") {
    return createReminderByIds(
      userId,
      {
        title: params.title as string | undefined,
        notes: params.notes as string | undefined,
        dueAt: params.dueAt as string,
        status: params.status as string | undefined,
        conversationId: params.conversationId as string | undefined,
        participantIds: participantIds.length > 0 ? participantIds : undefined,
      },
      assistantConversationId
    );
  }

  if (operation === "update" && targetId) {
    return updateReminderById(userId, targetId, {
      title: params.title as string | undefined,
      notes: params.notes as string | undefined,
      dueAt: params.dueAt as string | undefined,
      status: params.status as string | undefined,
      conversationId: params.conversationId as string | undefined,
      participantIds: participantIds.length > 0 ? participantIds : undefined,
    });
  }

  if (operation === "complete" && targetId) {
    return completeReminderById(
      userId,
      targetId,
      (params.status as "DONE" | "CANCELED" | undefined) ?? "DONE"
    );
  }

  return { type: "error", message: `Unsupported reminder operation: ${operation}` };
}
