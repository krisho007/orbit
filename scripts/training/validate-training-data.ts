#!/usr/bin/env bun
/**
 * Validates and deduplicates the generated training data.
 *
 * Checks:
 * 1. JSON parsing
 * 2. Schema validation against OrbitModelOutput Zod schema
 * 3. Enum value validation
 * 4. Deduplication via text similarity
 * 5. Category statistics
 *
 * Usage:
 *   bun run scripts/training/validate-training-data.ts [input.jsonl] [--fix]
 *
 * Options:
 *   --fix     Write cleaned output to validated.jsonl
 *   --stats   Print per-intent statistics only
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import {
  orbitModelOutputSchema,
} from "../../apps/api/src/routes/assistant/finetuned-types";

const SCRIPT_DIR = dirname(new URL(import.meta.url).pathname);

// Valid enum values (must match DB schema)
const VALID_MEDIUMS = new Set([
  "PHONE_CALL", "WHATSAPP", "EMAIL", "IN_PERSON", "ZOOM", "TEAMS",
  "GOOGLE_MEET", "SMS", "SLACK", "LINKEDIN", "TELEGRAM", "OTHER",
]);

const VALID_EVENT_TYPES = new Set([
  "MEETING", "CALL", "BIRTHDAY", "ANNIVERSARY", "LUNCH", "DINNER",
  "CONFERENCE", "OTHER",
]);

const VALID_REMINDER_STATUSES = new Set([
  "OPEN", "SNOOZED", "DONE", "CANCELED",
]);

type ValidationResult = {
  line: number;
  valid: boolean;
  errors: string[];
  intents: string[];
};

function validateExample(data: any, lineNum: number): ValidationResult {
  const errors: string[] = [];

  // Check input structure
  if (!data.input || !data.output) {
    return { line: lineNum, valid: false, errors: ["Missing input or output"], intents: [] };
  }

  if (!data.input.messages || !Array.isArray(data.input.messages)) {
    errors.push("input.messages must be an array");
  }

  if (!data.input.user_context) {
    errors.push("input.user_context is required");
  }

  // Validate output against schema
  const result = orbitModelOutputSchema.safeParse(data.output);
  if (!result.success) {
    const zodErrors = result.error.issues.map(
      (i: any) => `${(i.path || []).join(".")}: ${i.message}`
    );
    errors.push(...zodErrors);
  }

  // Validate enum values in action params
  const actions = data.output.actions || (data.output.action ? [data.output.action] : []);
  for (const action of actions) {
    if (!action.params) continue;

    if (action.entity_type === "conversation" && action.params.medium) {
      if (!VALID_MEDIUMS.has(action.params.medium)) {
        errors.push(`Invalid medium: "${action.params.medium}"`);
      }
    }

    if (action.entity_type === "event" && action.params.eventType) {
      if (!VALID_EVENT_TYPES.has(action.params.eventType)) {
        errors.push(`Invalid eventType: "${action.params.eventType}"`);
      }
    }

    if (action.entity_type === "reminder" && action.params.status) {
      if (!VALID_REMINDER_STATUSES.has(action.params.status)) {
        errors.push(`Invalid reminder status: "${action.params.status}"`);
      }
    }
  }

  // Check that searches have valid IDs
  if (data.output.searches) {
    for (const search of data.output.searches) {
      if (!/^s\d+$/.test(search.id)) {
        errors.push(`Invalid search ID: "${search.id}"`);
      }
    }
  }

  // Consistency checks
  const intents = data.output.intents || [];

  if (intents.some((i: string) => i.startsWith("create_") || i.startsWith("edit_"))) {
    if (!data.output.needs_confirmation) {
      errors.push("Mutating intents should have needs_confirmation=true");
    }
  }

  if (data.output.searches?.length > 0) {
    const hasResolutionSearch = data.output.searches.some(
      (s: any) => s.purpose === "resolve_participant" || s.purpose === "resolve_target"
    );
    if (hasResolutionSearch && !data.output.needs_resolution) {
      errors.push("Searches with resolve_* purpose should have needs_resolution=true");
    }
  }

  return {
    line: lineNum,
    valid: errors.length === 0,
    errors,
    intents,
  };
}

function simpleTextHash(text: string): string {
  // Simple character-frequency based hash for dedup
  const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
  return normalized;
}

async function main() {
  const args = process.argv.slice(2);
  const inputFile = args.find((a) => !a.startsWith("--")) ||
    resolve(SCRIPT_DIR, "generated.jsonl");
  const doFix = args.includes("--fix");
  const statsOnly = args.includes("--stats");

  const lines = readFileSync(inputFile, "utf-8")
    .split("\n")
    .filter((l) => l.trim().length > 0);

  console.log(`Validating ${lines.length} examples from ${inputFile}\n`);

  const results: ValidationResult[] = [];
  const validExamples: any[] = [];
  const seenTexts = new Set<string>();
  let duplicates = 0;

  for (let i = 0; i < lines.length; i++) {
    let data: any;
    try {
      data = JSON.parse(lines[i]!);
    } catch {
      results.push({ line: i + 1, valid: false, errors: ["Invalid JSON"], intents: [] });
      continue;
    }

    // Dedup by user message text
    const userText = data.input?.messages
      ?.filter((m: any) => m.role === "user")
      .map((m: any) => m.content)
      .join(" ") || "";
    const hash = simpleTextHash(userText);
    if (seenTexts.has(hash)) {
      duplicates++;
      continue;
    }
    seenTexts.add(hash);

    const result = validateExample(data, i + 1);
    results.push(result);

    if (result.valid) {
      validExamples.push(data);
    }
  }

  // Statistics
  const valid = results.filter((r) => r.valid).length;
  const invalid = results.filter((r) => !r.valid).length;
  const intentCounts: Record<string, number> = {};

  for (const result of results) {
    for (const intent of result.intents) {
      intentCounts[intent] = (intentCounts[intent] || 0) + 1;
    }
  }

  console.log("═══ Summary ═══");
  console.log(`Total lines:    ${lines.length}`);
  console.log(`Valid:          ${valid}`);
  console.log(`Invalid:        ${invalid}`);
  console.log(`Duplicates:     ${duplicates}`);
  console.log(`After cleanup:  ${validExamples.length}`);

  console.log("\n═══ Per-Intent Counts ═══");
  const sortedIntents = Object.entries(intentCounts).sort((a, b) => b[1] - a[1]);
  for (const [intent, count] of sortedIntents) {
    console.log(`  ${intent.padEnd(40)} ${count}`);
  }

  if (!statsOnly) {
    // Print first 10 errors
    const errorResults = results.filter((r) => !r.valid);
    if (errorResults.length > 0) {
      console.log("\n═══ Sample Errors (first 10) ═══");
      for (const result of errorResults.slice(0, 10)) {
        console.log(`  Line ${result.line}: ${result.errors.join("; ")}`);
      }
    }
  }

  if (doFix) {
    const outputPath = resolve(SCRIPT_DIR, "validated.jsonl");
    writeFileSync(
      outputPath,
      validExamples.map((e) => JSON.stringify(e)).join("\n") + "\n"
    );
    console.log(`\nWrote ${validExamples.length} valid examples to ${outputPath}`);
  }
}

main().catch(console.error);
