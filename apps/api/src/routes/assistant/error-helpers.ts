import type { ToolResult, ToolCallMeta } from "./types";
import { createContactAllowedFields } from "./types";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function sanitizeCreateContactInput(input: unknown): Record<string, unknown> {
  if (!isRecord(input)) return {};

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (createContactAllowedFields.has(key)) {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

export function extractDisplayNameFromUserText(text: string): string | null {
  const normalized = text.trim();
  if (!normalized) return null;

  const sentence = normalized.split(/[.!?]/)[0]?.trim() || normalized;
  const patterns = [
    /(?:add|create)\s+(?:a\s+|new\s+)?contact(?:\s+(?:for|named)\s+)?([^,.;\n]+?)(?:\s+(?:number|phone|email|mobile)\b|$)/i,
    /add\s+([^,.;\n]+?)(?:\s+(?:number|phone|email|mobile)\b|$)/i,
  ];

  for (const pattern of patterns) {
    const match = sentence.match(pattern);
    const candidate = match?.[1]?.trim();
    if (candidate && /[A-Za-z]/.test(candidate)) {
      return candidate;
    }
  }

  const fallbackMatch = sentence.match(/^([A-Za-z][A-Za-z\s.'&-]{1,60})/);
  return fallbackMatch?.[1]?.trim() || null;
}

export function extractLastUserText(messages: unknown[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i] as { role?: string; content?: unknown };
    if (message?.role !== "user") continue;

    if (typeof message.content === "string") {
      return message.content;
    }

    if (Array.isArray(message.content)) {
      const textParts = message.content
        .map((part: any) => (part?.type === "text" ? part.text : ""))
        .filter((part) => typeof part === "string" && part.length > 0);
      if (textParts.length > 0) return textParts.join(" ").trim();
    }
  }
  return "";
}

export function summarizeToolCallError(error: unknown): string {
  if (!error) return "unknown";
  if (error instanceof Error && error.message) return error.message;
  if (isRecord(error) && typeof error.message === "string") return error.message;
  return String(error);
}

export function missingCreateContactFields(input: unknown): string[] {
  const sanitized = sanitizeCreateContactInput(input);
  const missing: string[] = [];
  if (typeof sanitized.displayName !== "string" || sanitized.displayName.trim().length === 0) {
    missing.push("displayName");
  }
  return missing;
}

export function containsCreateContactIntent(text: string): boolean {
  const lowered = text.toLowerCase();
  return (
    (lowered.includes("create") || lowered.includes("add")) &&
    lowered.includes("contact")
  );
}

export function buildCreateContactFailureText(
  lastUserText: string,
  createContactCalls: ToolCallMeta[],
  toolResults: Array<{ output?: ToolResult }>
): string {
  const missingFields = new Set<string>();
  for (const call of createContactCalls) {
    for (const field of missingCreateContactFields(call.input)) {
      missingFields.add(field);
    }
  }

  const latestErrorOutput = [...toolResults]
    .map((result) => result.output)
    .find(
      (output) =>
        output &&
        typeof output === "object" &&
        output.type === "error" &&
        typeof output.message === "string"
    ) as { message?: string } | undefined;

  if (missingFields.has("displayName")) {
    return "I couldn't create that contact yet. Please share the contact name (displayName).";
  }

  if (latestErrorOutput?.message) {
    return `I couldn't create that contact yet: ${latestErrorOutput.message}`;
  }

  if (containsCreateContactIntent(lastUserText)) {
    return "I couldn't confirm contact creation. Please share the contact name so I can create it.";
  }

  return "I couldn't confirm contact creation. Please retry with the contact name and details.";
}
