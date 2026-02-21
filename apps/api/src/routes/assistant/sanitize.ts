/**
 * Sanitize user-controlled strings before injecting into LLM prompts.
 * Prevents prompt injection via malicious contact names, emails, etc.
 */
export function sanitizeForPrompt(
  value: string | null | undefined,
  maxLength: number = 200
): string {
  if (!value) return "";
  // Strip control characters (keep normal whitespace)
  const cleaned = value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  // Truncate to max length
  return cleaned.slice(0, maxLength);
}
