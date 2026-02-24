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

/**
 * Max lengths for user-controlled fields in tool results.
 * Fields not listed here are not sanitized (assumed safe: type, id, count, etc.).
 */
const USER_DATA_MAX_LENGTHS: Record<string, number> = {
  displayName: 200,
  googleContactName: 200,
  name: 200,
  notes: 2000,
  content: 5000,
  description: 2000,
  location: 500,
  company: 200,
  jobTitle: 200,
  title: 500,
  primaryEmail: 500,
  primaryPhone: 100,
  action: 500,
  summary: 500,
};

/**
 * Recursively sanitize user-controlled string fields in tool results.
 * Strips control characters and truncates to safe lengths.
 */
export function sanitizeToolResult<T>(result: T): T {
  if (result === null || result === undefined) return result;
  if (typeof result !== "object") return result;
  if (result instanceof Date) return result;
  if (Array.isArray(result)) {
    return result.map(sanitizeToolResult) as T;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(
    result as Record<string, unknown>
  )) {
    if (key in USER_DATA_MAX_LENGTHS && typeof value === "string") {
      sanitized[key] = sanitizeForPrompt(value, USER_DATA_MAX_LENGTHS[key]);
    } else if (typeof value === "object" && value !== null) {
      sanitized[key] = sanitizeToolResult(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized as T;
}
