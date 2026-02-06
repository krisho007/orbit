import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { generateText } from "ai";

describe("processMessageLLM", () => {
  const originalApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const originalDatabaseUrl = process.env.DATABASE_URL;
  let processMessageLLM: typeof import("./assistant").processMessageLLM;

  beforeEach(async () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key";
    process.env.DATABASE_URL ??= "postgres://postgres:postgres@localhost:5432/orbit_test";
    ({ processMessageLLM } = await import("./assistant"));
  });

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    } else {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = originalApiKey;
    }

    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it("returns created cards for mixed created entities in one assistant response", async () => {
    const fakeGenerate = (async () => ({
      text: "Logged everything.",
      toolResults: [
        {
          output: {
            type: "contact_created",
            id: "contact-1",
            displayName: "Keshav Anand",
            primaryPhone: "+1 555 111 2222",
          },
        },
        {
          output: {
            type: "conversation_created",
            id: "conversation-1",
            medium: "IN_PERSON_MEETING",
            happenedAt: "2026-02-06T10:00:00.000Z",
            content: "Came home with family.",
            participants: ["Keshav Anand", "Arpana"],
          },
        },
        {
          output: {
            type: "event_created",
            id: "event-1",
            title: "Keshav and family visit",
            startAt: "2026-02-06T10:00:00.000Z",
            location: "Home",
            participants: ["Keshav Anand", "Arpana"],
          },
        },
      ],
    })) as unknown as typeof generateText;

    const response = await processMessageLLM(
      "user-1",
      [{ role: "user", content: "Log this event and conversation." }],
      fakeGenerate
    );

    expect(response.text).toBe("Logged everything.");
    expect(response.ui?.kind).toBe("created");

    if (!response.ui || response.ui.kind !== "created") {
      throw new Error("Expected created UI payload");
    }

    const kinds = response.ui.cards.map((card) => card.kind);
    expect(kinds).toEqual(["contact", "conversation", "event"]);
    expect(response.ui.cards).toHaveLength(3);
  });
});
