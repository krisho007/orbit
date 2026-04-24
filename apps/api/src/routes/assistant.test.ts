import { describe, expect, it } from "bun:test";
import { buildAllTools } from "./assistant";

describe("assistant tools", () => {
  const tools = buildAllTools({ userId: "test-user-1" });

  it("exposes all core namespaces", () => {
    const names = Object.keys(tools);
    // Contacts
    expect(names).toContain("search_contacts");
    expect(names).toContain("create_contact");
    expect(names).toContain("update_contact");
    expect(names).toContain("delete_contact");
    // Tags
    expect(names).toContain("list_tags");
    expect(names).toContain("assign_tag");
    // Conversations
    expect(names).toContain("search_conversations");
    expect(names).toContain("create_conversation");
    // Events
    expect(names).toContain("list_upcoming_events");
    expect(names).toContain("create_event");
    // Reminders
    expect(names).toContain("create_reminder");
    expect(names).toContain("complete_reminder");
    // Relationships
    expect(names).toContain("list_relationship_types");
    // Helpers
    expect(names).toContain("get_user_profile");
    expect(names).toContain("get_contact_timeline");
    // Navigation
    expect(names).toContain("navigate_to_contact");
    expect(names).toContain("open_contact_create_form");
  });

  it("every tool has description + inputSchema + execute", () => {
    for (const [name, t] of Object.entries(tools)) {
      expect(typeof (t as { description?: string }).description).toBe("string");
      expect((t as { inputSchema?: unknown }).inputSchema).toBeDefined();
      expect(typeof (t as { execute?: unknown }).execute).toBe("function");
      if (!(t as { description?: string }).description) {
        throw new Error(`Tool ${name} is missing description`);
      }
    }
  });

  it("navigation tools return action hints without DB writes", async () => {
    const t = tools.navigate_to_contact as any;
    const out = await t.execute({ contactId: "abc-123" }, { toolCallId: "tc1", messages: [] });
    expect(out).toEqual({ action: "navigate", path: "/contact/abc-123", contactId: "abc-123" });

    const f = tools.open_contact_create_form as any;
    const fOut = await f.execute({ displayName: "Jane" }, { toolCallId: "tc2", messages: [] });
    expect(fOut.action).toBe("open_form");
    expect(fOut.path).toBe("/contact/new");
    expect(fOut.prefill).toEqual({ displayName: "Jane" });
  });
});
