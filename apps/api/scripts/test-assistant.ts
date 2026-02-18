#!/usr/bin/env bun
/**
 * Automated Assistant E2E Test Harness
 *
 * Authenticates via Supabase Admin API (creates a temp test user),
 * runs declarative test scenarios against a running local API,
 * captures the full multi-turn conversation flow, generates an
 * HTML report, and cleans up all test-created entities afterward.
 *
 * Usage:
 *   cd apps/api
 *   bun run test:assistant:e2e
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Load additional env files that Bun doesn't auto-load (root .env.local)
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
      // Strip surrounding quotes
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      // Don't override existing env vars
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // File doesn't exist, that's fine
  }
}

// Load root .env.local (has SUPABASE_SERVICE_ROLE_KEY)
const rootDir = resolve(import.meta.dir, "../../..");
loadEnvFile(resolve(rootDir, ".env.local"));

// ── Types ──────────────────────────────────────────────────────────

type ChatMessage = { role: "user" | "assistant"; content: string };

type AssistantResponse = {
  role: "assistant";
  content: string;
  ui?: {
    kind: string;
    cards?: Array<{ kind: string; [key: string]: any }>;
    options?: Array<{ id: string; selectMessage: string; title: string; entityKind: string }>;
    prompt?: string;
    count?: number;
    [key: string]: any;
  };
  actions?: Array<{ label: string; message: string; style: "primary" | "secondary" }>;
  conversationId?: string;
  error?: string;
};

type ConversationTurn = {
  role: "user" | "assistant";
  content: string;
  ui?: AssistantResponse["ui"];
  actions?: AssistantResponse["actions"];
  source: "scenario" | "auto-confirm" | "auto-select" | "auto-reject" | "auto-disambiguate";
  elapsed?: number;
  timestamp: number;
};

type Expectation = {
  /** Expected final UI kind (e.g. "created", "contacts", "events") */
  finalUiKind?: string;
  /** Expected entity kinds inside created cards */
  createdEntityKinds?: string[];
  /** Substring that must appear in any assistant response content */
  contentSubstring?: string;
  /** If true, expect NO ui in the final response */
  noUi?: boolean;
};

type TestScenario = {
  id: string;
  name: string;
  category: string;
  messages: string[];
  /** What to do when a confirmation prompt appears: "confirm" (default) or "reject" */
  onConfirmation?: "confirm" | "reject";
  /** If true, this scenario needs the disambiguation setup contacts to exist */
  requiresSetup?: boolean;
  /** Pre-canned replies for when the assistant asks a clarifying question (no actions/selection UI).
   *  The harness sends these in order when it detects a question mark in the response. */
  disambiguationReplies?: string[];
  expectations: Expectation;
};

type CreatedEntity = {
  kind: "contact" | "conversation" | "event" | "reminder";
  id: string;
};

type ScenarioResult = {
  scenario: TestScenario;
  turns: ConversationTurn[];
  createdEntities: CreatedEntity[];
  passed: boolean;
  failureReason?: string;
  totalElapsed: number;
};

// ── Constants ──────────────────────────────────────────────────────

const API_BASE = process.env.API_BASE_URL || "http://localhost:3001";
const MAX_TURNS = 10;
const TEST_EMAIL = `orbit-test-harness-${Date.now()}@test.local`;
const TEST_PASSWORD = `TestPass!${crypto.randomUUID().slice(0, 12)}`;

// ── Setup Data ────────────────────────────────────────────────────
// Pre-create contacts for disambiguation scenarios.
// These contacts exist BEFORE the assistant is asked about them.

type SetupContact = { displayName: string; company?: string; primaryEmail?: string; primaryPhone?: string; notes?: string };

const SETUP_CONTACTS: SetupContact[] = [
  // Two "John" contacts for disambiguation
  { displayName: "TestBot John Smith", company: "TestCorp Engineering", primaryEmail: "john.smith@testcorp.example" },
  { displayName: "TestBot John Doe", company: "TestCorp Marketing", primaryEmail: "john.doe@testcorp.example" },
  // Two "Sarah" contacts for disambiguation
  { displayName: "TestBot Sarah Lee", primaryPhone: "+1 555 000 2001" },
  { displayName: "TestBot Sarah Kim", primaryPhone: "+1 555 000 2002" },
  // Unique contacts for multi-participant and event scenarios
  { displayName: "TestBot David", company: "TestCorp", primaryEmail: "david@testcorp.example" },
  { displayName: "TestBot Emma", company: "TestCorp", primaryEmail: "emma@testcorp.example" },
];

async function setupTestData(token: string): Promise<string[]> {
  const createdIds: string[] = [];
  for (const contact of SETUP_CONTACTS) {
    try {
      const res = await fetch(`${API_BASE}/api/contacts`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(contact),
      });
      if (res.ok) {
        const data = (await res.json()) as any;
        createdIds.push(data.id);
      } else {
        console.warn(`    Failed to create setup contact "${contact.displayName}": ${res.status}`);
      }
    } catch (err) {
      console.warn(`    Error creating setup contact "${contact.displayName}": ${err}`);
    }
  }
  return createdIds;
}

async function cleanupSetupData(token: string, ids: string[]): Promise<void> {
  for (const id of ids) {
    try {
      await fetch(`${API_BASE}/api/contacts/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {}
  }
}

// ── Auth ───────────────────────────────────────────────────────────

async function authenticate(): Promise<{ token: string; userId: string; cleanup: () => Promise<void> }> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    throw new Error(
      "Missing required env vars: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  // Admin client to create/delete test user
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Create temp test user
  const { data: createData, error: createError } = await admin.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
  });

  if (createError || !createData.user) {
    throw new Error(`Failed to create test user: ${createError?.message || "unknown"}`);
  }

  const supabaseUserId = createData.user.id;
  console.log(`  Created test user: ${TEST_EMAIL} (${supabaseUserId})`);

  // Sign in as that user to get JWT
  const anonClient = createClient(supabaseUrl, supabaseAnonKey);
  const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });

  if (signInError || !signInData.session) {
    throw new Error(`Failed to sign in test user: ${signInError?.message || "no session"}`);
  }

  const token = signInData.session.access_token;

  // The auth middleware will auto-create the user row in our DB.
  // We need to make a test call to trigger that, then update consent.
  // First, make a simple call to create the DB user row
  await fetch(`${API_BASE}/api/contacts?limit=1`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  // Set thirdPartyConsentGranted = true via the consent endpoint
  const consentRes = await fetch(`${API_BASE}/api/users/me/consent`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ aiConsent: true }),
  });

  if (!consentRes.ok) {
    console.warn(`  Warning: Could not set consent flag (${consentRes.status}). Assistant calls may fail.`);
  }

  // The auth middleware auto-created the DB user (or found existing).
  // We don't have a GET /me endpoint, but the userId is resolved internally.
  console.log(`  Authenticated. Supabase userId: ${supabaseUserId}`);

  const cleanup = async () => {
    const { error } = await admin.auth.admin.deleteUser(supabaseUserId);
    if (error) {
      console.warn(`  Warning: Failed to delete test user: ${error.message}`);
    } else {
      console.log(`  Deleted test user: ${TEST_EMAIL}`);
    }
  };

  return { token, userId: supabaseUserId, cleanup };
}

// ── API Caller ─────────────────────────────────────────────────────

async function callAssistant(
  token: string,
  messages: ChatMessage[],
  conversationId?: string
): Promise<AssistantResponse> {
  const body: any = { messages };
  if (conversationId) body.conversationId = conversationId;

  const res = await fetch(`${API_BASE}/api/assistant`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }

  return res.json() as Promise<AssistantResponse>;
}

// ── Entity Extraction ──────────────────────────────────────────────

function extractCreatedEntities(response: AssistantResponse): CreatedEntity[] {
  if (!response.ui || response.ui.kind !== "created" || !response.ui.cards) return [];

  return response.ui.cards
    .filter((card) => card.kind && card[card.kind]?.id)
    .map((card) => ({
      kind: card.kind as CreatedEntity["kind"],
      id: card[card.kind].id,
    }));
}

// ── Scenario Runner ────────────────────────────────────────────────

async function runScenario(scenario: TestScenario, token: string): Promise<ScenarioResult> {
  const turns: ConversationTurn[] = [];
  const createdEntities: CreatedEntity[] = [];
  const chatHistory: ChatMessage[] = [];
  let conversationId: string | undefined;
  let turnCount = 0;
  const scenarioStart = Date.now();

  try {
    for (const userMessage of scenario.messages) {
      if (turnCount >= MAX_TURNS) {
        return result(scenario, turns, createdEntities, false, "Exceeded max turns", scenarioStart);
      }

      // Record user turn
      chatHistory.push({ role: "user", content: userMessage });
      turns.push({
        role: "user",
        content: userMessage,
        source: "scenario",
        timestamp: Date.now(),
      });

      // Call API
      const callStart = Date.now();
      const response = await callAssistant(token, chatHistory, conversationId);
      const elapsed = Date.now() - callStart;
      turnCount++;

      conversationId = response.conversationId || conversationId;

      // Record assistant turn
      chatHistory.push({ role: "assistant", content: response.content });
      turns.push({
        role: "assistant",
        content: response.content,
        ui: response.ui,
        actions: response.actions,
        source: "scenario",
        elapsed,
        timestamp: Date.now(),
      });

      // Extract created entities
      createdEntities.push(...extractCreatedEntities(response));

      // Handle auto-responses for interactive flows
      let needsAutoResponse = true;
      let disambiguationReplyIndex = 0;
      while (needsAutoResponse && turnCount < MAX_TURNS) {
        needsAutoResponse = false;

        // Confirmation flow: actions present with primary/secondary buttons
        if (response.actions && response.actions.length > 0) {
          const onConfirm = scenario.onConfirmation || "confirm";
          let action: (typeof response.actions)[0] | undefined;
          let source: ConversationTurn["source"];

          if (onConfirm === "reject") {
            action = response.actions.find((a) => a.style === "secondary");
            source = "auto-reject";
          } else {
            action = response.actions.find((a) => a.style === "primary");
            source = "auto-confirm";
          }

          if (action) {
            chatHistory.push({ role: "user", content: action.message });
            turns.push({
              role: "user",
              content: action.message,
              source,
              timestamp: Date.now(),
            });

            const confirmStart = Date.now();
            const confirmResponse = await callAssistant(token, chatHistory, conversationId);
            const confirmElapsed = Date.now() - confirmStart;
            turnCount++;

            conversationId = confirmResponse.conversationId || conversationId;

            chatHistory.push({ role: "assistant", content: confirmResponse.content });
            turns.push({
              role: "assistant",
              content: confirmResponse.content,
              ui: confirmResponse.ui,
              actions: confirmResponse.actions,
              source,
              elapsed: confirmElapsed,
              timestamp: Date.now(),
            });

            createdEntities.push(...extractCreatedEntities(confirmResponse));

            // Check if this new response also needs auto-response
            if (confirmResponse.actions && confirmResponse.actions.length > 0) {
              // Replace response for next iteration
              Object.assign(response, confirmResponse);
              needsAutoResponse = true;
            } else if (
              confirmResponse.ui?.kind === "selection" &&
              confirmResponse.ui.options?.length
            ) {
              Object.assign(response, confirmResponse);
              needsAutoResponse = true;
            }
          }
        }

        // Selection flow: pick first option
        if (
          !needsAutoResponse &&
          response.ui?.kind === "selection" &&
          response.ui.options?.length
        ) {
          const option = response.ui.options[0];
          chatHistory.push({ role: "user", content: option.selectMessage });
          turns.push({
            role: "user",
            content: option.selectMessage,
            source: "auto-select",
            timestamp: Date.now(),
          });

          const selectStart = Date.now();
          const selectResponse = await callAssistant(token, chatHistory, conversationId);
          const selectElapsed = Date.now() - selectStart;
          turnCount++;

          conversationId = selectResponse.conversationId || conversationId;

          chatHistory.push({ role: "assistant", content: selectResponse.content });
          turns.push({
            role: "assistant",
            content: selectResponse.content,
            ui: selectResponse.ui,
            actions: selectResponse.actions,
            source: "auto-select",
            elapsed: selectElapsed,
            timestamp: Date.now(),
          });

          createdEntities.push(...extractCreatedEntities(selectResponse));

          // Check if we need to continue
          if (selectResponse.actions && selectResponse.actions.length > 0) {
            Object.assign(response, selectResponse);
            needsAutoResponse = true;
          }
        }

        // Disambiguation flow: assistant asked a clarifying question (no actions, no selection UI)
        // Use pre-canned replies from the scenario to respond.
        if (
          !needsAutoResponse &&
          scenario.disambiguationReplies &&
          disambiguationReplyIndex < scenario.disambiguationReplies.length &&
          !response.actions?.length &&
          response.content?.includes("?")
        ) {
          const reply = scenario.disambiguationReplies[disambiguationReplyIndex++];
          chatHistory.push({ role: "user", content: reply });
          turns.push({
            role: "user",
            content: reply,
            source: "auto-disambiguate",
            timestamp: Date.now(),
          });

          const disambigStart = Date.now();
          const disambigResponse = await callAssistant(token, chatHistory, conversationId);
          const disambigElapsed = Date.now() - disambigStart;
          turnCount++;

          conversationId = disambigResponse.conversationId || conversationId;

          chatHistory.push({ role: "assistant", content: disambigResponse.content });
          turns.push({
            role: "assistant",
            content: disambigResponse.content,
            ui: disambigResponse.ui,
            actions: disambigResponse.actions,
            source: "auto-disambiguate",
            elapsed: disambigElapsed,
            timestamp: Date.now(),
          });

          createdEntities.push(...extractCreatedEntities(disambigResponse));

          // Continue the loop to handle follow-ups (confirmation, more disambiguation, etc.)
          Object.assign(response, disambigResponse);
          needsAutoResponse = true;
        }
      }
    }

    // Validate expectations
    const lastAssistantTurn = [...turns].reverse().find((t) => t.role === "assistant");

    if (!lastAssistantTurn) {
      return result(scenario, turns, createdEntities, false, "No assistant response", scenarioStart);
    }

    const { expectations } = scenario;

    // Check finalUiKind
    if (expectations.finalUiKind) {
      if (!lastAssistantTurn.ui || lastAssistantTurn.ui.kind !== expectations.finalUiKind) {
        const actual = lastAssistantTurn.ui?.kind || "none";
        return result(
          scenario,
          turns,
          createdEntities,
          false,
          `Expected UI kind "${expectations.finalUiKind}", got "${actual}"`,
          scenarioStart
        );
      }
    }

    // Check noUi
    if (expectations.noUi && lastAssistantTurn.ui) {
      return result(
        scenario,
        turns,
        createdEntities,
        false,
        `Expected no UI, got kind "${lastAssistantTurn.ui.kind}"`,
        scenarioStart
      );
    }

    // Check createdEntityKinds
    if (expectations.createdEntityKinds) {
      const actualKinds = createdEntities.map((e) => e.kind).sort();
      const expectedKinds = [...expectations.createdEntityKinds].sort();
      if (JSON.stringify(actualKinds) !== JSON.stringify(expectedKinds)) {
        return result(
          scenario,
          turns,
          createdEntities,
          false,
          `Expected created entities [${expectedKinds}], got [${actualKinds}]`,
          scenarioStart
        );
      }
    }

    // Check contentSubstring
    if (expectations.contentSubstring) {
      const allContent = turns
        .filter((t) => t.role === "assistant")
        .map((t) => t.content)
        .join(" ");
      if (!allContent.toLowerCase().includes(expectations.contentSubstring.toLowerCase())) {
        return result(
          scenario,
          turns,
          createdEntities,
          false,
          `Expected content substring "${expectations.contentSubstring}" not found`,
          scenarioStart
        );
      }
    }

    return result(scenario, turns, createdEntities, true, undefined, scenarioStart);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return result(scenario, turns, createdEntities, false, `Error: ${message}`, scenarioStart);
  }
}

function result(
  scenario: TestScenario,
  turns: ConversationTurn[],
  createdEntities: CreatedEntity[],
  passed: boolean,
  failureReason: string | undefined,
  startTime: number
): ScenarioResult {
  return {
    scenario,
    turns,
    createdEntities,
    passed,
    failureReason,
    totalElapsed: Date.now() - startTime,
  };
}

// ── Test Scenarios ─────────────────────────────────────────────────

const SCENARIOS: TestScenario[] = [
  // ─── Contact Creation ────────────────────────────────
  {
    id: "contact-simple",
    name: "Create simple contact",
    category: "contact",
    messages: ["Create a new contact named TestBot Alpha"],
    expectations: {
      finalUiKind: "created",
      createdEntityKinds: ["contact"],
    },
  },
  {
    id: "contact-full",
    name: "Create contact with full details",
    category: "contact",
    messages: [
      'Create a contact: TestBot Beta, works at TestCorp as QA Engineer, email testbot.beta@example.com, phone +1 555 000 1234',
    ],
    expectations: {
      finalUiKind: "created",
      createdEntityKinds: ["contact"],
    },
  },

  // ─── Conversation Recording ──────────────────────────
  {
    id: "conversation-simple",
    name: "Log a phone call",
    category: "conversation",
    messages: [
      "I just had a phone call with TestBot Alpha about the quarterly budget review",
    ],
    expectations: {
      finalUiKind: "created",
      createdEntityKinds: ["conversation"],
    },
  },
  {
    id: "conversation-with-reminder",
    name: "Log conversation with follow-up reminder",
    category: "conversation",
    messages: [
      "Had a meeting with TestBot Alpha about project planning. We need to follow up next week about the timeline.",
    ],
    expectations: {
      finalUiKind: "created",
    },
  },

  // ─── Event Creation ──────────────────────────────────
  {
    id: "event-simple",
    name: "Create a meeting event",
    category: "event",
    messages: ["Schedule a meeting with TestBot Alpha tomorrow at 3pm about project kickoff"],
    expectations: {
      finalUiKind: "created",
      createdEntityKinds: ["event"],
    },
  },

  // ─── Reminder Creation ───────────────────────────────
  {
    id: "reminder-simple",
    name: "Create a reminder",
    category: "reminder",
    messages: ["Remind me to follow up with TestBot Alpha next Monday about the proposal"],
    expectations: {
      finalUiKind: "created",
      createdEntityKinds: ["reminder"],
    },
  },

  // ─── Search ──────────────────────────────────────────
  {
    id: "search-contacts",
    name: "Search contacts",
    category: "search",
    messages: ["Find all my contacts named TestBot"],
    expectations: {
      finalUiKind: "contacts",
    },
  },
  {
    id: "search-conversations",
    name: "Search conversations",
    category: "search",
    messages: ["Show me recent conversations about budget"],
    expectations: {
      finalUiKind: "conversations",
    },
  },
  {
    id: "search-events",
    name: "Search events",
    category: "search",
    messages: ["What meetings do I have coming up?"],
    expectations: {
      finalUiKind: "events",
    },
  },
  {
    id: "search-reminders",
    name: "Search reminders",
    category: "search",
    messages: ["Show my pending reminders"],
    expectations: {
      finalUiKind: "reminders",
    },
  },

  // ─── Edge Cases ──────────────────────────────────────
  {
    id: "reject-creation",
    name: "Reject a creation request",
    category: "edge",
    messages: [
      "Create a contact named TestBot Gamma",
    ],
    onConfirmation: "reject",
    expectations: {
      // After rejection, there should be no created entities
      createdEntityKinds: [],
    },
  },
  {
    id: "greeting",
    name: "Greeting (no mutation)",
    category: "edge",
    messages: ["Hello! How are you doing today?"],
    expectations: {
      noUi: true,
    },
  },

  // ─── Disambiguation (orbit-f41) ───────────────────────────
  {
    id: "disambiguate-search",
    name: "Search ambiguous name shows multiple results",
    category: "disambiguation",
    requiresSetup: true,
    messages: ["Find my contact John"],
    expectations: {
      finalUiKind: "contacts",
    },
  },
  {
    id: "disambiguate-conversation",
    name: "Log call with ambiguous contact triggers disambiguation",
    category: "disambiguation",
    requiresSetup: true,
    messages: [
      "I just had a phone call with TestBot John about project status",
    ],
    disambiguationReplies: ["TestBot John Smith"],
    expectations: {
      finalUiKind: "created",
    },
  },
  {
    id: "disambiguate-with-detail",
    name: "Narrow down ambiguous contact with extra detail",
    category: "disambiguation",
    requiresSetup: true,
    messages: [
      "Log a call with TestBot Sarah from phone number +1 555 000 2001 about the new proposal",
    ],
    disambiguationReplies: ["TestBot Sarah Lee"],
    expectations: {
      finalUiKind: "created",
    },
  },

  // ─── Multi-Entity Disambiguation (orbit-7sc) ──────────────
  {
    id: "multi-disambiguate",
    name: "Conversation with two ambiguous participants",
    category: "multi-disambiguation",
    requiresSetup: true,
    messages: [
      "I had a meeting with TestBot John and TestBot Sarah about the annual review",
    ],
    disambiguationReplies: [
      "TestBot John Smith and TestBot Sarah Lee",
    ],
    expectations: {
      finalUiKind: "created",
    },
  },
  {
    id: "mixed-resolution",
    name: "One ambiguous + one unique participant",
    category: "multi-disambiguation",
    requiresSetup: true,
    messages: [
      "Log a phone call with TestBot John and TestBot David about the budget",
    ],
    disambiguationReplies: ["TestBot John Doe"],
    expectations: {
      finalUiKind: "created",
    },
  },

  // ─── Event Creation + Linked Conversations (orbit-wq8) ────
  {
    id: "event-with-conversation",
    name: "Create event and log what was discussed",
    category: "event-linked",
    requiresSetup: true,
    messages: [
      "I had a meeting with TestBot David and TestBot Emma yesterday about the product roadmap. Schedule a follow-up meeting next week.",
    ],
    expectations: {
      finalUiKind: "created",
    },
  },
  {
    id: "event-multi-participant",
    name: "Create event with multiple participants",
    category: "event-linked",
    requiresSetup: true,
    messages: [
      "Schedule a team meeting with TestBot David and TestBot Emma next Friday at 2pm to discuss Q3 planning",
    ],
    expectations: {
      finalUiKind: "created",
      createdEntityKinds: ["event"],
    },
  },
  {
    id: "event-birthday",
    name: "Create birthday event for a contact",
    category: "event-linked",
    requiresSetup: true,
    messages: [
      "TestBot Emma's birthday is on March 15th. Add it as an event.",
    ],
    expectations: {
      finalUiKind: "created",
      createdEntityKinds: ["event"],
    },
  },
];

// ── Entity Cleanup ─────────────────────────────────────────────────

async function cleanupCreatedEntities(
  token: string,
  entities: CreatedEntity[],
  conversationIds: Set<string>
): Promise<void> {
  // Delete in reverse FK dependency order
  const byKind = {
    reminder: entities.filter((e) => e.kind === "reminder"),
    event: entities.filter((e) => e.kind === "event"),
    conversation: entities.filter((e) => e.kind === "conversation"),
    contact: entities.filter((e) => e.kind === "contact"),
  };

  const deleteEntity = async (kind: string, id: string) => {
    const endpoint = kind === "reminder" ? "reminders" : `${kind}s`;
    try {
      const res = await fetch(`${API_BASE}/api/${endpoint}/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        console.log(`    Deleted ${kind} ${id}`);
      } else {
        console.warn(`    Failed to delete ${kind} ${id}: ${res.status}`);
      }
    } catch (err) {
      console.warn(`    Error deleting ${kind} ${id}: ${err}`);
    }
  };

  for (const e of byKind.reminder) await deleteEntity(e.kind, e.id);
  for (const e of byKind.event) await deleteEntity(e.kind, e.id);
  for (const e of byKind.conversation) await deleteEntity(e.kind, e.id);
  for (const e of byKind.contact) await deleteEntity(e.kind, e.id);

  // Delete assistant conversations
  for (const convId of conversationIds) {
    try {
      const res = await fetch(`${API_BASE}/api/assistant/conversations/${convId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        console.log(`    Deleted assistant conversation ${convId}`);
      } else {
        console.warn(`    Failed to delete assistant conversation ${convId}: ${res.status}`);
      }
    } catch (err) {
      console.warn(`    Error deleting assistant conversation ${convId}: ${err}`);
    }
  }
}

// ── HTML Report ────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function generateReport(results: ScenarioResult[], totalElapsed: number): string {
  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  const timestamp = new Date().toISOString();

  const scenarioRows = results
    .map((r, i) => {
      const status = r.passed ? "PASS" : "FAIL";
      const statusClass = r.passed ? "pass" : "fail";
      const turns = r.turns.length;
      const entities = r.createdEntities.length;
      return `<tr class="${statusClass}" onclick="document.getElementById('scenario-${i}').open=true;document.getElementById('scenario-${i}').scrollIntoView({behavior:'smooth'})">
        <td class="status-cell"><span class="badge ${statusClass}">${status}</span></td>
        <td>${escapeHtml(r.scenario.name)}</td>
        <td><span class="badge category">${escapeHtml(r.scenario.category)}</span></td>
        <td>${turns}</td>
        <td>${entities}</td>
        <td>${(r.totalElapsed / 1000).toFixed(1)}s</td>
        <td class="failure-reason">${r.failureReason ? escapeHtml(r.failureReason) : ""}</td>
      </tr>`;
    })
    .join("\n");

  const scenarioDetails = results
    .map((r, i) => {
      const turnHtml = r.turns
        .map((t) => {
          const roleIcon = t.role === "user" ? "👤" : "🤖";
          const roleClass = t.role === "user" ? "user-turn" : "assistant-turn";
          const sourceTag =
            t.source !== "scenario"
              ? `<span class="badge source">${escapeHtml(t.source)}</span>`
              : "";
          const timingTag =
            t.elapsed !== undefined ? `<span class="timing">${t.elapsed}ms</span>` : "";

          let uiBadge = "";
          if (t.ui) {
            uiBadge = `<div class="ui-section"><span class="badge ui-kind">${escapeHtml(t.ui.kind)}</span>`;
            if (t.ui.kind === "created" && t.ui.cards) {
              uiBadge += t.ui.cards
                .map(
                  (c: any) =>
                    `<span class="badge entity-kind">${escapeHtml(c.kind)}</span>`
                )
                .join(" ");
            }
            if (t.ui.kind === "selection" && t.ui.options) {
              uiBadge += `<span class="selection-count">${t.ui.options.length} options</span>`;
            }
            if (t.ui.kind === "contacts" || t.ui.kind === "conversations" || t.ui.kind === "events" || t.ui.kind === "reminders") {
              uiBadge += `<span class="selection-count">${t.ui.count ?? 0} results</span>`;
            }
            uiBadge += "</div>";
          }

          let actionsHtml = "";
          if (t.actions && t.actions.length > 0) {
            actionsHtml = `<div class="actions-section">${t.actions
              .map(
                (a) =>
                  `<span class="badge action-${a.style}">${escapeHtml(a.label)}</span>`
              )
              .join(" ")}</div>`;
          }

          return `<div class="turn ${roleClass}">
            <div class="turn-header">${roleIcon} ${sourceTag} ${timingTag}</div>
            <div class="turn-content">${escapeHtml(t.content)}</div>
            ${uiBadge}${actionsHtml}
          </div>`;
        })
        .join("\n");

      const statusIcon = r.passed ? "✅" : "❌";
      const statusLabel = r.passed ? "PASS" : "FAIL";
      const failureHtml = r.failureReason
        ? `<div class="failure-detail">Reason: ${escapeHtml(r.failureReason)}</div>`
        : "";

      return `<details id="scenario-${i}" class="scenario-detail">
        <summary>
          <span class="badge ${r.passed ? "pass" : "fail"}">${statusLabel}</span>
          <strong>${escapeHtml(r.scenario.name)}</strong>
          <span class="badge category">${escapeHtml(r.scenario.category)}</span>
          <span class="timing">${(r.totalElapsed / 1000).toFixed(1)}s</span>
          ${statusIcon}
        </summary>
        <div class="scenario-body">
          ${failureHtml}
          <div class="turns">${turnHtml}</div>
          ${
            r.createdEntities.length > 0
              ? `<div class="entities-summary">Created entities: ${r.createdEntities
                  .map((e) => `<span class="badge entity-kind">${e.kind}</span> ${e.id.slice(0, 8)}...`)
                  .join(", ")}</div>`
              : ""
          }
        </div>
      </details>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Orbit Assistant E2E Report</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "SF Mono", "Menlo", "Monaco", "Consolas", monospace;
    background: #0d1117;
    color: #c9d1d9;
    padding: 24px;
    line-height: 1.5;
  }
  h1 { color: #f0f6fc; margin-bottom: 8px; font-size: 1.4em; }
  .meta { color: #8b949e; font-size: 0.85em; margin-bottom: 24px; }
  .summary-bar {
    display: flex;
    gap: 16px;
    padding: 16px;
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 8px;
    margin-bottom: 24px;
    font-size: 1.1em;
  }
  .summary-bar .count { font-weight: 700; }
  .summary-bar .pass-count { color: #3fb950; }
  .summary-bar .fail-count { color: #f85149; }

  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 32px;
    font-size: 0.85em;
  }
  th {
    background: #161b22;
    color: #8b949e;
    text-align: left;
    padding: 8px 12px;
    border-bottom: 1px solid #30363d;
    text-transform: uppercase;
    font-size: 0.75em;
    letter-spacing: 0.05em;
  }
  td {
    padding: 8px 12px;
    border-bottom: 1px solid #21262d;
  }
  tr { cursor: pointer; transition: background 0.15s; }
  tr:hover { background: #161b22; }
  tr.fail { background: rgba(248, 81, 73, 0.05); }
  tr.fail:hover { background: rgba(248, 81, 73, 0.1); }

  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 0.75em;
    font-weight: 600;
    text-transform: uppercase;
  }
  .badge.pass { background: #238636; color: #fff; }
  .badge.fail { background: #da3633; color: #fff; }
  .badge.category { background: #1f6feb; color: #fff; }
  .badge.source { background: #8957e5; color: #fff; font-size: 0.7em; }
  .badge.ui-kind { background: #388bfd; color: #fff; }
  .badge.entity-kind { background: #2ea043; color: #fff; }
  .badge.action-primary { background: #238636; color: #fff; }
  .badge.action-secondary { background: #6e7681; color: #fff; }

  .status-cell { width: 60px; }
  .failure-reason { color: #f85149; font-size: 0.8em; }

  .scenario-detail {
    margin-bottom: 12px;
    border: 1px solid #30363d;
    border-radius: 8px;
    overflow: hidden;
  }
  .scenario-detail summary {
    padding: 12px 16px;
    background: #161b22;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.9em;
  }
  .scenario-detail summary:hover { background: #1c2128; }
  .scenario-detail[open] summary { border-bottom: 1px solid #30363d; }
  .scenario-body { padding: 16px; }

  .turn {
    padding: 10px 14px;
    margin-bottom: 8px;
    border-radius: 6px;
    border-left: 3px solid transparent;
  }
  .user-turn {
    background: #1c2128;
    border-left-color: #388bfd;
  }
  .assistant-turn {
    background: #161b22;
    border-left-color: #3fb950;
  }
  .turn-header {
    font-size: 0.8em;
    color: #8b949e;
    margin-bottom: 4px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .turn-content {
    white-space: pre-wrap;
    word-break: break-word;
  }
  .timing {
    color: #8b949e;
    font-size: 0.75em;
    margin-left: auto;
  }
  .ui-section, .actions-section {
    margin-top: 6px;
    display: flex;
    gap: 4px;
    align-items: center;
    flex-wrap: wrap;
  }
  .selection-count {
    font-size: 0.8em;
    color: #8b949e;
    margin-left: 4px;
  }
  .failure-detail {
    background: rgba(248, 81, 73, 0.1);
    border: 1px solid rgba(248, 81, 73, 0.3);
    padding: 10px 14px;
    border-radius: 6px;
    margin-bottom: 12px;
    color: #f85149;
    font-size: 0.85em;
  }
  .entities-summary {
    margin-top: 12px;
    padding: 8px 12px;
    background: #1c2128;
    border-radius: 6px;
    font-size: 0.8em;
    color: #8b949e;
  }
</style>
</head>
<body>
  <h1>Orbit Assistant E2E Test Report</h1>
  <div class="meta">
    Generated: ${timestamp} | Duration: ${(totalElapsed / 1000).toFixed(1)}s | Scenarios: ${results.length}
  </div>

  <div class="summary-bar">
    <span><span class="count">${results.length}</span> scenarios</span>
    <span class="pass-count"><span class="count">${passed}</span> passed</span>
    <span class="fail-count"><span class="count">${failed}</span> failed</span>
  </div>

  <table>
    <thead>
      <tr>
        <th>Status</th>
        <th>Scenario</th>
        <th>Category</th>
        <th>Turns</th>
        <th>Entities</th>
        <th>Time</th>
        <th>Failure</th>
      </tr>
    </thead>
    <tbody>
      ${scenarioRows}
    </tbody>
  </table>

  <h2 style="color:#f0f6fc;margin-bottom:12px;">Scenario Details</h2>
  ${scenarioDetails}
</body>
</html>`;
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║  Orbit Assistant E2E Test Harness               ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  const overallStart = Date.now();

  // 1. Authenticate
  console.log("🔐 Authenticating...");
  const { token, userId, cleanup: cleanupUser } = await authenticate();

  const allResults: ScenarioResult[] = [];
  const allConversationIds = new Set<string>();
  let setupContactIds: string[] = [];

  try {
    // 2. Setup test data (contacts for disambiguation scenarios)
    const hasSetupScenarios = SCENARIOS.some((s) => s.requiresSetup);
    if (hasSetupScenarios) {
      console.log("\n📦 Setting up test data (disambiguation contacts)...");
      setupContactIds = await setupTestData(token);
      console.log(`  Created ${setupContactIds.length} setup contacts.`);
    }

    // 3. Run scenarios
    console.log(`\n🧪 Running ${SCENARIOS.length} scenarios...\n`);

    for (const scenario of SCENARIOS) {
      process.stdout.write(`  [${scenario.id}] ${scenario.name}... `);
      const result = await runScenario(scenario, token);
      allResults.push(result);

      // Collect conversation IDs for cleanup
      for (const turn of result.turns) {
        if (turn.role === "assistant") {
          // The conversationId is on the response, but we track it in turns indirectly.
          // We need to extract it from the scenario runner. Let's just get all assistant convs.
        }
      }

      // Get conversationId from last assistant response (it was returned by the API)
      const lastAssistant = [...result.turns].reverse().find(
        (t) => t.role === "assistant"
      );
      // We actually need to re-extract conversationId. Let's store it differently.
      // For now, we'll collect all entities and rely on the conversation cleanup below.

      if (result.passed) {
        console.log(`✅ (${(result.totalElapsed / 1000).toFixed(1)}s)`);
      } else {
        console.log(`❌ ${result.failureReason} (${(result.totalElapsed / 1000).toFixed(1)}s)`);
      }
    }

    // 3. Summary
    const passed = allResults.filter((r) => r.passed).length;
    const failed = allResults.length - passed;
    console.log(`\n${"─".repeat(50)}`);
    console.log(`📊 Results: ${passed} passed, ${failed} failed out of ${allResults.length}`);
    console.log(`${"─".repeat(50)}`);

    // 4. Generate HTML report
    console.log("\n📝 Generating HTML report...");
    const reportDir = new URL("../test-results", import.meta.url).pathname;
    const { mkdirSync } = await import("node:fs");
    mkdirSync(reportDir, { recursive: true });
    const reportPath = `${reportDir}/report.html`;
    const totalElapsed = Date.now() - overallStart;
    const reportHtml = generateReport(allResults, totalElapsed);
    await Bun.write(reportPath, reportHtml);
    console.log(`  Report written to: ${reportPath}`);

    // 5. Cleanup created entities
    console.log("\n🧹 Cleaning up test entities...");
    const allEntities = allResults.flatMap((r) => r.createdEntities);

    // Collect all assistant conversation IDs from the full run
    // We'll list all conversations for this user and delete them
    try {
      const convRes = await fetch(`${API_BASE}/api/assistant/conversations?limit=50`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (convRes.ok) {
        const convData = (await convRes.json()) as any;
        for (const conv of convData.conversations || []) {
          allConversationIds.add(conv.id);
        }
      }
    } catch {
      // ignore
    }

    await cleanupCreatedEntities(token, allEntities, allConversationIds);
    if (setupContactIds.length > 0) {
      console.log("  Cleaning up setup contacts...");
      await cleanupSetupData(token, setupContactIds);
    }
    console.log("  Entity cleanup complete.");

    // 6. Return exit code
    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    // 7. Always clean up test user
    console.log("\n🗑️  Cleaning up test user...");
    await cleanupUser();
    const totalElapsed = Date.now() - overallStart;
    console.log(`\n⏱️  Total time: ${(totalElapsed / 1000).toFixed(1)}s\n`);
  }
}

main().catch((err) => {
  console.error("\n💥 Fatal error:", err);
  process.exit(2);
});
