import { generateText } from "ai";
import { getProviderApiKeyEnvGuard, isFinetunedProvider, isStructuredProvider } from "./model";
import type { ChatMessage, ToolResult, AssistantUi, AssistantAction, AssistantIntent, StatusCallback } from "./types";
import { processMessageFinetuned } from "./process-message-finetuned";
import { processMessageStructured } from "./process-message-structured";
import { buildUiFromToolResults, summarizeUiText } from "./ui-builder";

export async function processMessageLLM(
  userId: string,
  messages: ChatMessage[],
  generate: typeof generateText = generateText,
  assistantConversationId?: string,
  onStatus?: StatusCallback,
  timezone?: string
): Promise<{ text: string; ui: AssistantUi | null; actions?: AssistantAction[]; cachedIntents?: AssistantIntent[]; cachedOutput?: Record<string, unknown>; modelName?: string; inputTokens?: number; outputTokens?: number }> {
  // Route to structured single-pass flow (real calls only)
  if (isStructuredProvider() && generate === generateText) {
    return processMessageStructured(userId, messages, assistantConversationId, onStatus, timezone);
  }

  // Route to fine-tuned single-pass flow (real calls only)
  if (isFinetunedProvider() && generate === generateText) {
    return processMessageFinetuned(userId, messages, assistantConversationId, onStatus, timezone);
  }

  // Fallback: API key guard for real calls
  if (generate === generateText) {
    const apiKeyGuard = getProviderApiKeyEnvGuard();
    if (!apiKeyGuard.configured) {
      return { text: apiKeyGuard.message, ui: null };
    }
    return { text: "Assistant provider not configured.", ui: null };
  }

  // Test path: use injected generate function and build UI from tool results
  const result = await generate({
    model: {} as any,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });

  const toolResults = (result.toolResults || []) as Array<{ output?: ToolResult }>;
  const ui = buildUiFromToolResults(toolResults);
  const text = summarizeUiText(ui, result.text, false);

  return { text, ui };
}
