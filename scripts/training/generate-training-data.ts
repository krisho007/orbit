#!/usr/bin/env bun
/**
 * Generates synthetic training data for the fine-tuned Orbit CRM assistant model.
 *
 * Uses Anthropic Claude API (Opus) to generate diverse training examples
 * from seed examples, organized by category.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-xxx bun run scripts/training/generate-training-data.ts
 *
 * Options:
 *   --category=create_contact   Generate for specific category only
 *   --count=300                 Override per-category count
 *   --batch-size=20             Examples per API call
 *   --dry-run                   Print prompts without calling API
 *   --output=path               Output file (default: scripts/training/generated.jsonl)
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync } from "fs";
import { resolve, dirname } from "path";

const SCRIPT_DIR = dirname(new URL(import.meta.url).pathname);
const SEED_FILE = resolve(SCRIPT_DIR, "seed-examples.jsonl");
const DEFAULT_OUTPUT = resolve(SCRIPT_DIR, "generated.jsonl");

// ── Category definitions ────────────────────────────────────────────

type CategoryConfig = {
  name: string;
  count: number;
  instructions: string;
  seedFilter?: (example: any) => boolean;
};

const CATEGORIES: CategoryConfig[] = [
  {
    name: "create_contact",
    count: 300,
    instructions: `Vary: just name, full details (phone/email/company/job), company-as-contact,
diverse names (Indian, American, European, East Asian, Latin American).
Include cases: nickname-only ("Add Johnny"), multiple fields, minimal input.`,
    seedFilter: (e) => e.output.intents.includes("create_contact"),
  },
  {
    name: "search_contact",
    count: 250,
    instructions: `Vary: by name, phone number, company, "who is...", "show all contacts",
partial name matches, "find everyone at [company]", "contacts I added this week".`,
    seedFilter: (e) => e.output.intents.includes("search_contact"),
  },
  {
    name: "edit_contact",
    count: 200,
    instructions: `Vary: update single field (phone/email/job/company), update multiple fields,
"change", "update", "fix", "correct" phrasings. Include ambiguous names.`,
    seedFilter: (e) => e.output.intents.includes("edit_contact"),
  },
  {
    name: "create_conversation",
    count: 400,
    instructions: `Vary all 12 mediums: PHONE_CALL, WHATSAPP, EMAIL, IN_PERSON, ZOOM, TEAMS,
GOOGLE_MEET, SMS, SLACK, LINKEDIN, TELEGRAM, OTHER.
Vary: with/without explicit time, rich content extraction, terse input ("call bob re: project"),
casual ("chatted with"), formal ("had a discussion regarding").`,
    seedFilter: (e) => e.output.intents.includes("create_conversation"),
  },
  {
    name: "create_conversation_with_contact",
    count: 200,
    instructions: `New contact + conversation combo. User describes meeting someone new.
Include: conference meetings, introductions, cold calls with new leads.
Model should output actions[] with create_contact first, then create_conversation.`,
    seedFilter: (e) => e.output.intents.includes("create_conversation_with_contact"),
  },
  {
    name: "search_conversation",
    count: 200,
    instructions: `Vary: by participant name, topic/content, medium, date range,
"show me", "what did I discuss with", "conversations about".`,
    seedFilter: (e) => e.output.intents.includes("search_conversation"),
  },
  {
    name: "edit_conversation",
    count: 150,
    instructions: `Vary: change medium, update content/notes, add participants, change time.
"Actually that was a Zoom call not a phone call", "Add more details to my last conversation".`,
    seedFilter: (e) => e.output.intents.includes("edit_conversation"),
  },
  {
    name: "create_event",
    count: 300,
    instructions: `Vary all 8 event types: MEETING, CALL, BIRTHDAY, ANNIVERSARY, LUNCH, DINNER,
CONFERENCE, OTHER. Include: with times/locations/participants, recurring hints,
"schedule", "set up", "plan", "book".`,
    seedFilter: (e) => e.output.intents.includes("create_event"),
  },
  {
    name: "create_event_with_conversation",
    count: 150,
    instructions: `Event + linked conversation. "Had a meeting with X, discussed Y."
Model creates both event and conversation linked to the same participants.`,
    seedFilter: (e) => e.output.intents.includes("create_event_with_conversation"),
  },
  {
    name: "search_event",
    count: 200,
    instructions: `Vary: by participant, type, date range, location,
"what's coming up", "show meetings this week", "events with Alice".`,
    seedFilter: (e) => e.output.intents.includes("search_event"),
  },
  {
    name: "edit_event",
    count: 150,
    instructions: `Vary: reschedule, change location, add/remove participants, change type.
"Move the meeting to 3pm", "Change the venue to conference room B".`,
    seedFilter: (e) => e.output.intents.includes("edit_event"),
  },
  {
    name: "create_reminder",
    count: 250,
    instructions: `Vary: follow-ups, deadlines, with/without participants, various time expressions.
"remind me", "don't forget", "I need to", "set a reminder".`,
    seedFilter: (e) => e.output.intents.includes("create_reminder"),
  },
  {
    name: "create_reminder_with_context",
    count: 150,
    instructions: `Reminders linked to conversations or events.
"After my call with X, remind me to...", "Following up on the meeting about Y".`,
    seedFilter: (e) => e.output.intents.includes("create_reminder_with_context"),
  },
  {
    name: "search_reminder",
    count: 150,
    instructions: `Vary: by status (pending/done), due date, participant, keyword.
"show my pending reminders", "what's due this week", "reminders about invoices".`,
    seedFilter: (e) => e.output.intents.includes("search_reminder"),
  },
  {
    name: "edit_reminder",
    count: 150,
    instructions: `Vary: reschedule, complete, change status, update notes.
"push the reminder to Friday", "mark the invoice reminder as done", "cancel the follow-up".`,
    seedFilter: (e) => e.output.intents.includes("edit_reminder"),
  },
  {
    name: "delete_entity",
    count: 100,
    instructions: `All 4 entity types. Model should NOT perform deletion — instead direct to UI.
"delete contact X", "remove the event", "get rid of that reminder".
Response should explain that deletion happens through the UI for safety.`,
    seedFilter: (e) => e.output.intents.includes("delete_entity"),
  },
  {
    name: "unknown",
    count: 200,
    instructions: `Greetings, off-topic questions, partial/unclear inputs, chitchat.
"hello", "what's the weather", "thanks", "help", incomplete sentences.
Model responds helpfully with what it can do, no actions/searches.`,
    seedFilter: (e) => e.output.intents.includes("unknown"),
  },
  {
    name: "multi_intent",
    count: 400,
    instructions: `2-3 actions in one message. Use actions[] array (not single action).
"Add a contact for X and log a call with them about Y"
"Email Bob about the report and set a reminder to follow up"
"Met Sarah (new contact, PM at Meta) for lunch, discussed hiring plans"`,
    seedFilter: (e) => e.output.intents.length > 1,
  },
  {
    name: "timezone_time",
    count: 200,
    instructions: `Focus on relative time expressions and timezone handling.
"tomorrow at 3pm", "last Tuesday", "in 2 hours", "next Friday morning".
Vary timezones: Asia/Kolkata, America/New_York, Europe/London, Asia/Tokyo, America/Los_Angeles.
Use relative tokens: NOW, TODAY_HH:MM, TOMORROW_HH:MM, YESTERDAY_HH:MM, +Nd_HH:MM, -Nd_HH:MM.`,
  },
  {
    name: "ambiguity",
    count: 150,
    instructions: `Multiple possible contact matches, unclear entity references.
"Call with Alex" (multiple Alexes), "update the meeting" (which meeting?).
Model should set needs_resolution=true and include appropriate searches.`,
  },
];

// ── Prompt template ─────────────────────────────────────────────────

function buildGenerationPrompt(
  category: CategoryConfig,
  seedExamples: any[],
  batchSize: number
): string {
  const filteredSeeds = category.seedFilter
    ? seedExamples.filter(category.seedFilter)
    : seedExamples;

  const seedSamples = filteredSeeds.slice(0, 5);
  const seedText = seedSamples
    .map((s) => JSON.stringify(s))
    .join("\n");

  return `Generate ${batchSize} diverse training examples for the category: ${category.name}

Context: Personal CRM assistant (Orbit) that manages contacts, conversations, events, and reminders.
The model outputs structured JSON that gets executed deterministically by an API layer.

Input format: {"messages": [{"role": "user"|"assistant", "content": "..."}], "user_context": {"userName": "...", "timezone": "..."}, "current_datetime_utc": "ISO string"}
Output format: OrbitModelOutput JSON with fields: intents, searches, action/actions, response, needs_confirmation, needs_resolution

SCHEMA REFERENCE:
- intents: one of create_contact, search_contact, edit_contact, create_conversation, create_conversation_with_contact, search_conversation, edit_conversation, create_event, create_event_with_conversation, search_event, edit_event, create_reminder, create_reminder_with_context, search_reminder, edit_reminder, delete_entity, unknown
- searches[].search_type: fuzzy_name, phone, keyword, semantic
- searches[].purpose: resolve_participant, resolve_target, display_results
- action.operation: create, update, complete
- Conversation mediums: PHONE_CALL, WHATSAPP, EMAIL, IN_PERSON, ZOOM, TEAMS, GOOGLE_MEET, SMS, SLACK, LINKEDIN, TELEGRAM, OTHER
- Event types: MEETING, CALL, BIRTHDAY, ANNIVERSARY, LUNCH, DINNER, CONFERENCE, OTHER
- Time fields use relative tokens: NOW, TODAY_HH:MM, TOMORROW_HH:MM, YESTERDAY_HH:MM, NEXT_WEEK_HH:MM, +Nd, +Nd_HH:MM, -Nd, -Nd_HH:MM

REQUIREMENTS:
- Vary language register: casual ("chatted with"), business ("had a discussion with"), terse ("call bob re: project")
- Vary contact names: Indian (Priya, Raj, Ankit), American (John, Sarah, Mike), European (Hans, Marie, Luigi), East Asian (Chen Wei, Tanaka, Kim), Latin American (Maria, Carlos, Sofia)
- Vary timezones: Asia/Kolkata, America/New_York, Europe/London, Asia/Tokyo, America/Los_Angeles
- Include edge cases: missing info, typos, ambiguous mediums, partial names
- For time fields, always use relative tokens (never hardcoded dates)
- needs_confirmation=true for any create/update/complete action
- needs_confirmation=false for search-only and unknown intents
- needs_resolution=true when searches[] is non-empty AND contains resolve_participant or resolve_target
- NEVER include database IDs in response text
- ${category.instructions}

${seedSamples.length > 0 ? `SEED EXAMPLES for reference:\n${seedText}` : ""}

Output ONLY a JSON array of {input, output} objects. No markdown, no explanation.`;
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const categoryFilter = args.find((a) => a.startsWith("--category="))?.split("=")[1];
  const countOverride = args.find((a) => a.startsWith("--count="))?.split("=")[1];
  const batchSizeArg = args.find((a) => a.startsWith("--batch-size="))?.split("=")[1];
  const dryRun = args.includes("--dry-run");
  const outputPath = args.find((a) => a.startsWith("--output="))?.split("=")[1] || DEFAULT_OUTPUT;
  const batchSize = batchSizeArg ? parseInt(batchSizeArg, 10) : 20;

  if (!process.env.ANTHROPIC_API_KEY && !dryRun) {
    console.error("Error: ANTHROPIC_API_KEY environment variable is required.");
    console.error("Usage: ANTHROPIC_API_KEY=sk-xxx bun run scripts/training/generate-training-data.ts");
    process.exit(1);
  }

  // Load seed examples
  if (!existsSync(SEED_FILE)) {
    console.error(`Seed file not found: ${SEED_FILE}`);
    process.exit(1);
  }

  const seedLines = readFileSync(SEED_FILE, "utf-8")
    .split("\n")
    .filter((line) => line.trim().length > 0);
  const seedExamples = seedLines.map((line) => JSON.parse(line));
  console.log(`Loaded ${seedExamples.length} seed examples`);

  // Filter categories if specified
  const categories = categoryFilter
    ? CATEGORIES.filter((c) => c.name === categoryFilter)
    : CATEGORIES;

  if (categories.length === 0) {
    console.error(`Unknown category: ${categoryFilter}`);
    console.error(`Available: ${CATEGORIES.map((c) => c.name).join(", ")}`);
    process.exit(1);
  }

  // Initialize output file
  if (!dryRun && !existsSync(outputPath)) {
    writeFileSync(outputPath, "");
  }

  let totalGenerated = 0;

  for (const category of categories) {
    const targetCount = countOverride ? parseInt(countOverride, 10) : category.count;
    const batches = Math.ceil(targetCount / batchSize);

    console.log(`\n--- Category: ${category.name} (${targetCount} examples in ${batches} batches) ---`);

    for (let batch = 0; batch < batches; batch++) {
      const remaining = targetCount - batch * batchSize;
      const currentBatchSize = Math.min(batchSize, remaining);

      const prompt = buildGenerationPrompt(category, seedExamples, currentBatchSize);

      if (dryRun) {
        console.log(`[Batch ${batch + 1}/${batches}] Would generate ${currentBatchSize} examples`);
        console.log(`Prompt length: ${prompt.length} chars`);
        continue;
      }

      console.log(`[Batch ${batch + 1}/${batches}] Generating ${currentBatchSize} examples...`);

      try {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": process.env.ANTHROPIC_API_KEY!,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-opus-4-20250514",
            max_tokens: 8192,
            messages: [{ role: "user", content: prompt }],
          }),
        });

        if (!response.ok) {
          const error = await response.text();
          console.error(`  API error (${response.status}): ${error}`);
          continue;
        }

        const data = (await response.json()) as any;
        const text = data.content?.[0]?.text || "";

        // Parse the response as JSON array
        let examples: any[];
        try {
          examples = JSON.parse(text.trim());
          if (!Array.isArray(examples)) {
            console.error(`  Expected array, got ${typeof examples}`);
            continue;
          }
        } catch {
          console.error(`  Failed to parse response as JSON`);
          console.error(`  First 500 chars: ${text.substring(0, 500)}`);
          continue;
        }

        // Append to output file
        for (const example of examples) {
          appendFileSync(outputPath, JSON.stringify(example) + "\n");
          totalGenerated++;
        }

        console.log(`  Generated ${examples.length} examples (total: ${totalGenerated})`);

        // Rate limit: wait between batches
        if (batch < batches - 1) {
          await new Promise((r) => setTimeout(r, 1000));
        }
      } catch (err) {
        console.error(`  Error: ${err}`);
      }
    }
  }

  console.log(`\nDone! Total generated: ${totalGenerated} examples`);
  console.log(`Output: ${outputPath}`);
}

main().catch(console.error);
