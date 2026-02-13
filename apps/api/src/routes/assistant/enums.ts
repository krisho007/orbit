import { z } from "zod";
import { sql } from "drizzle-orm";
import {
  db,
  conversationMediumEnum,
  eventTypeEnum,
  reminderStatusEnum,
  genderEnum,
} from "../../db";
import type { AssistantEnumConfig } from "./types";

const ASSISTANT_ENUM_NAMES = {
  conversationMediums: "ConversationMedium",
  eventTypes: "EventType",
  reminderStatuses: "ReminderStatus",
} as const;

export const SCHEMA_ENUM_CONFIG: AssistantEnumConfig = {
  conversationMediums: [...conversationMediumEnum.enumValues],
  eventTypes: [...eventTypeEnum.enumValues],
  reminderStatuses: [...reminderStatusEnum.enumValues],
};

function readRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as any).rows;
    if (Array.isArray(rows)) return rows as T[];
  }
  return [];
}

async function fetchPgEnumValues(enumName: string): Promise<string[]> {
  const result = await db.execute(sql`
    SELECT e.enumlabel AS value
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = ${enumName}
    ORDER BY e.enumsortorder
  `);

  return readRows<{ value: string }>(result)
    .map((row) => row.value)
    .filter((value): value is string => typeof value === "string" && value.length > 0);
}

export async function loadAssistantEnumConfig(): Promise<AssistantEnumConfig> {
  try {
    const [conversationMediums, eventTypes, reminderStatuses] = await Promise.all([
      fetchPgEnumValues(ASSISTANT_ENUM_NAMES.conversationMediums),
      fetchPgEnumValues(ASSISTANT_ENUM_NAMES.eventTypes),
      fetchPgEnumValues(ASSISTANT_ENUM_NAMES.reminderStatuses),
    ]);

    if (conversationMediums.length === 0 || eventTypes.length === 0 || reminderStatuses.length === 0) {
      throw new Error("Missing enum values from pg_enum.");
    }

    return {
      conversationMediums,
      eventTypes,
      reminderStatuses,
    };
  } catch (error) {
    console.warn(
      "[assistant:enum] Falling back to schema enum definitions because pg_enum fetch failed:",
      error
    );
    return {
      ...SCHEMA_ENUM_CONFIG,
    };
  }
}

export function enumValueSchema(values: string[], fieldLabel: string, optional = false) {
  const schema = z
    .string()
    .refine((value) => values.includes(value), `${fieldLabel} must be one of: ${values.join(", ")}`);

  return optional ? schema.optional() : schema;
}

export function assertValidMedium(value: string): typeof conversationMediumEnum.enumValues[number] {
  if (!(conversationMediumEnum.enumValues as readonly string[]).includes(value))
    throw new Error(`Invalid conversation medium: "${value}". Must be one of: ${conversationMediumEnum.enumValues.join(", ")}`);
  return value as typeof conversationMediumEnum.enumValues[number];
}

export function assertValidEventType(value: string): typeof eventTypeEnum.enumValues[number] {
  if (!(eventTypeEnum.enumValues as readonly string[]).includes(value))
    throw new Error(`Invalid event type: "${value}". Must be one of: ${eventTypeEnum.enumValues.join(", ")}`);
  return value as typeof eventTypeEnum.enumValues[number];
}

export function assertValidReminderStatus(value: string): typeof reminderStatusEnum.enumValues[number] {
  if (!(reminderStatusEnum.enumValues as readonly string[]).includes(value))
    throw new Error(`Invalid reminder status: "${value}". Must be one of: ${reminderStatusEnum.enumValues.join(", ")}`);
  return value as typeof reminderStatusEnum.enumValues[number];
}

export function assertValidGender(value: string): typeof genderEnum.enumValues[number] {
  if (!(genderEnum.enumValues as readonly string[]).includes(value))
    throw new Error(`Invalid gender: "${value}". Must be one of: ${genderEnum.enumValues.join(", ")}`);
  return value as typeof genderEnum.enumValues[number];
}
