# Assistant Test Documentation

This document describes the comprehensive test suite for the `processMessageLLM` function in the Orbit assistant API.

## Overview

The test suite ensures deterministic behavior of the AI assistant by mocking the LLM's responses. This allows us to test all features without making actual API calls or database queries.

## Running Tests

```bash
# Run all tests
bun test

# Run only assistant tests
bun test:assistant

# Run specific test file
bun test src/routes/assistant.test.ts
```

## Test Architecture

### Mocking Strategy

Tests use a fake `generateText` function that returns predefined tool results:

```typescript
const fakeGenerate = (async () => ({
  text: "Response text",
  toolResults: [
    {
      output: {
        type: "contact_created",
        id: "contact-1",
        displayName: "John Doe",
        // ... other fields
      },
    },
  ],
})) as unknown as typeof generateText;
```

This approach ensures:
- **Deterministic**: Tests always produce the same results
- **Fast**: No network calls or LLM inference
- **Isolated**: No database dependencies
- **Focused**: Tests verify UI generation logic, not LLM behavior

## Test Coverage

### 1. Contacts (5 tests)

| Test | Description |
|------|-------------|
| **creates a single contact and returns a contact card** | Verifies that a `contact_created` tool result produces a UI card with all fields (displayName, phone, email, company, jobTitle, location) |
| **creates a contact with minimal fields (name only)** | Ensures optional fields are properly set to `null` when not provided |
| **searches contacts and returns a contacts list** | Tests `contacts_found` result produces a list UI with correct count and contact data |
| **returns empty contacts list when no matches found** | Verifies empty list handling with count=0 and appropriate text message |
| **gets contact details and returns a single contact card** | Tests `contact_details` result produces a single contact UI card |

### 2. Conversations (4 tests)

| Test | Description |
|------|-------------|
| **creates a conversation and returns a conversation card** | Verifies conversation card includes medium, happenedAt, content, and participants |
| **searches conversations and returns a conversations list** | Tests list UI with multiple conversations of different mediums |
| **creates a conversation with followUp and returns card** | Ensures followUp field is properly handled in conversation creation |
| **returns empty conversations list when no matches found** | Tests empty list with appropriate message |

### 3. Events (3 tests)

| Test | Description |
|------|-------------|
| **creates an event and returns an event card** | Verifies event card with title, startAt, location, and participants |
| **searches events and returns an events list** | Tests list UI with multiple events |
| **returns empty events list when no matches found** | Tests empty list handling |

### 4. Reminders (4 tests)

| Test | Description |
|------|-------------|
| **creates a reminder and returns a reminder card** | Verifies reminder card with title, dueAt, status, and participants |
| **searches reminders and returns a reminders list** | Tests list UI with reminders of different statuses |
| **gets a single reminder and returns reminder details** | Tests `reminder_details` result with participant contact objects |
| **returns empty reminders list when no matches found** | Tests empty list handling |

### 5. Mixed / Multi-entity Creation (2 tests)

| Test | Description |
|------|-------------|
| **returns created cards for mixed created entities in one assistant response** | Verifies that creating multiple entities (contact + conversation + event) in one response produces a `created` UI with all cards |
| **deduplicates created cards with same id** | Ensures duplicate entity IDs are filtered out |

### 6. Delete Safety (8 tests)

These tests verify the two-step delete flow: **show card first, then confirm deletion**.

| Test | Description |
|------|-------------|
| **delete contact: shows contact card first (no deletion)** | When user requests deletion, assistant first shows the contact card without deleting |
| **delete contact: confirms deletion after showing card** | After user confirms, `contact_deleted` result is returned |
| **delete conversation: shows conversation card first** | Shows conversation card before deletion |
| **delete conversation: confirms deletion after showing** | Confirms deletion with `conversation_deleted` result |
| **delete event: shows event card first** | Shows event card before deletion |
| **delete event: confirms deletion after showing** | Confirms deletion with `event_deleted` result |
| **delete reminder: shows reminder card first** | Shows reminder card before deletion |
| **delete reminder: confirms deletion after showing** | Confirms deletion with `reminder_deleted` result |

**Delete Safety Pattern:**
1. User: "Delete John Doe"
2. Assistant: Shows contact card (UI: `contacts`, count: 1)
3. User: "Yes, delete it"
4. Assistant: Deletes contact (UI: `null`, text: "Deleted...")

### 7. Error / Edge Cases (3 tests)

| Test | Description |
|------|-------------|
| **returns error text when API key is not set** | Verifies graceful handling when `GOOGLE_GENERATIVE_AI_API_KEY` is missing |
| **handles tool error result gracefully** | Tests that error results (`type: "error"`) are handled without crashing |
| **handles empty tool results (no tools called)** | Tests responses with no tool calls (pure conversational responses) |

## UI Response Types

The assistant can return different UI types based on tool results:

### Created UI
```typescript
{
  kind: "created",
  cards: [
    { kind: "contact", contact: { ... } },
    { kind: "conversation", conversation: { ... } },
    { kind: "event", event: { ... } },
    { kind: "reminder", reminder: { ... } }
  ]
}
```

### List UIs
```typescript
// Contacts
{ kind: "contacts", count: 2, contacts: [...] }

// Conversations
{ kind: "conversations", count: 2, conversations: [...] }

// Events
{ kind: "events", count: 2, events: [...] }

// Reminders
{ kind: "reminders", count: 2, reminders: [...] }
```

### Single Item UI
```typescript
{ kind: "contact", contact: { ... } }
```

### No UI
```typescript
null  // For errors, deletions, updates, or pure text responses
```

## Tool Result Types

Tests cover these tool result types:

### Creation Results
- `contact_created`
- `conversation_created`
- `event_created`
- `reminder_created`

### Search/Query Results
- `contacts_found`
- `conversations_found`
- `events_found`
- `reminders_found`
- `contact_details`
- `reminder_details`

### Deletion Results
- `contact_deleted`
- `conversation_deleted`
- `event_deleted`
- `reminder_deleted`

### Error Results
- `error` (with `message` field)

## Test Statistics

- **Total Tests**: 29
- **Total Assertions**: 120+
- **Coverage Areas**:
  - ✅ Contact CRUD operations
  - ✅ Conversation CRUD operations
  - ✅ Event CRUD operations
  - ✅ Reminder CRUD operations
  - ✅ Multi-entity creation
  - ✅ Delete safety (2-step confirmation)
  - ✅ Error handling
  - ✅ Empty result handling
  - ✅ UI card generation
  - ✅ Text summarization

## Adding New Tests

When adding new features to the assistant, follow this pattern:

1. **Create a fake generate function** with the expected tool results
2. **Call processMessageLLM** with test messages and the fake function
3. **Assert on the response**:
   - Check `response.ui?.kind` for the expected UI type
   - Verify UI data matches the tool result
   - Check `response.text` for appropriate messages

Example:

```typescript
it("creates a new feature and returns appropriate UI", async () => {
  const fakeGenerate = (async () => ({
    text: "Created feature.",
    toolResults: [
      {
        output: {
          type: "feature_created",
          id: "feature-1",
          name: "New Feature",
        },
      },
    ],
  })) as unknown as typeof generateText;

  const response = await processMessageLLM(
    "user-1",
    [{ role: "user", content: "Create a feature" }],
    fakeGenerate
  );

  expect(response.ui?.kind).toBe("created");
  // ... more assertions
});
```

## Relationships Testing (Future)

The current test suite focuses on the core CRUD operations. Relationship-specific tests can be added following the same pattern:

- `relationship_created`
- `relationships_found`
- `relationship_updated`
- `relationship_deleted`
- `relationship_type_created`
- etc.

## Notes

- Tests use `beforeEach` to set up environment variables
- Tests use `afterEach` to restore original environment state
- The API key is set to `"test-key"` for testing (never used since LLM is mocked)
- Database URL defaults to a test database if not set
- All tests are independent and can run in any order
