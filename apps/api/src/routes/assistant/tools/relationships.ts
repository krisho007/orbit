import { z } from "zod";
import { tool } from "ai";
import { eq, and, sql, ilike, asc, or, inArray } from "drizzle-orm";
import {
  db,
  contacts,
  relationships,
  relationshipTypes,
  users,
} from "../../../db";
import type { ToolResult } from "../types";
import { getOwnedRelationshipType, getOwnedRelationship } from "../ownership";
import { searchContactsFuzzy } from "./contacts";

// ── Implementation functions ─────────────────────────────────────────

export async function listRelationshipTypes(userId: string): Promise<ToolResult> {
  const types = await db
    .select()
    .from(relationshipTypes)
    .where(eq(relationshipTypes.userId, userId))
    .orderBy(asc(relationshipTypes.name));

  return { type: "relationship_types", types };
}

export async function createRelationshipType(
  userId: string,
  payload: {
    name: string;
    reverseTypeId?: string;
    maleReverseTypeId?: string;
    femaleReverseTypeId?: string;
    isSymmetric?: boolean;
  }
): Promise<ToolResult> {
  const [existing] = await db
    .select({ id: relationshipTypes.id })
    .from(relationshipTypes)
    .where(and(eq(relationshipTypes.userId, userId), eq(relationshipTypes.name, payload.name)));

  if (existing) {
    return { type: "error", message: "A relationship type with this name already exists" };
  }

  const [newType] = await db
    .insert(relationshipTypes)
    .values({
      userId,
      name: payload.name,
      reverseTypeId: payload.reverseTypeId || null,
      maleReverseTypeId: payload.maleReverseTypeId || null,
      femaleReverseTypeId: payload.femaleReverseTypeId || null,
      isSymmetric: payload.isSymmetric || false,
      isSystem: false,
    })
    .returning();

  if (!newType) {
    return { type: "error", message: "Failed to create relationship type" };
  }

  return { type: "relationship_type_created", id: newType.id, name: newType.name };
}

export async function updateRelationshipTypeById(
  userId: string,
  typeId: string,
  updates: {
    name?: string;
    reverseTypeId?: string;
    maleReverseTypeId?: string;
    femaleReverseTypeId?: string;
    isSymmetric?: boolean;
  }
): Promise<ToolResult> {
  const existing = await getOwnedRelationshipType(userId, typeId);
  if (!existing) return { type: "error", message: "Relationship type not found" };

  if (existing.isSystem) {
    return { type: "error", message: "Cannot modify system relationship types" };
  }

  const updateData: any = { updatedAt: new Date() };
  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.reverseTypeId !== undefined)
    updateData.reverseTypeId = updates.reverseTypeId || null;
  if (updates.maleReverseTypeId !== undefined)
    updateData.maleReverseTypeId = updates.maleReverseTypeId || null;
  if (updates.femaleReverseTypeId !== undefined)
    updateData.femaleReverseTypeId = updates.femaleReverseTypeId || null;
  if (updates.isSymmetric !== undefined) updateData.isSymmetric = updates.isSymmetric;

  const [updatedType] = await db
    .update(relationshipTypes)
    .set(updateData)
    .where(eq(relationshipTypes.id, typeId))
    .returning();

  if (!updatedType) {
    return { type: "error", message: "Failed to update relationship type" };
  }

  return { type: "relationship_type_updated", id: updatedType.id, name: updatedType.name };
}

export async function deleteRelationshipTypeById(
  userId: string,
  typeId: string
): Promise<ToolResult> {
  const existing = await getOwnedRelationshipType(userId, typeId);
  if (!existing) return { type: "error", message: "Relationship type not found" };

  if (existing.isSystem) {
    return { type: "error", message: "Cannot delete system relationship types" };
  }

  await db.delete(relationships).where(eq(relationships.typeId, typeId));
  await db.delete(relationshipTypes).where(eq(relationshipTypes.id, typeId));

  return { type: "relationship_type_deleted", id: typeId };
}

export async function listRelationships(
  userId: string,
  contactId?: string
): Promise<ToolResult> {
  let relationshipsList;
  if (contactId) {
    relationshipsList = await db
      .select()
      .from(relationships)
      .where(
        and(
          eq(relationships.userId, userId),
          or(
            eq(relationships.fromContactId, contactId),
            eq(relationships.toContactId, contactId)
          )
        )
      );
  } else {
    relationshipsList = await db
      .select()
      .from(relationships)
      .where(eq(relationships.userId, userId));
  }

  const contactIds = [
    ...new Set([
      ...relationshipsList.map((r: any) => r.fromContactId),
      ...relationshipsList.map((r: any) => r.toContactId),
    ]),
  ];
  const typeIds = [...new Set(relationshipsList.map((r: any) => r.typeId))];

  const [contactsData, typesData] = await Promise.all([
    contactIds.length > 0
      ? db
          .select({ id: contacts.id, displayName: contacts.displayName })
          .from(contacts)
          .where(inArray(contacts.id, contactIds))
      : [],
    typeIds.length > 0
      ? db.select().from(relationshipTypes).where(inArray(relationshipTypes.id, typeIds))
      : [],
  ]);

  const contactsMap = Object.fromEntries(contactsData.map((c) => [c.id, c]));
  const typesMap = Object.fromEntries(typesData.map((t) => [t.id, t]));

  const enrichedRelationships = relationshipsList.map((rel: any) => ({
    ...rel,
    fromContact: contactsMap[rel.fromContactId] || null,
    toContact: contactsMap[rel.toContactId] || null,
    type: typesMap[rel.typeId] || null,
  }));

  return { type: "relationships", relationships: enrichedRelationships };
}

export async function createRelationship(
  userId: string,
  payload: { fromContactId: string; toContactId: string; typeId: string; notes?: string }
): Promise<ToolResult> {
  const contactsExist = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(
      and(
        eq(contacts.userId, userId),
        or(eq(contacts.id, payload.fromContactId), eq(contacts.id, payload.toContactId))
      )
    );

  if (contactsExist.length !== 2) {
    return { type: "error", message: "One or both contacts not found" };
  }

  const [typeExists] = await db
    .select({ id: relationshipTypes.id })
    .from(relationshipTypes)
    .where(and(eq(relationshipTypes.userId, userId), eq(relationshipTypes.id, payload.typeId)));

  if (!typeExists) {
    return { type: "error", message: "Relationship type not found" };
  }

  const [existing] = await db
    .select({ id: relationships.id })
    .from(relationships)
    .where(
      and(
        eq(relationships.fromContactId, payload.fromContactId),
        eq(relationships.toContactId, payload.toContactId),
        eq(relationships.typeId, payload.typeId)
      )
    );

  if (existing) {
    return { type: "error", message: "This relationship already exists" };
  }

  const [newRelationship] = await db
    .insert(relationships)
    .values({
      userId,
      fromContactId: payload.fromContactId,
      toContactId: payload.toContactId,
      typeId: payload.typeId,
      notes: payload.notes || null,
    })
    .returning();

  if (!newRelationship) {
    return { type: "error", message: "Failed to create relationship" };
  }

  return { type: "relationship_created", id: newRelationship.id };
}

export async function updateRelationshipById(
  userId: string,
  relationshipId: string,
  updates: { typeId?: string; notes?: string }
): Promise<ToolResult> {
  const existing = await getOwnedRelationship(userId, relationshipId);
  if (!existing) return { type: "error", message: "Relationship not found" };

  if (updates.typeId) {
    const [typeExists] = await db
      .select({ id: relationshipTypes.id })
      .from(relationshipTypes)
      .where(and(eq(relationshipTypes.userId, userId), eq(relationshipTypes.id, updates.typeId)));

    if (!typeExists) {
      return { type: "error", message: "Relationship type not found" };
    }
  }

  const updateData: any = { updatedAt: new Date() };
  if (updates.typeId !== undefined) updateData.typeId = updates.typeId;
  if (updates.notes !== undefined) updateData.notes = updates.notes || null;

  await db.update(relationships).set(updateData).where(eq(relationships.id, relationshipId));

  return { type: "relationship_updated", id: relationshipId };
}

export async function deleteRelationshipById(
  userId: string,
  relationshipId: string
): Promise<ToolResult> {
  const existing = await getOwnedRelationship(userId, relationshipId);
  if (!existing) return { type: "error", message: "Relationship not found" };

  await db.delete(relationships).where(eq(relationships.id, relationshipId));
  return { type: "relationship_deleted", id: relationshipId };
}

// Set the user's primary contact (links "me"/"I" to a contact record)
export async function setMyContact(
  userId: string,
  contactId: string
): Promise<ToolResult> {
  const [contact] = await db
    .select({ id: contacts.id, displayName: contacts.displayName })
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.userId, userId)))
    .limit(1);

  if (!contact) {
    return { type: "error", message: "Contact not found" };
  }

  await db
    .update(users)
    .set({ primaryContactId: contactId, updatedAt: new Date() })
    .where(eq(users.id, userId));

  return {
    type: "my_contact_set",
    contactId: contact.id,
    displayName: contact.displayName,
  };
}

// Resolve a contact name to a contact, reusing the existing fuzzy search.
// Returns the best match if clear, or top 5 candidates for disambiguation.
export async function resolveContactByName(
  userId: string,
  name: string
): Promise<ToolResult> {
  const result = await searchContactsFuzzy(userId, name, 5);
  const matches = (result as any).contacts as Array<{
    id: string;
    displayName: string;
    similarity?: number;
  }>;

  if (!matches || matches.length === 0) {
    return {
      type: "contact_not_found",
      message: `No contacts found matching "${name}". You can create a new contact if needed.`,
      searchedName: name,
    };
  }

  // If there's a single strong match (similarity >= 0.6), return it directly
  const topMatch = matches[0]!;
  if (matches.length === 1 || (topMatch.similarity && topMatch.similarity >= 0.6)) {
    return {
      type: "contact_resolved",
      contact: { id: topMatch.id, displayName: topMatch.displayName },
    };
  }

  // Multiple possible matches — return top 5 for disambiguation
  return {
    type: "contact_ambiguous",
    message: `Multiple contacts match "${name}". Please ask the user which one they mean.`,
    candidates: matches.map((m) => ({
      id: m.id,
      displayName: m.displayName,
    })),
  };
}

// Resolve a relationship type by name, returning top matches when ambiguous
export async function resolveRelationshipTypeByName(
  userId: string,
  typeName: string
): Promise<ToolResult> {
  // Try exact match first (case-insensitive)
  const [exactMatch] = await db
    .select({ id: relationshipTypes.id, name: relationshipTypes.name })
    .from(relationshipTypes)
    .where(
      and(
        eq(relationshipTypes.userId, userId),
        sql`LOWER(${relationshipTypes.name}) = LOWER(${typeName})`
      )
    )
    .limit(1);

  if (exactMatch) {
    return {
      type: "relationship_type_resolved",
      relationshipType: { id: exactMatch.id, name: exactMatch.name },
    };
  }

  // Try partial match
  const partialMatches = await db
    .select({ id: relationshipTypes.id, name: relationshipTypes.name })
    .from(relationshipTypes)
    .where(
      and(
        eq(relationshipTypes.userId, userId),
        ilike(relationshipTypes.name, `%${typeName}%`)
      )
    )
    .limit(5);

  if (partialMatches.length === 1) {
    const match = partialMatches[0]!;
    return {
      type: "relationship_type_resolved",
      relationshipType: { id: match.id, name: match.name },
    };
  }

  if (partialMatches.length > 1) {
    return {
      type: "relationship_type_ambiguous",
      message: `Multiple relationship types match "${typeName}". Ask the user which one they mean.`,
      candidates: partialMatches.map((t) => ({ id: t.id, name: t.name })),
    };
  }

  return {
    type: "relationship_type_not_found",
    message: `No relationship type found matching "${typeName}". You can create one using the create_relationship_type tool.`,
    searchedName: typeName,
  };
}

// Smart relationship creation using names instead of IDs
export async function createRelationshipByNames(
  userId: string,
  payload: {
    fromContactName?: string;
    fromContactId?: string;
    toContactName?: string;
    toContactId?: string;
    relationshipTypeName?: string;
    relationshipTypeId?: string;
    notes?: string;
  }
): Promise<ToolResult> {
  // Resolve "from" contact
  let fromId = payload.fromContactId;
  if (!fromId && payload.fromContactName) {
    const result = await resolveContactByName(userId, payload.fromContactName);
    if (result.type === "contact_resolved") {
      fromId = (result as any).contact.id;
    } else {
      return result; // Return ambiguous/not_found result to the LLM
    }
  }

  // Resolve "to" contact
  let toId = payload.toContactId;
  if (!toId && payload.toContactName) {
    const result = await resolveContactByName(userId, payload.toContactName);
    if (result.type === "contact_resolved") {
      toId = (result as any).contact.id;
    } else {
      return result; // Return ambiguous/not_found result to the LLM
    }
  }

  if (!fromId || !toId) {
    return { type: "error", message: "Both from and to contacts are required" };
  }

  // Resolve relationship type
  let typeId = payload.relationshipTypeId;
  if (!typeId && payload.relationshipTypeName) {
    const result = await resolveRelationshipTypeByName(userId, payload.relationshipTypeName);
    if (result.type === "relationship_type_resolved") {
      typeId = (result as any).relationshipType.id;
    } else {
      return result; // Return ambiguous/not_found result to the LLM
    }
  }

  if (!typeId) {
    return { type: "error", message: "Relationship type is required" };
  }

  // Now create the relationship using the resolved IDs
  return createRelationship(userId, {
    fromContactId: fromId,
    toContactId: toId,
    typeId,
    notes: payload.notes,
  });
}

// ── Tool definitions ─────────────────────────────────────────────────

export function createRelationshipTools(userId: string) {
  return {
    list_relationships: tool({
      description: "List relationships, optionally filtered by contact id",
      inputSchema: z.object({
        contactId: z.string().optional().describe("Contact id to filter by"),
      }),
      execute: async ({ contactId }) => listRelationships(userId, contactId),
    }),

    create_relationship: tool({
      description: "Create a relationship",
      inputSchema: z.object({
        fromContactId: z.string().describe("From contact id"),
        toContactId: z.string().describe("To contact id"),
        typeId: z.string().describe("Relationship type id"),
        notes: z.string().optional().describe("Notes"),
      }),
      execute: async ({ fromContactId, toContactId, typeId, notes }) =>
        createRelationship(userId, { fromContactId, toContactId, typeId, notes }),
    }),

    update_relationship: tool({
      description: "Update a relationship by id",
      inputSchema: z.object({
        relationshipId: z.string().describe("Relationship id"),
        typeId: z.string().optional().describe("Relationship type id"),
        notes: z.string().optional().describe("Notes"),
      }),
      execute: async ({ relationshipId, typeId, notes }) =>
        updateRelationshipById(userId, relationshipId, { typeId, notes }),
    }),

    list_relationship_types: tool({
      description: "List relationship types",
      inputSchema: z.object({}),
      execute: async () => listRelationshipTypes(userId),
    }),

    create_relationship_type: tool({
      description: "Create a relationship type",
      inputSchema: z.object({
        name: z.string().describe("Type name"),
        reverseTypeId: z.string().optional().describe("Reverse type id"),
        maleReverseTypeId: z.string().optional().describe("Male reverse type id"),
        femaleReverseTypeId: z.string().optional().describe("Female reverse type id"),
        isSymmetric: z.boolean().optional().describe("Is symmetric"),
      }),
      execute: async ({ name, reverseTypeId, maleReverseTypeId, femaleReverseTypeId, isSymmetric }) =>
        createRelationshipType(userId, { name, reverseTypeId, maleReverseTypeId, femaleReverseTypeId, isSymmetric }),
    }),

    update_relationship_type: tool({
      description: "Update a relationship type by id",
      inputSchema: z.object({
        typeId: z.string().describe("Type id"),
        name: z.string().optional().describe("Type name"),
        reverseTypeId: z.string().optional().describe("Reverse type id"),
        maleReverseTypeId: z.string().optional().describe("Male reverse type id"),
        femaleReverseTypeId: z.string().optional().describe("Female reverse type id"),
        isSymmetric: z.boolean().optional().describe("Is symmetric"),
      }),
      execute: async ({ typeId, name, reverseTypeId, maleReverseTypeId, femaleReverseTypeId, isSymmetric }) =>
        updateRelationshipTypeById(userId, typeId, { name, reverseTypeId, maleReverseTypeId, femaleReverseTypeId, isSymmetric }),
    }),

    // --- Smart tools (name-based, with disambiguation) ---

    set_my_contact: tool({
      description:
        "Link the logged-in user to their own contact record. Use this when the user confirms which contact is theirs, so future 'I'/'me'/'my' references resolve automatically.",
      inputSchema: z.object({
        contactId: z
          .string()
          .describe("The contact ID to link as the user's own contact"),
      }),
      execute: async ({ contactId }) => setMyContact(userId, contactId),
    }),

    resolve_contact: tool({
      description:
        "Resolve a person's name to a contact record. Returns the best match if clear, or top 5 candidates if ambiguous. Use this before creating relationships or when you need a contact ID from a name.",
      inputSchema: z.object({
        name: z.string().describe("The person's name to search for"),
      }),
      execute: async ({ name }) => resolveContactByName(userId, name),
    }),

    create_relationship_smart: tool({
      description:
        "Create a relationship between two contacts using names instead of IDs. Automatically resolves contact names and relationship type names via fuzzy matching. Use the user's contact ID for 'I'/'me'/'my' when available from the system prompt. If a contact or type can't be resolved, it returns candidates for disambiguation.",
      inputSchema: z.object({
        fromContactName: z
          .string()
          .optional()
          .describe("Name of the 'from' contact (e.g., the user's name)"),
        fromContactId: z
          .string()
          .optional()
          .describe("ID of the 'from' contact (use if already known, e.g., user's own contact ID from system prompt)"),
        toContactName: z
          .string()
          .optional()
          .describe("Name of the 'to' contact (e.g., 'Abhinav')"),
        toContactId: z
          .string()
          .optional()
          .describe("ID of the 'to' contact (use if already known)"),
        relationshipTypeName: z
          .string()
          .optional()
          .describe("Name of the relationship type (e.g., 'Son', 'Spouse', 'Colleague')"),
        relationshipTypeId: z
          .string()
          .optional()
          .describe("ID of the relationship type (use if already known)"),
        notes: z.string().optional().describe("Optional notes about the relationship"),
      }),
      execute: async ({
        fromContactName,
        fromContactId,
        toContactName,
        toContactId,
        relationshipTypeName,
        relationshipTypeId,
        notes,
      }) =>
        createRelationshipByNames(userId, {
          fromContactName,
          fromContactId,
          toContactName,
          toContactId,
          relationshipTypeName,
          relationshipTypeId,
          notes,
        }),
    }),
  };
}
