/**
 * Resolves relative time tokens from the fine-tuned model output into UTC ISO strings.
 *
 * Supported tokens:
 *   NOW                    → current UTC time
 *   TODAY                  → start of today in user's timezone
 *   TODAY_HH:MM            → today at HH:MM in user's timezone
 *   TOMORROW               → start of tomorrow in user's timezone
 *   TOMORROW_HH:MM         → tomorrow at HH:MM in user's timezone
 *   YESTERDAY              → start of yesterday in user's timezone
 *   YESTERDAY_HH:MM        → yesterday at HH:MM in user's timezone
 *   NEXT_WEEK              → start of next Monday in user's timezone
 *   NEXT_WEEK_HH:MM        → next Monday at HH:MM in user's timezone
 *   +Nd                    → N days from now (start of that day)
 *   +Nd_HH:MM              → N days from now at HH:MM
 *   -Nd                    → N days ago (start of that day)
 *   -Nd_HH:MM              → N days ago at HH:MM
 *
 * If the value is already an ISO 8601 string, it is returned as-is.
 * If the value is unrecognized, it is returned as-is (the DB layer will handle or reject it).
 */

const RELATIVE_TOKEN_RE = /^(NOW|TODAY|TOMORROW|YESTERDAY|NEXT_WEEK|[+-]\d+d)(?:_(\d{1,2}):(\d{2}))?$/;

export function resolveRelativeTime(
  token: string,
  timezone: string,
  now?: Date
): string {
  const trimmed = token.trim();

  // Already an ISO date/datetime — return as-is
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed;
  }

  const match = trimmed.match(RELATIVE_TOKEN_RE);
  if (!match) {
    // Not a relative token — return as-is for the DB layer to handle
    return trimmed;
  }

  const [, base, hoursStr, minutesStr] = match;
  const currentTime = now ?? new Date();
  const hasTime = hoursStr !== undefined && minutesStr !== undefined;
  const hours = hasTime ? parseInt(hoursStr, 10) : 0;
  const minutes = hasTime ? parseInt(minutesStr, 10) : 0;

  // Get the current date parts in the user's timezone
  const userNow = getDatePartsInTimezone(currentTime, timezone);

  let targetDate: Date;

  switch (base) {
    case "NOW":
      return currentTime.toISOString();

    case "TODAY":
      targetDate = buildDateInTimezone(
        userNow.year, userNow.month, userNow.day,
        hasTime ? hours : 0,
        hasTime ? minutes : 0,
        timezone
      );
      break;

    case "TOMORROW":
      targetDate = buildDateInTimezone(
        userNow.year, userNow.month, userNow.day + 1,
        hasTime ? hours : 0,
        hasTime ? minutes : 0,
        timezone
      );
      break;

    case "YESTERDAY":
      targetDate = buildDateInTimezone(
        userNow.year, userNow.month, userNow.day - 1,
        hasTime ? hours : 0,
        hasTime ? minutes : 0,
        timezone
      );
      break;

    case "NEXT_WEEK": {
      // Next Monday
      const dayOfWeek = getDayOfWeekInTimezone(currentTime, timezone);
      const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek);
      targetDate = buildDateInTimezone(
        userNow.year, userNow.month, userNow.day + daysUntilMonday,
        hasTime ? hours : 9, // Default to 9am for "next week"
        hasTime ? minutes : 0,
        timezone
      );
      break;
    }

    default: {
      // +Nd or -Nd pattern
      const daysMatch = base!.match(/^([+-])(\d+)d$/);
      if (!daysMatch) return trimmed;
      const sign = daysMatch[1] === "+" ? 1 : -1;
      const days = parseInt(daysMatch[2]!, 10) * sign;
      targetDate = buildDateInTimezone(
        userNow.year, userNow.month, userNow.day + days,
        hasTime ? hours : 0,
        hasTime ? minutes : 0,
        timezone
      );
      break;
    }
  }

  return targetDate.toISOString();
}

/**
 * Recursively resolves all string values in a params object that look like relative time tokens.
 * Only processes known time-related field names to avoid mangling non-time strings.
 */
const TIME_FIELD_NAMES = new Set([
  "happenedAt", "startAt", "endAt", "dueAt", "followUpAt",
  "happened_at", "start_at", "end_at", "due_at", "follow_up_at",
]);

export function resolveParamsTime(
  params: Record<string, unknown>,
  timezone: string,
  now?: Date
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && TIME_FIELD_NAMES.has(key)) {
      resolved[key] = resolveRelativeTime(value, timezone, now);
    } else {
      resolved[key] = value;
    }
  }
  return resolved;
}

// ── Timezone helpers ────────────────────────────────────────────────

type DateParts = {
  year: number;
  month: number; // 1-based
  day: number;
  hours: number;
  minutes: number;
};

function getDatePartsInTimezone(date: Date, timezone: string): DateParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hours: get("hour") === 24 ? 0 : get("hour"), // Intl may return 24 for midnight
    minutes: get("minute"),
  };
}

function getDayOfWeekInTimezone(date: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  });
  const weekday = formatter.format(date);
  const dayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return dayMap[weekday] ?? 0;
}

/**
 * Builds a Date object for a specific date/time in a given timezone.
 * Uses an iterative approach to handle DST transitions correctly.
 */
function buildDateInTimezone(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number,
  timezone: string
): Date {
  // Create an initial guess in UTC
  const guess = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0, 0));

  // Get what time this guess represents in the target timezone
  const guessInTz = getDatePartsInTimezone(guess, timezone);

  // Calculate the offset difference and adjust
  const hourDiff = guessInTz.hours - hours;
  const minuteDiff = guessInTz.minutes - minutes;

  // Also handle day rollover from timezone offset
  const dayDiff = guessInTz.day - day;
  const totalMinutesDiff = dayDiff * 24 * 60 + hourDiff * 60 + minuteDiff;

  const adjusted = new Date(guess.getTime() - totalMinutesDiff * 60 * 1000);

  return adjusted;
}
