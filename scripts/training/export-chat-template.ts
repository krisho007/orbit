#!/usr/bin/env bun
/**
 * Exports validated training data to Qwen chat template JSONL format for Unsloth fine-tuning.
 *
 * Converts {input, output} pairs to the Qwen/ChatML format:
 *   <|im_start|>system\n{system prompt}<|im_end|>
 *   <|im_start|>user\n{user message}<|im_end|>
 *   <|im_start|>assistant\n{structured JSON}<|im_end|>
 *
 * Usage:
 *   bun run scripts/training/export-chat-template.ts [input.jsonl] [--output=path]
 *
 * Options:
 *   --output=path     Output file (default: scripts/training/train.jsonl)
 *   --test-split=0.15 Fraction to hold out as test set (default: 0.15)
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";

const SCRIPT_DIR = dirname(new URL(import.meta.url).pathname);

function buildSystemPrompt(input: any): string {
  const ctx = input.user_context || {};
  const now = input.current_datetime_utc || new Date().toISOString();

  return [
    "You are the Orbit CRM assistant. Output valid JSON matching the OrbitModelOutput schema.",
    `User: ${ctx.userName || "User"} | Timezone: ${ctx.timezone || "UTC"} | UTC now: ${now}`,
    "Mediums: PHONE_CALL, WHATSAPP, EMAIL, IN_PERSON, ZOOM, TEAMS, GOOGLE_MEET, SMS, SLACK, LINKEDIN, TELEGRAM, OTHER",
    "Event types: MEETING, CALL, BIRTHDAY, ANNIVERSARY, LUNCH, DINNER, CONFERENCE, OTHER",
    "Reminder statuses: OPEN, SNOOZED, DONE, CANCELED",
    "For time fields use relative tokens: NOW, TODAY_HH:MM, TOMORROW_HH:MM, YESTERDAY_HH:MM, +Nd_HH:MM, -Nd_HH:MM",
  ].join("\n");
}

function toChatML(input: any, output: any): object {
  const messages: Array<{ role: string; content: string }> = [];

  // System message
  messages.push({
    role: "system",
    content: buildSystemPrompt(input),
  });

  // Conversation history
  const inputMessages = input.messages || [];
  for (const msg of inputMessages) {
    messages.push({
      role: msg.role,
      content: msg.content,
    });
  }

  // Model output (assistant response as structured JSON)
  messages.push({
    role: "assistant",
    content: JSON.stringify(output),
  });

  return { messages };
}

function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  return shuffled;
}

async function main() {
  const args = process.argv.slice(2);
  const inputFile = args.find((a) => !a.startsWith("--")) ||
    resolve(SCRIPT_DIR, "validated.jsonl");
  const outputPath = args.find((a) => a.startsWith("--output="))?.split("=")[1] ||
    resolve(SCRIPT_DIR, "train.jsonl");
  const testSplitStr = args.find((a) => a.startsWith("--test-split="))?.split("=")[1];
  const testSplit = testSplitStr ? parseFloat(testSplitStr) : 0.15;

  const lines = readFileSync(inputFile, "utf-8")
    .split("\n")
    .filter((l) => l.trim().length > 0);

  console.log(`Converting ${lines.length} examples to chat template format`);

  const examples: any[] = [];
  for (const line of lines) {
    try {
      const data = JSON.parse(line);
      const converted = toChatML(data.input, data.output);
      examples.push(converted);
    } catch (err) {
      console.error(`Skipping invalid line: ${err}`);
    }
  }

  // Shuffle and split
  const shuffled = shuffleArray(examples);
  const testCount = Math.floor(shuffled.length * testSplit);
  const trainExamples = shuffled.slice(0, shuffled.length - testCount);
  const testExamples = shuffled.slice(shuffled.length - testCount);

  // Write train set
  writeFileSync(
    outputPath,
    trainExamples.map((e) => JSON.stringify(e)).join("\n") + "\n"
  );

  // Write test set
  const testPath = outputPath.replace(".jsonl", "-test.jsonl");
  writeFileSync(
    testPath,
    testExamples.map((e) => JSON.stringify(e)).join("\n") + "\n"
  );

  console.log(`Train set: ${trainExamples.length} examples → ${outputPath}`);
  console.log(`Test set:  ${testExamples.length} examples → ${testPath}`);
}

main().catch(console.error);
