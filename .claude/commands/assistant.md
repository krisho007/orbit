# Assistant Architecture

The AI assistant supports **four provider backends** controlled by the `AI_PROVIDER` env var, dispatching to one of three execution paths. All paths share the same REST API surface and mobile client.
Always think about all possible message patterns before you propose a solution. I see that by fixing one pattern another pattern is broken, so I want to avoid that.

## Providers (`AI_PROVIDER`)

| Value | Path | LLM | Required Env Var | Default Model |
|-------|------|-----|------------------|---------------|
| `google` (default) | Agentic multi-step tool calling | Gemini | `GOOGLE_GENERATIVE_AI_API_KEY` | `gemini-flash-lite-latest` |
| `google_structured` | Single-pass few-shot JSON | Gemini | `GOOGLE_GENERATIVE_AI_API_KEY` | `gemini-flash-lite-latest` |
| `cerebras` | Single-pass few-shot JSON | Llama 3.1 8B | `CEREBRAS_API_KEY` | `llama3.1-8b` |
| `finetuned` | Single-pass fine-tuned model | Together.ai | `TOGETHER_API_KEY` | `your-org/orbit-assistant-v1` |

- `AI_MODEL` overrides the default model for any provider
- `AI_CLASSIFICATION_MODEL` overrides the Gemini model used for intent classification (agentic path only)
- `google_structured` and `cerebras` are both "structured providers" sharing the same code path

## API Side (`apps/api/src/routes/assistant/`)

| File | Purpose |
|------|---------|
| `route.ts` | Hono router: `POST /api/assistant`, conversation CRUD, NDJSON streaming support |
| `model.ts` | Provider/model selection, client factories for Cerebras and Together.ai |
| `process-message.ts` | Entry point (`processMessageLLM`): dispatches to the correct execution path based on provider |
| `process-message-structured.ts` | Structured path (Paths 3 & 4): single-pass few-shot JSON for `google_structured` and `cerebras` |
| `process-message-finetuned.ts` | Fine-tuned path (Path 2): single-pass call to Together.ai fine-tuned model |
| `structured-prompt.ts` | System prompt builder for structured paths: schema docs + 9 few-shot examples from `scripts/training/seed-examples.jsonl` |
| `system-prompt.ts` | Dynamic prompt for agentic path: user context, intent-specific guidance, enum values, today's date |
| `finetuned-types.ts` | `OrbitModelOutput` Zod schema, `parseModelOutput`, shared by Paths 2/3/4 |
| `action-executor.ts` | Deterministic CRUD execution from `ActionInstruction[]` (Paths 2/3/4) |
| `search-executor.ts` | Parallel search execution from `SearchInstruction[]` (Paths 2/3/4) |
| `time-resolver.ts` | Resolves relative time tokens (e.g. `TOMORROW_14:00`) to ISO timestamps |
| `sanitize.ts` | Input sanitization against prompt injection |
| `guardrails.ts` | Intent classification (LLM call) + confirmation gating for mutations |
| `constants.ts` | Maps ~20 intent types to scoped tool subsets (accuracy over breadth) |
| `ui-builder.ts` | Converts tool results into typed UI cards (contacts, events, reminders, etc.) |
| `tools/` | 6 modules (contacts, conversations, events, reminders, tags, relationships) with 50+ tools using Zod schemas |

## Three Execution Paths

### Path 1: `google` — Agentic Multi-Step Tool Calling (original)
```
User input → identifyIntents() (Gemini classification) → Tool scoping via INTENT_TOOL_SETS
  → generateText (multi-step, up to 8-10 steps) → buildUiFromToolResults() → Response
```
- Uses Vercel AI SDK `generateText` with a `tools` object
- Separate LLM call for intent classification (guardrails.ts)
- Only exposes tools relevant to classified intents
- `experimental_repairToolCall` auto-fixes malformed create_contact calls
- Handles confirmation/rejection short-circuits

### Path 2: `finetuned` — Single-Pass Fine-Tuned Model
```
User input → generateText (Together.ai, single call) → OrbitModelOutput JSON
  → executeSearches() → executeActions() → Response
```
- Model returns full `OrbitModelOutput` in one shot
- Minimal system prompt (model already knows the schema)
- Deterministic execution layer handles all DB operations

### Paths 3 & 4: `google_structured` / `cerebras` — Single-Pass Few-Shot JSON
```
User input → buildStructuredSystemPrompt() (schema docs + 9 few-shot examples)
  → generateText (single call) → parseModelOutput() → executeSearches() → executeActions() → Response
```
- Rich system prompt with full schema documentation and few-shot examples
- Same execution infrastructure as Path 2 (shared `OrbitModelOutput` schema)
- Examples loaded from `scripts/training/seed-examples.jsonl` at startup (cached)

## `OrbitModelOutput` Schema (Paths 2/3/4)

```
{ intents, searches[], action?, actions[], response, needs_confirmation, needs_resolution }
```
- `SearchInstruction`: `{ id, entity_type, search_type, query, purpose }`
- `ActionInstruction`: `{ operation, entity_type, params, participant_refs?, target_ref? }`

## Mobile Side (`apps/mobile/app/(tabs)/assistant.tsx`)

- Chat UI with FlatList message bubbles
- Speech-to-text via `expo-audio` + Sarvam AI transcription
- Renders 7 interactive card types from `AssistantUi` objects
- Confirmation action buttons ("Go ahead" / "I need changes")
- Conversation persistence and history modal
- API client: `assistantApi.chat()` in `apps/mobile/lib/api.ts`

## Key Patterns

- **Intent-scoped tools**: Only relevant tools exposed per classified intent (agentic path only)
- **Confirmation gate**: Mutating operations require explicit user confirmation before execution
- **No streaming**: Uses `generateText` (not `streamText`), response returned as a whole
- **Auto-disambiguation**: Multiple fuzzy matches produce selection cards for the user to pick
- **No delete tools**: Deletion is UI-only, never exposed to the LLM
- **GDPR consent**: Checked before any AI processing (`thirdPartyConsentGranted`)
- **Multi-tenant**: All DB queries scoped by `userId`
- **Token tracking**: `modelName`, `inputTokens`, `outputTokens`, `responseTimeMs` saved per assistant message
