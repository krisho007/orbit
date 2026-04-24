import { z } from "zod";
import { tool } from "ai";
import { and, asc, eq, sql } from "drizzle-orm";
import { db, contactTags, tags } from "../../../db";
import { getOwnedContact } from "../ownership";

type Ctx = { userId: string };

export function tagTools({ userId }: Ctx) {
  return {
    list_tags: tool({
      description: "List all tags defined by the user along with contact counts.",
      inputSchema: z.object({}),
      execute: async () => {
        const rows = await db
          .select({
            id: tags.id,
            name: tags.name,
            color: tags.color,
            count: sql<number>`(SELECT count(*) FROM ${contactTags} WHERE ${contactTags.tagId} = ${tags.id})::int`,
          })
          .from(tags)
          .where(eq(tags.userId, userId))
          .orderBy(asc(tags.name));
        return { count: rows.length, tags: rows };
      },
    }),

    create_tag: tool({
      description: "Create a new tag. Use before assigning it to contacts.",
      inputSchema: z.object({
        name: z.string().min(1),
        color: z.string().regex(/^#?[0-9a-fA-F]{6}$/).optional().describe("Hex color e.g. #aabbcc"),
      }),
      execute: async ({ name, color }) => {
        const [tag] = await db
          .insert(tags)
          .values({ userId, name, color: color ? (color.startsWith("#") ? color : `#${color}`) : null })
          .returning();
        return { tag };
      },
    }),

    assign_tag: tool({
      description: "Assign an existing tag to a contact.",
      inputSchema: z.object({ contactId: z.string(), tagId: z.string() }),
      execute: async ({ contactId, tagId }) => {
        const owned = await getOwnedContact(userId, contactId);
        if (!owned) return { error: "Contact not found" };
        await db
          .insert(contactTags)
          .values({ contactId, tagId })
          .onConflictDoNothing();
        return { ok: true };
      },
    }),

    unassign_tag: tool({
      description: "Remove a tag assignment from a contact.",
      inputSchema: z.object({ contactId: z.string(), tagId: z.string() }),
      execute: async ({ contactId, tagId }) => {
        const owned = await getOwnedContact(userId, contactId);
        if (!owned) return { error: "Contact not found" };
        await db
          .delete(contactTags)
          .where(and(eq(contactTags.contactId, contactId), eq(contactTags.tagId, tagId)));
        return { ok: true };
      },
    }),

    delete_tag: tool({
      description: "Delete a tag. Removes it from every contact it was assigned to.",
      inputSchema: z.object({ tagId: z.string() }),
      execute: async ({ tagId }) => {
        await db.delete(tags).where(and(eq(tags.id, tagId), eq(tags.userId, userId)));
        return { ok: true };
      },
    }),
  };
}
