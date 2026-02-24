import { z } from "zod";
import type { AssistantIntent } from "./types";

// ── Search instruction ──────────────────────────────────────────────

export const searchEntityTypes = ["contact", "conversation", "event", "reminder"] as const;
export type SearchEntityType = (typeof searchEntityTypes)[number];

export const searchTypes = ["fuzzy_name", "phone", "keyword", "semantic"] as const;
export type SearchType = (typeof searchTypes)[number];

export const searchPurposes = ["resolve_participant", "resolve_target", "display_results"] as const;
export type SearchPurpose = (typeof searchPurposes)[number];

export const searchInstructionSchema = z.object({
  id: z.string().regex(/^s\d+$/, "Search ID must be like s1, s2, etc."),
  entity_type: z.enum(searchEntityTypes),
  search_type: z.enum(searchTypes),
  query: z.string().min(1),
  purpose: z.enum(searchPurposes),
});

export type SearchInstruction = z.infer<typeof searchInstructionSchema>;

// ── Action instruction ──────────────────────────────────────────────

export const actionOperations = ["create", "update", "complete"] as const;
export type ActionOperation = (typeof actionOperations)[number];

export const actionEntityTypes = [
  "contact", "conversation", "event", "reminder", "relationship",
] as const;
export type ActionEntityType = (typeof actionEntityTypes)[number];

export const actionInstructionSchema = z.object({
  operation: z.enum(actionOperations),
  entity_type: z.enum(actionEntityTypes),
  params: z.record(z.string(), z.unknown()),
  participant_refs: z.array(z.string()).optional(),
  target_ref: z.string().optional(),
});

export type ActionInstruction = z.infer<typeof actionInstructionSchema>;

// ── Model output ────────────────────────────────────────────────────

export const orbitModelOutputSchema = z.object({
  intents: z.array(
    z.enum([
      "create_contact",
      "search_contact",
      "edit_contact",
      "create_conversation",
      "create_conversation_with_contact",
      "search_conversation",
      "edit_conversation",
      "create_event",
      "create_event_with_conversation",
      "search_event",
      "edit_event",
      "create_reminder",
      "create_reminder_with_context",
      "search_reminder",
      "edit_reminder",
      "delete_entity",
      "unknown",
    ])
  ).min(1),

  searches: z.array(searchInstructionSchema),

  action: actionInstructionSchema.nullable().optional(),
  actions: z.array(actionInstructionSchema).optional(),

  response: z.string().min(1),
  needs_confirmation: z.boolean(),
  needs_resolution: z.boolean(),
});

export type OrbitModelOutput = z.infer<typeof orbitModelOutputSchema>;

// ── Resolved search result ──────────────────────────────────────────

export type ResolvedSearch = {
  id: string;
  entity_type: SearchEntityType;
  purpose: SearchPurpose;
  best_match: { id: string; displayName: string } | null;
  candidates: Array<{ id: string; displayName: string; similarity?: number }>;
  ambiguous: boolean;
};

// ── Parsing helper ──────────────────────────────────────────────────

export function parseModelOutput(raw: string): OrbitModelOutput {
  // Strip markdown code fences if present (model may wrap in ```json...```)
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  }

  const parsed = JSON.parse(cleaned);
  return orbitModelOutputSchema.parse(parsed);
}

// ── Helpers ─────────────────────────────────────────────────────────

/** Get all actions from the model output (normalizes single action vs actions array). */
export function getActions(output: OrbitModelOutput): ActionInstruction[] {
  if (output.actions && output.actions.length > 0) return output.actions;
  if (output.action) return [output.action];
  return [];
}

/** Extract all unique search ref IDs used by actions. */
export function getReferencedSearchIds(output: OrbitModelOutput): Set<string> {
  const refs = new Set<string>();
  for (const action of getActions(output)) {
    for (const ref of action.participant_refs ?? []) {
      const searchId = ref.split(".")[0];
      if (searchId) refs.add(searchId);
    }
    if (action.target_ref) {
      const searchId = action.target_ref.split(".")[0];
      if (searchId) refs.add(searchId);
    }
  }
  return refs;
}
