import { z } from "zod";
import { tool } from "ai";
import { and, asc, eq } from "drizzle-orm";
import { db, relationships, relationshipTypes } from "../../../db";
import { getOwnedContact, getOwnedRelationship, getOwnedRelationshipType } from "../ownership";

type Ctx = { userId: string };

export function relationshipTools({ userId }: Ctx) {
  return {
    list_relationship_types: tool({
      description: "List all relationship types (system + user-created).",
      inputSchema: z.object({}),
      execute: async () => {
        const rows = await db
          .select()
          .from(relationshipTypes)
          .where(eq(relationshipTypes.userId, userId))
          .orderBy(asc(relationshipTypes.name));
        return { count: rows.length, types: rows };
      },
    }),

    create_relationship_type: tool({
      description:
        "Create a new relationship type. Set isSymmetric=true for relationships like 'friend' that go both ways.",
      inputSchema: z.object({
        name: z.string().min(1),
        isSymmetric: z.boolean().default(false),
        reverseTypeId: z.string().optional().describe("Existing type id to pair as the reverse"),
      }),
      execute: async ({ name, isSymmetric, reverseTypeId }) => {
        const [row] = await db
          .insert(relationshipTypes)
          .values({
            userId,
            name,
            isSymmetric,
            reverseTypeId: reverseTypeId ?? null,
          })
          .returning();
        return { type: row };
      },
    }),

    create_relationship: tool({
      description: "Link two contacts with a relationship type. Both contacts must be owned by the user.",
      inputSchema: z.object({
        fromContactId: z.string(),
        toContactId: z.string(),
        typeId: z.string(),
        notes: z.string().optional(),
      }),
      execute: async ({ fromContactId, toContactId, typeId, notes }) => {
        const [a, b, type] = await Promise.all([
          getOwnedContact(userId, fromContactId),
          getOwnedContact(userId, toContactId),
          getOwnedRelationshipType(userId, typeId),
        ]);
        if (!a || !b) return { error: "Both contacts must exist" };
        if (!type) return { error: "Relationship type not found" };
        const [row] = await db
          .insert(relationships)
          .values({ userId, fromContactId, toContactId, typeId, notes: notes ?? null })
          .onConflictDoNothing()
          .returning();
        return { relationship: row };
      },
    }),

    update_relationship: tool({
      description: "Update the notes on an existing relationship.",
      inputSchema: z.object({ relationshipId: z.string(), notes: z.string().nullable() }),
      execute: async ({ relationshipId, notes }) => {
        const owned = await getOwnedRelationship(userId, relationshipId);
        if (!owned) return { error: "Relationship not found" };
        await db
          .update(relationships)
          .set({ notes, updatedAt: new Date() })
          .where(eq(relationships.id, relationshipId));
        return { ok: true, relationshipId };
      },
    }),

    delete_relationship: tool({
      description: "Delete a relationship by id.",
      inputSchema: z.object({ relationshipId: z.string() }),
      execute: async ({ relationshipId }) => {
        const owned = await getOwnedRelationship(userId, relationshipId);
        if (!owned) return { error: "Relationship not found" };
        await db.delete(relationships).where(eq(relationships.id, relationshipId));
        return { ok: true, relationshipId };
      },
    }),
  };
}
