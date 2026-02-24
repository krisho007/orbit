import { describe, expect, it } from "bun:test";
import {
  orbitModelOutputSchema,
  searchInstructionSchema,
  actionInstructionSchema,
  parseModelOutput,
  getActions,
  getReferencedSearchIds,
} from "./finetuned-types";

describe("searchInstructionSchema", () => {
  it("accepts valid search instruction", () => {
    const result = searchInstructionSchema.safeParse({
      id: "s1",
      entity_type: "contact",
      search_type: "fuzzy_name",
      query: "Alice",
      purpose: "resolve_participant",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid search ID format", () => {
    const result = searchInstructionSchema.safeParse({
      id: "search1",
      entity_type: "contact",
      search_type: "fuzzy_name",
      query: "Alice",
      purpose: "resolve_participant",
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown entity type", () => {
    const result = searchInstructionSchema.safeParse({
      id: "s1",
      entity_type: "tag",
      search_type: "fuzzy_name",
      query: "Alice",
      purpose: "resolve_participant",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty query", () => {
    const result = searchInstructionSchema.safeParse({
      id: "s1",
      entity_type: "contact",
      search_type: "fuzzy_name",
      query: "",
      purpose: "resolve_participant",
    });
    expect(result.success).toBe(false);
  });
});

describe("actionInstructionSchema", () => {
  it("accepts valid create action", () => {
    const result = actionInstructionSchema.safeParse({
      operation: "create",
      entity_type: "contact",
      params: { displayName: "Sarah Chen", company: "Google" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts action with participant refs", () => {
    const result = actionInstructionSchema.safeParse({
      operation: "create",
      entity_type: "conversation",
      params: { medium: "PHONE_CALL", content: "Budget discussion" },
      participant_refs: ["s1.best_match"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts action with target ref", () => {
    const result = actionInstructionSchema.safeParse({
      operation: "update",
      entity_type: "contact",
      params: { company: "Meta" },
      target_ref: "s1.best_match",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid operation", () => {
    const result = actionInstructionSchema.safeParse({
      operation: "delete",
      entity_type: "contact",
      params: {},
    });
    expect(result.success).toBe(false);
  });
});

describe("orbitModelOutputSchema", () => {
  it("accepts a complete valid output", () => {
    const result = orbitModelOutputSchema.safeParse({
      intents: ["create_conversation"],
      searches: [
        { id: "s1", entity_type: "contact", search_type: "fuzzy_name", query: "Alice", purpose: "resolve_participant" },
      ],
      action: {
        operation: "create",
        entity_type: "conversation",
        params: { medium: "PHONE_CALL", content: "Budget meeting", happenedAt: "NOW" },
        participant_refs: ["s1.best_match"],
      },
      response: "I'll log a phone call with Alice about the budget meeting.",
      needs_confirmation: true,
      needs_resolution: true,
    });
    expect(result.success).toBe(true);
  });

  it("accepts output with no searches and no action", () => {
    const result = orbitModelOutputSchema.safeParse({
      intents: ["unknown"],
      searches: [],
      action: null,
      response: "Hello! How can I help you today?",
      needs_confirmation: false,
      needs_resolution: false,
    });
    expect(result.success).toBe(true);
  });

  it("accepts output with multiple actions", () => {
    const result = orbitModelOutputSchema.safeParse({
      intents: ["create_contact", "create_conversation"],
      searches: [],
      actions: [
        { operation: "create", entity_type: "contact", params: { displayName: "Bob" } },
        { operation: "create", entity_type: "conversation", params: { medium: "EMAIL" } },
      ],
      response: "I'll create Bob and log an email.",
      needs_confirmation: true,
      needs_resolution: false,
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty intents array", () => {
    const result = orbitModelOutputSchema.safeParse({
      intents: [],
      searches: [],
      response: "Hello",
      needs_confirmation: false,
      needs_resolution: false,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing response", () => {
    const result = orbitModelOutputSchema.safeParse({
      intents: ["unknown"],
      searches: [],
      needs_confirmation: false,
      needs_resolution: false,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid intent", () => {
    const result = orbitModelOutputSchema.safeParse({
      intents: ["invalid_intent"],
      searches: [],
      response: "Hello",
      needs_confirmation: false,
      needs_resolution: false,
    });
    expect(result.success).toBe(false);
  });
});

describe("parseModelOutput", () => {
  it("parses valid JSON string", () => {
    const json = JSON.stringify({
      intents: ["create_contact"],
      searches: [],
      action: { operation: "create", entity_type: "contact", params: { displayName: "Alice" } },
      response: "Creating Alice.",
      needs_confirmation: true,
      needs_resolution: false,
    });

    const result = parseModelOutput(json);
    expect(result.intents).toEqual(["create_contact"]);
    expect(result.response).toBe("Creating Alice.");
  });

  it("strips markdown code fences", () => {
    const json = "```json\n" + JSON.stringify({
      intents: ["unknown"],
      searches: [],
      response: "Hello!",
      needs_confirmation: false,
      needs_resolution: false,
    }) + "\n```";

    const result = parseModelOutput(json);
    expect(result.intents).toEqual(["unknown"]);
  });

  it("throws on invalid JSON", () => {
    expect(() => parseModelOutput("not json")).toThrow();
  });

  it("throws on schema-invalid JSON", () => {
    expect(() => parseModelOutput(JSON.stringify({ intents: [] }))).toThrow();
  });
});

describe("getActions", () => {
  it("returns single action from action field", () => {
    const output: any = {
      intents: ["create_contact"],
      searches: [],
      action: { operation: "create", entity_type: "contact", params: { displayName: "Alice" } },
      response: "Creating Alice.",
      needs_confirmation: true,
      needs_resolution: false,
    };
    expect(getActions(output)).toHaveLength(1);
  });

  it("returns actions from actions array", () => {
    const output: any = {
      intents: ["create_contact", "create_conversation"],
      searches: [],
      actions: [
        { operation: "create", entity_type: "contact", params: {} },
        { operation: "create", entity_type: "conversation", params: {} },
      ],
      response: "Creating both.",
      needs_confirmation: true,
      needs_resolution: false,
    };
    expect(getActions(output)).toHaveLength(2);
  });

  it("returns empty array when no actions", () => {
    const output: any = {
      intents: ["unknown"],
      searches: [],
      response: "Hello!",
      needs_confirmation: false,
      needs_resolution: false,
    };
    expect(getActions(output)).toHaveLength(0);
  });
});

describe("getReferencedSearchIds", () => {
  it("extracts search IDs from participant refs", () => {
    const output: any = {
      intents: ["create_conversation"],
      searches: [],
      action: {
        operation: "create",
        entity_type: "conversation",
        params: {},
        participant_refs: ["s1.best_match", "s2.best_match"],
      },
      response: "Logging conversation.",
      needs_confirmation: true,
      needs_resolution: true,
    };
    const ids = getReferencedSearchIds(output);
    expect(ids.has("s1")).toBe(true);
    expect(ids.has("s2")).toBe(true);
    expect(ids.size).toBe(2);
  });

  it("extracts search ID from target ref", () => {
    const output: any = {
      intents: ["edit_contact"],
      searches: [],
      action: {
        operation: "update",
        entity_type: "contact",
        params: { company: "Meta" },
        target_ref: "s1.best_match",
      },
      response: "Updating contact.",
      needs_confirmation: true,
      needs_resolution: true,
    };
    const ids = getReferencedSearchIds(output);
    expect(ids.has("s1")).toBe(true);
    expect(ids.size).toBe(1);
  });
});
