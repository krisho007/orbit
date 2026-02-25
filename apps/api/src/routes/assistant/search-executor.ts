/**
 * Executes SearchInstruction[] from the fine-tuned model output.
 * Runs searches in parallel and returns resolved results keyed by search ID.
 */

import type { SearchInstruction, ResolvedSearch } from "./finetuned-types";
import type { ToolResult } from "./types";
import { searchContactsFuzzy, searchContactsByPhone, queryContacts } from "./tools/contacts";
import { queryConversations, listConversations } from "./tools/conversations";
import { queryEvents, listEvents } from "./tools/events";
import { listReminders } from "./tools/reminders";

export type { ResolvedSearch };

export async function executeSearches(
  userId: string,
  searches: SearchInstruction[]
): Promise<Map<string, ResolvedSearch>> {
  const results = new Map<string, ResolvedSearch>();

  if (searches.length === 0) return results;

  const promises = searches.map(async (search) => {
    const resolved = await executeSingleSearch(userId, search);
    results.set(search.id, resolved);
  });

  await Promise.all(promises);
  return results;
}

async function executeSingleSearch(
  userId: string,
  search: SearchInstruction
): Promise<ResolvedSearch> {
  const base: ResolvedSearch = {
    id: search.id,
    entity_type: search.entity_type,
    purpose: search.purpose,
    best_match: null,
    candidates: [],
    ambiguous: false,
  };

  try {
    switch (search.entity_type) {
      case "contact":
        return await executeContactSearch(userId, search, base);
      case "conversation":
        return await executeConversationSearch(userId, search, base);
      case "event":
        return await executeEventSearch(userId, search, base);
      case "reminder":
        return await executeReminderSearch(userId, search, base);
      default:
        return base;
    }
  } catch (err) {
    console.error(`[finetuned:search] Error executing search ${search.id}:`, err);
    return base;
  }
}

// ── Contact search ──────────────────────────────────────────────────

async function executeContactSearch(
  userId: string,
  search: SearchInstruction,
  base: ResolvedSearch
): Promise<ResolvedSearch> {
  let result: ToolResult;

  if (search.search_type === "phone") {
    result = await searchContactsByPhone(userId, search.query);
  } else if (search.search_type === "fuzzy_name") {
    result = await searchContactsFuzzy(userId, search.query);
  } else {
    // keyword / semantic → use query contacts
    result = await queryContacts(userId, search.query, 5);
  }

  if (result.type === "error") return base;

  // contacts_found from fuzzy search
  if (result.type === "contacts_found") {
    const contacts = (result.contacts ?? []) as Array<{
      id: string;
      displayName: string;
      similarity?: number;
    }>;

    const candidates = contacts.map((c) => ({
      id: c.id,
      displayName: c.displayName,
      similarity: c.similarity,
    }));

    const bestMatch = candidates[0] ?? null;
    const exactMatchFound = Boolean(result.exactMatchFound);

    // Ambiguous if 2+ viable candidates (similarity >= 0.4) and no exact match.
    // This catches "Vikram" → "Vikram Patel" (0.85) + "Vikram Singh" (0.80) as ambiguous,
    // while "Bob" → "Bob Smith" (0.85) + "Bobby Smithson" (0.30) auto-selects Bob Smith.
    const VIABLE_THRESHOLD = 0.4;
    const viableCandidates = candidates.filter(
      (c) => c.similarity === undefined || c.similarity >= VIABLE_THRESHOLD
    );
    const ambiguous = viableCandidates.length > 1 && !exactMatchFound;

    return {
      ...base,
      best_match: bestMatch ? { id: bestMatch.id, displayName: bestMatch.displayName } : null,
      candidates,
      ambiguous,
    };
  }

  // contact_phone_search result
  if (result.type === "contact_phone_search") {
    const contact = result.contact as { id: string; displayName: string } | null;
    const candidates = result.candidates as Array<{ id: string; displayName: string }> | undefined;

    if (contact) {
      return {
        ...base,
        best_match: { id: contact.id, displayName: contact.displayName },
        candidates: [{ id: contact.id, displayName: contact.displayName }],
        ambiguous: false,
      };
    }

    if (candidates && candidates.length > 0) {
      return {
        ...base,
        best_match: { id: candidates[0]!.id, displayName: candidates[0]!.displayName },
        candidates: candidates.map((c) => ({ id: c.id, displayName: c.displayName })),
        ambiguous: candidates.length > 1,
      };
    }
  }

  return base;
}

// ── Conversation search ─────────────────────────────────────────────

async function executeConversationSearch(
  userId: string,
  search: SearchInstruction,
  base: ResolvedSearch
): Promise<ResolvedSearch> {
  let result: ToolResult;

  if (search.search_type === "keyword" || search.search_type === "semantic") {
    // queryConversations searches by participant name — use it for name-based queries
    result = await queryConversations(userId, search.query, undefined, 10);
  } else {
    result = await listConversations(userId, undefined, search.query, undefined, 10);
  }

  if (result.type === "error") return base;

  if (result.type === "conversations_found") {
    const convos = (result.conversations ?? []) as Array<{
      id: string;
      content?: string;
      medium?: string;
    }>;

    const candidates = convos.map((c) => ({
      id: c.id,
      displayName: c.content?.substring(0, 50) || c.medium || "Conversation",
    }));

    return {
      ...base,
      best_match: candidates[0] ? { id: candidates[0].id, displayName: candidates[0].displayName } : null,
      candidates,
      ambiguous: false,
    };
  }

  return base;
}

// ── Event search ────────────────────────────────────────────────────

async function executeEventSearch(
  userId: string,
  search: SearchInstruction,
  base: ResolvedSearch
): Promise<ResolvedSearch> {
  let result: ToolResult;

  if (search.search_type === "keyword" || search.search_type === "semantic") {
    result = await queryEvents(userId, search.query, 10);
  } else {
    result = await listEvents(userId, undefined, search.query, undefined, 10);
  }

  if (result.type === "error") return base;

  if (result.type === "events_found") {
    const evts = (result.events ?? []) as Array<{
      id: string;
      title: string;
    }>;

    const candidates = evts.map((e) => ({
      id: e.id,
      displayName: e.title || "Event",
    }));

    return {
      ...base,
      best_match: candidates[0] ? { id: candidates[0].id, displayName: candidates[0].displayName } : null,
      candidates,
      ambiguous: false,
    };
  }

  return base;
}

// ── Reminder search ─────────────────────────────────────────────────

async function executeReminderSearch(
  userId: string,
  search: SearchInstruction,
  base: ResolvedSearch
): Promise<ResolvedSearch> {
  const result = await listReminders(userId, undefined, search.query);

  if (result.type === "error") return base;

  if (result.type === "reminders_found") {
    const rems = (result.reminders ?? []) as Array<{
      id: string;
      title: string;
    }>;

    const candidates = rems.map((r) => ({
      id: r.id,
      displayName: r.title || "Reminder",
    }));

    return {
      ...base,
      best_match: candidates[0] ? { id: candidates[0].id, displayName: candidates[0].displayName } : null,
      candidates,
      ambiguous: false,
    };
  }

  return base;
}
