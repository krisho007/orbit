import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import type { AssistantIntent, ChatMessage } from "./types";
import { ASSISTANT_INTENTS, MUTATING_INTENTS } from "./constants";

export function isIntentRequiringConfirmation(intent: AssistantIntent): boolean {
  return MUTATING_INTENTS.has(intent);
}

export function isExplicitUserConfirmation(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;

  const CONFIRMATION_TOKENS = new Set([
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

  return CONFIRMATION_TOKENS.has(normalized);
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

export async function identifyIntent(
  messages: ChatMessage[],
  aiModel: string,
  generate: typeof generateText
): Promise<AssistantIntent> {
  const result = await generate({
    model: google(aiModel),
    system: `Classify the user's current intent.
Return ONLY valid JSON in this shape: {"intent":"<intent>"}.
Allowed intents: ${ASSISTANT_INTENTS.join(", ")}.
Pick "unknown" if none apply.`,
    messages: messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  });

  return parseIntentFromText(result.text);
}
