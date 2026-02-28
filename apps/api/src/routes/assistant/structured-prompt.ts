/**
 * System prompt builder for Path 3: Gemini Few-Shot Structured Output.
 *
 * Assembles a detailed system prompt that includes the full OrbitModelOutput schema,
 * rules, and 8-10 selected few-shot examples from the seed dataset so that Gemini
 * Flash Lite can produce valid JSON in a single pass without fine-tuning.
 */

import { formatToday } from "./types";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── Load & cache seed examples at startup ────────────────────────────

type SeedExample = {
  input: {
    messages: Array<{ role: string; content: string }>;
    user_context: { userName: string; timezone: string };
    current_datetime_utc: string;
  };
  output: Record<string, unknown>;
};

let cachedExamples: SeedExample[] | null = null;

function loadSeedExamples(): SeedExample[] {
  if (cachedExamples) return cachedExamples;

  try {
    const filePath = resolve(
      import.meta.dir,
      "../../../../../scripts/training/seed-examples.jsonl"
    );
    const raw = readFileSync(filePath, "utf-8");
    cachedExamples = raw
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as SeedExample);
  } catch (err) {
    console.warn("[assistant:structured] Failed to load seed examples:", err);
    cachedExamples = [];
  }

  return cachedExamples;
}

/**
 * Select a representative subset of seed examples covering key patterns.
 * Indices chosen from the seed dataset:
 *
 *  0 - create_conversation (log a call with contact)
 *  1 - create_contact (simple)
 *  2 - search_conversation (contact resolve_target + display results, "conversations with Bob")
 *  3 - create_reminder (with relative time)
 *  4 - create_event (standalone, single participant)
 *  5 - unknown / greeting
 *  6 - edit_contact (update field)
 * 10 - search_event (display results, "upcoming events")
 * 14 - delete_entity
 * 15 - create_conversation_with_contact (multi-action, explicit "new contact")
 * 16 - search_reminder (display results, "pending reminders")
 * 18 - multi-intent (conversation + event)
 * 20 - create_conversation with search-first (ambiguous name, no "new contact")
 * 21 - search_conversation (display results, "latest conversations" without name)
 * 22 - search_conversation (contact resolve_target + display results, "conversations with Vikram")
 * 23 - multi-intent (contact + event, "create contact and schedule a call")
 * 24 - multi-intent (contact + conversation + event, "met someone, log it, schedule follow-up")
 * 25 - multi-intent (contact + reminder, IST timezone)
 * 26 - multi-intent (contact + conversation + reminder, "met someone, log it, remind me")
 * 27 - journaling (personal note → JOURNAL event — "sowed bendekai seeds")
 * 28 - journaling (personal note → JOURNAL event — "went for a walk")
 * 29 - journaling (personal note → JOURNAL event — "feeling stressed")
 */
const SELECTED_INDICES = [0, 1, 2, 3, 4, 5, 6, 10, 14, 15, 16, 18, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29];

function selectExamples(all: SeedExample[]): SeedExample[] {
  return SELECTED_INDICES.filter((i) => i < all.length).map((i) => all[i]!);
}

function formatExample(ex: SeedExample): string {
  const userMsg =
    ex.input.messages.find((m) => m.role === "user")?.content ?? "";
  const outputJson = JSON.stringify(ex.output);

  // Include date context so the LLM sees the date→output mapping
  const utc = new Date(ex.input.current_datetime_utc);
  const tz = ex.input.user_context.timezone;
  const dateStr = utc.toLocaleDateString("en-US", {
    timeZone: tz,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const timeStr = utc.toLocaleTimeString("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  return `Context: ${dateStr}, ${timeStr} (${tz})\nUser: "${userMsg}"\nOutput: ${outputJson}`;
}

// ── Schema documentation ─────────────────────────────────────────────

const SCHEMA_DOC = `
OrbitModelOutput:
- intents: string[] — one or more of: create_contact, search_contact, edit_contact, create_conversation, create_conversation_with_contact, search_conversation, edit_conversation, create_event, create_event_with_conversation, search_event, edit_event, create_reminder, create_reminder_with_context, search_reminder, edit_reminder, delete_entity, unknown
- searches: SearchInstruction[] — what to look up before acting (can be empty)
- action: ActionInstruction | null — single-intent mutation (use for one action)
- actions: ActionInstruction[] | undefined — multi-intent mutations (use instead of action when multiple)
- response: string — human-friendly text for the user
- needs_confirmation: boolean — true for any create/update/complete action
- needs_resolution: boolean — true if any search has purpose resolve_participant or resolve_target

SearchInstruction:
- id: "s1", "s2", etc.
- entity_type: contact | conversation | event | reminder
- search_type: fuzzy_name | phone | keyword | semantic
- query: string (MUST be non-empty — for broad searches like "upcoming events" or "all contacts", use a descriptive keyword e.g. "upcoming", "all")
- purpose: resolve_participant | resolve_target | display_results

ActionInstruction:
- operation: create | update | complete
- entity_type: contact | conversation | event | reminder | relationship
- params: field-specific params (use camelCase keys):
    contact:      displayName, primaryPhone, primaryEmail, company, jobTitle, location, dateOfBirth, gender, notes
    conversation: medium (required), content, happenedAt, followUpAt
    event:        title (required), startAt (required), endAt, location, description, eventType (required)
    reminder:     title (required), dueAt (required), notes, status
- participant_refs: ["s1.best_match"] (optional — for linking to search results)
- target_ref: "s1.best_match" (optional — for updates/completions)
`.trim();

// ── Rules ────────────────────────────────────────────────────────────

const RULES = `
Rules:
- needs_confirmation = true for ANY create/update/complete action — you MUST include the action (or actions[]) field when needs_confirmation is true
- needs_confirmation = false for search-only and unknown intents
- needs_resolution = true when searches[] contains purpose resolve_participant or resolve_target
- needs_resolution = false when all searches are display_results or there are no searches
- For time fields, output ISO 8601 datetime in the user's LOCAL timezone (no Z suffix), e.g. "2026-03-04T15:00:00"
- Compute the actual date from the user's current date/time shown above (e.g., "tomorrow" = current date + 1 day)
- For "now" or "just now", use the current datetime shown above
- NEVER output relative tokens like "TOMORROW" or "+3d" — always resolve to a concrete datetime
- NEVER include database IDs in the response text
- For multi-action messages, use the actions[] array (not the singular action field)
- For single actions, use the action field (not actions[])
- For delete requests, set intents to ["delete_entity"] with NO action — explain deletion is done via UI
- For greetings or unrelated chitchat, set intents to ["unknown"] with no searches and no action
- For personal journal entries (e.g. "I went for a walk", "planted some seeds today", "feeling stressed"), create an event with eventType "JOURNAL" — use the message as the description, derive a short title, and respond with a brief casual acknowledgment (1 sentence max, like a friend would)
- When creating a conversation with a new contact (not in CRM), use intents ["create_conversation_with_contact"] with actions[] containing both a contact create and a conversation create, where the conversation uses participant_refs: ["created_contact.best_match"]
- When someone is mentioned by name and you are unsure whether they exist in the CRM, ALWAYS search first (purpose: resolve_participant). Only use create_conversation_with_contact when the user explicitly says "new contact" or "add a contact". The system will handle creating the contact if the search finds no match.
- The response should be natural, concise, and describe what you will do
`.trim();

// ── Main builder ─────────────────────────────────────────────────────

export function buildStructuredSystemPrompt(
  userContext: {
    userName: string | null;
    userEmail: string;
    primaryContactId: string | null;
    primaryContactName: string | null;
  },
  enumConfig: {
    conversationMediums: string[];
    eventTypes: string[];
    reminderStatuses: string[];
  },
  timezone: string
): string {
  const now = new Date();
  const todayStr = formatToday(now, timezone);

  const examples = selectExamples(loadSeedExamples());
  const formattedExamples = examples.map(formatExample).join("\n\n");

  const userContactLine = userContext.primaryContactId
    ? `User's contact: ${userContext.primaryContactName} (${userContext.primaryContactId})`
    : "";

  return [
    "You are the Orbit CRM assistant. You MUST respond with ONLY valid JSON matching the OrbitModelOutput schema below. No markdown, no explanation, no text before or after the JSON.",
    "",
    `User: ${userContext.userName || userContext.userEmail} | Timezone: ${timezone} | ${todayStr}`,
    userContactLine,
    "",
    "## Schema",
    "",
    SCHEMA_DOC,
    "",
    `Mediums: ${enumConfig.conversationMediums.join(", ")}`,
    `Event types: ${enumConfig.eventTypes.join(", ")}`,
    `Reminder statuses: ${enumConfig.reminderStatuses.join(", ")}`,
    "",
    "## " + RULES,
    "",
    "## Examples",
    "",
    formattedExamples,
  ]
    .filter((line) => line !== undefined)
    .join("\n");
}
