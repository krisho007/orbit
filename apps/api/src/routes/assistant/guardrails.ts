import type { AssistantIntent } from "./types";
import { ASSISTANT_INTENTS, MUTATING_INTENTS } from "./constants";

export function isIntentRequiringConfirmation(intent: AssistantIntent): boolean {
  return MUTATING_INTENTS.has(intent);
}

export const CONFIRMATION_TOKENS = new Set([
  "yes",
  "y",
  "yes please",
  "go ahead",
  "please go ahead",
  "proceed",
  "do it",
  "confirm",
  "confirmed",
  "looks good",
  "sounds good",
  "sure",
  "ok",
  "okay",
  "yep",
  "yup",
  "absolutely",
  "definitely",
]);

export function isExplicitUserConfirmation(text: string): boolean {
  const normalized = text.trim().toLowerCase().replace(/[.!?]+$/, "");
  if (!normalized) return false;

  // Exact match first
  if (CONFIRMATION_TOKENS.has(normalized)) return true;

  // Compound confirmation: "Sounds good. Go ahead." → split on sentence
  // boundaries and check that every segment is a confirmation token.
  const segments = normalized
    .split(/[.!?,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return segments.length > 1 && segments.every((seg) => CONFIRMATION_TOKENS.has(seg));
}

export const REJECTION_TOKENS = new Set([
  "no",
  "nope",
  "no thanks",
  "cancel",
  "stop",
  "i need changes",
  "no i need changes",
  "no, i need changes",
  "changes needed",
  "not yet",
  "hold on",
  "wait",
  "let me change",
  "make changes",
]);

export function isExplicitUserRejection(text: string): boolean {
  const normalized = text.trim().toLowerCase().replace(/[.!?]+$/, "");
  if (!normalized) return false;

  return REJECTION_TOKENS.has(normalized);
}

// ── Selection message parsing ──────────────────────────────────────

const SELECTION_REGEX = /^Use \w+ ID (\S+) as the selected context/i;

export function parseUserSelection(text: string): { entityId: string } | null {
  const match = text.trim().match(SELECTION_REGEX);
  return match ? { entityId: match[1]! } : null;
}

export function isSkipContactSelection(text: string): boolean {
  return /none of these|skip contact/i.test(text.trim());
}

export function isCreateNewContactSelection(text: string): boolean {
  return /create.*new.*contact|create\s*"/i.test(text.trim());
}

export function isShowMoreDisambiguation(text: string): boolean {
  return /^show more$/i.test(text.trim());
}

export function parseIntentFromText(rawText: string): AssistantIntent {
  const cleaned = rawText.replace(/```json|```/gi, "").trim();
  if (!cleaned) return "unknown";

  try {
    const parsed = JSON.parse(cleaned);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as any).intent === "string" &&
      ASSISTANT_INTENTS.includes((parsed as any).intent)
    ) {
      return (parsed as any).intent as AssistantIntent;
    }
  } catch {
    // no-op
  }

  const direct = cleaned.replace(/["'`]/g, "").trim();
  if (ASSISTANT_INTENTS.includes(direct as AssistantIntent)) {
    return direct as AssistantIntent;
  }

  return "unknown";
}

// ── Multi-intent support ────────────────────────────────────────────

export function parseIntentsFromText(rawText: string): AssistantIntent[] {
  const cleaned = rawText.replace(/```json|```/gi, "").trim();
  if (!cleaned) return ["unknown"];

  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === "object") {
      // New format: {"intents":["create_event","create_conversation"]}
      if (Array.isArray((parsed as any).intents)) {
        const valid = (parsed as any).intents.filter(
          (i: unknown) => typeof i === "string" && ASSISTANT_INTENTS.includes(i as AssistantIntent)
        ) as AssistantIntent[];
        const deduped = [...new Set(valid)];
        return deduped.length > 0 ? deduped : ["unknown"];
      }
      // Fallback: old format {"intent":"create_event"}
      if (
        typeof (parsed as any).intent === "string" &&
        ASSISTANT_INTENTS.includes((parsed as any).intent)
      ) {
        return [(parsed as any).intent as AssistantIntent];
      }
    }
  } catch {
    // no-op
  }

  // Bare string fallback
  const direct = cleaned.replace(/["'`]/g, "").trim();
  if (ASSISTANT_INTENTS.includes(direct as AssistantIntent)) {
    return [direct as AssistantIntent];
  }

  return ["unknown"];
}

export function anyIntentRequiresConfirmation(intents: AssistantIntent[]): boolean {
  return intents.some((intent) => MUTATING_INTENTS.has(intent));
}
