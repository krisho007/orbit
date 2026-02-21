import type { ZodError } from "zod";

/**
 * Format Zod validation errors for client responses.
 * Returns only field paths and generic messages, hiding internal schema details.
 */
export function formatValidationErrors(error: ZodError) {
  return error.issues.map((issue) => ({
    field: issue.path.join(".") || "(body)",
    message: issue.message,
  }));
}

const MAX_LIMIT = 100;

/**
 * Clamp a parsed limit value to a safe range.
 */
export function clampLimit(raw: string | undefined, defaultLimit: number = 20): number {
  const parsed = raw ? parseInt(raw, 10) : defaultLimit;
  if (isNaN(parsed) || parsed < 1) return defaultLimit;
  return Math.min(parsed, MAX_LIMIT);
}
