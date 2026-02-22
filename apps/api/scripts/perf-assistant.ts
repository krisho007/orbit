#!/usr/bin/env bun
/**
 * Assistant API Performance Benchmark
 *
 * Makes 10 calls of increasing complexity to the assistant API,
 * measures first-response latency for each, and prints a summary table.
 *
 * Usage:
 *   cd apps/api
 *   bun run scripts/perf-assistant.ts
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── Env loader ──────────────────────────────────────────────────────
function loadEnvFile(filePath: string) {
  try {
    const content = readFileSync(filePath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let value = trimmed.slice(eqIdx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {}
}

const rootDir = resolve(import.meta.dir, "../../..");
loadEnvFile(resolve(rootDir, ".env.local"));

// ── Types ───────────────────────────────────────────────────────────
type ChatMessage = { role: "user" | "assistant"; content: string };

type AssistantResponse = {
  role: "assistant";
  content: string;
  ui?: { kind: string; [key: string]: any };
  actions?: Array<{ label: string; message: string; style: string }>;
  conversationId?: string;
  error?: string;
};

type BenchmarkResult = {
  id: number;
  label: string;
  category: string;
  prompt: string;
  elapsed: number;
  responsePreview: string;
  uiKind: string | null;
  hasActions: boolean;
  error?: string;
};

// ── Constants ───────────────────────────────────────────────────────
const API_BASE = process.env.API_BASE_URL || "http://localhost:3001";
const TEST_EMAIL = `orbit-perf-${Date.now()}@test.local`;
const TEST_PASSWORD = `PerfPass!${crypto.randomUUID().slice(0, 12)}`;

// ── Auth ────────────────────────────────────────────────────────────
async function authenticate(): Promise<{
  token: string;
  cleanup: () => Promise<void>;
}> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    throw new Error(
      "Missing env vars: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: createData, error: createError } =
    await admin.auth.admin.createUser({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
    });

  if (createError || !createData.user) {
    throw new Error(
      `Failed to create test user: ${createError?.message || "unknown"}`
    );
  }

  const userId = createData.user.id;
  const anonClient = createClient(supabaseUrl, supabaseAnonKey);
  const { data: signInData, error: signInError } =
    await anonClient.auth.signInWithPassword({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });

  if (signInError || !signInData.session) {
    throw new Error(
      `Failed to sign in: ${signInError?.message || "no session"}`
    );
  }

  const token = signInData.session.access_token;

  // Trigger DB user creation + set consent
  await fetch(`${API_BASE}/api/contacts?limit=1`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  await fetch(`${API_BASE}/api/users/me/consent`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ aiConsent: true }),
  });

  // Create a couple of contacts so searches have something to find
  for (const c of [
    { displayName: "PerfTest Alice", primaryEmail: "alice@example.com" },
    { displayName: "PerfTest Bob", company: "Acme Corp" },
    { displayName: "PerfTest Alice Wang", primaryPhone: "+1 555 123 4567" },
  ]) {
    await fetch(`${API_BASE}/api/contacts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(c),
    });
  }

  const cleanup = async () => {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error)
      console.warn(`  Warning: Failed to delete test user: ${error.message}`);
  };

  return { token, cleanup };
}

// ── API Caller ──────────────────────────────────────────────────────
async function callAssistant(
  token: string,
  messages: ChatMessage[]
): Promise<{ response: AssistantResponse; elapsed: number }> {
  const start = performance.now();

  const res = await fetch(`${API_BASE}/api/assistant`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messages }),
  });

  const elapsed = performance.now() - start;

  if (!res.ok) {
    const text = await res.text();
    return {
      response: {
        role: "assistant",
        content: "",
        error: `HTTP ${res.status}: ${text.slice(0, 200)}`,
      },
      elapsed,
    };
  }

  const data = (await res.json()) as AssistantResponse;
  return { response: data, elapsed };
}

// ── Benchmark Prompts ───────────────────────────────────────────────
// Ordered from simplest to most complex
const PROMPTS: Array<{
  label: string;
  category: string;
  prompt: string;
}> = [
  {
    label: "Greeting",
    category: "no-op",
    prompt: "Hello",
  },
  {
    label: "Simple question",
    category: "no-op",
    prompt: "What can you help me with?",
  },
  {
    label: "Search contacts (unique)",
    category: "search",
    prompt: "Find PerfTest Bob",
  },
  {
    label: "Search contacts (ambiguous)",
    category: "search",
    prompt: "Find Alice",
  },
  {
    label: "Create contact (simple)",
    category: "create",
    prompt: "Create a contact named PerfTest Charlie",
  },
  {
    label: "Create contact (detailed)",
    category: "create",
    prompt:
      'Create a contact: PerfTest Diana, email diana@example.com, phone +1 555 999 0000, works at TechCorp',
  },
  {
    label: "Log conversation",
    category: "create",
    prompt: "I had a phone call with PerfTest Bob yesterday about the Q1 roadmap",
  },
  {
    label: "Create reminder",
    category: "create",
    prompt: "Remind me to follow up with PerfTest Bob next Monday",
  },
  {
    label: "Create event",
    category: "create",
    prompt: "Schedule a meeting with PerfTest Bob tomorrow at 3pm to discuss the project",
  },
  {
    label: "Complex multi-entity",
    category: "create",
    prompt:
      "I met PerfTest Bob and PerfTest Alice for coffee today, we discussed the partnership deal and I need to follow up with them by Friday",
  },
];

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  console.log("\n🔬 Assistant API Performance Benchmark\n");
  console.log("  Authenticating...");

  const { token, cleanup } = await authenticate();
  console.log("  Authenticated. Starting benchmark...\n");

  const results: BenchmarkResult[] = [];

  for (let i = 0; i < PROMPTS.length; i++) {
    const entry = PROMPTS[i];
    if (!entry) continue;
    const { label, category, prompt } = entry;
    const num = `${i + 1}`.padStart(2, " ");
    process.stdout.write(`  [${num}/10] ${label.padEnd(32)} `);

    try {
      const { response, elapsed } = await callAssistant(token, [
        { role: "user", content: prompt },
      ]);

      const elapsedSec = (elapsed / 1000).toFixed(2);
      const preview = (response.content || "").slice(0, 80).replace(/\n/g, " ");
      const uiKind = response.ui?.kind || null;
      const hasActions = !!(response.actions && response.actions.length > 0);

      if (response.error) {
        console.log(`❌ ${elapsedSec}s  ERROR: ${response.error.slice(0, 60)}`);
      } else {
        const uiTag = uiKind ? ` [ui:${uiKind}]` : "";
        const actTag = hasActions ? " [actions]" : "";
        console.log(`${elapsedSec}s${uiTag}${actTag}`);
      }

      results.push({
        id: i + 1,
        label,
        category,
        prompt,
        elapsed,
        responsePreview: preview,
        uiKind,
        hasActions,
        error: response.error,
      });
    } catch (err) {
      console.log(`❌ FETCH ERROR: ${String(err).slice(0, 80)}`);
      results.push({
        id: i + 1,
        label,
        category,
        prompt,
        elapsed: 0,
        responsePreview: "",
        uiKind: null,
        hasActions: false,
        error: String(err),
      });
    }
  }

  // ── Summary Table ───────────────────────────────────────────────
  console.log("\n" + "═".repeat(100));
  console.log("  RESULTS SUMMARY");
  console.log("═".repeat(100));
  console.log(
    "  #   Category   Time(s)  Label                            UI Kind        Actions  Preview"
  );
  console.log("─".repeat(100));

  const times = results.filter((r) => !r.error).map((r) => r.elapsed);

  for (const r of results) {
    const num = `${r.id}`.padStart(2);
    const cat = r.category.padEnd(9);
    const time = r.error ? "ERR   " : `${(r.elapsed / 1000).toFixed(2)}s `.padStart(7);
    const lbl = r.label.padEnd(32);
    const ui = (r.uiKind || "-").padEnd(14);
    const act = r.hasActions ? "YES    " : "-      ";
    const preview = r.responsePreview.slice(0, 40);
    console.log(`  ${num}  ${cat}  ${time}  ${lbl}  ${ui}  ${act}  ${preview}`);
  }

  console.log("─".repeat(100));

  if (times.length > 0) {
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const min = Math.min(...times);
    const max = Math.max(...times);
    const p50 = times.sort((a, b) => a - b)[Math.floor(times.length / 2)]!;
    const total = times.reduce((a, b) => a + b, 0);

    console.log(`\n  📊 Statistics (${times.length} successful calls):`);
    console.log(`     Total:   ${(total / 1000).toFixed(2)}s`);
    console.log(`     Average: ${(avg / 1000).toFixed(2)}s`);
    console.log(`     Median:  ${(p50 / 1000).toFixed(2)}s`);
    console.log(`     Min:     ${(min / 1000).toFixed(2)}s`);
    console.log(`     Max:     ${(max / 1000).toFixed(2)}s`);
  }

  // ── Cleanup ─────────────────────────────────────────────────────
  console.log("\n  Cleaning up test user...");
  await cleanup();
  console.log("  Done.\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
