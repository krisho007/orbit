export const PLAN_LIMITS = {
  free: { maxConversationsPerMonth: 30, maxTokensPerMonth: 200_000 },
  paid: { maxConversationsPerMonth: null, maxTokensPerMonth: 2_000_000 },
} as const;

export type PlanName = keyof typeof PLAN_LIMITS;

/** First day of the current UTC month at 00:00:00Z */
export function getMonthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
