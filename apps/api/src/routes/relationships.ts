// Relationships API Routes
import { Hono } from "hono";
import { z } from "zod";
import { eq, and, asc, sql, or, inArray } from "drizzle-orm";
import {
  db,
  relationships,
  relationshipTypes,
  contacts,
} from "../db";
import { authMiddleware } from "../middleware/auth";

const app = new Hono();

app.use("/*", authMiddleware);

// ============================================
// Relationship Types Routes
// ============================================

const createRelationshipTypeSchema = z.object({
  name: z.string().min(1, "Name is required"),
  reverseTypeId: z.string().optional(),
  maleReverseTypeId: z.string().optional(),
  femaleReverseTypeId: z.string().optional(),
  isSymmetric: z.boolean().optional(),
});

const updateRelationshipTypeSchema = createRelationshipTypeSchema.partial();

// GET /api/relationships/types - List all relationship types
app.get("/types", async (c) => {
  const userId = c.get("userId");

  try {
    const types = await db
      .select()
      .from(relationshipTypes)
      .where(eq(relationshipTypes.userId, userId))
      .orderBy(asc(relationshipTypes.name));

    return c.json({ types });
  } catch (error) {
    console.error("Error fetching relationship types:", error);
    return c.json({ error: "Failed to fetch relationship types" }, 500);
  }
});

// POST /api/relationships/types - Create relationship type
app.post("/types", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();

  const validation = createRelationshipTypeSchema.safeParse(body);
  if (!validation.success) {
    return c.json({ error: validation.error.errors }, 400);
  }

  const data = validation.data;

  try {
    // Check for duplicate name
    const [existing] = await db
      .select({ id: relationshipTypes.id })
      .from(relationshipTypes)
      .where(
        and(eq(relationshipTypes.userId, userId), eq(relationshipTypes.name, data.name))
      );

    if (existing) {
      return c.json({ error: "A relationship type with this name already exists" }, 400);
    }

    const [newType] = await db
      .insert(relationshipTypes)
      .values({
        userId,
        name: data.name,
        reverseTypeId: data.reverseTypeId || null,
        maleReverseTypeId: data.maleReverseTypeId || null,
        femaleReverseTypeId: data.femaleReverseTypeId || null,
        isSymmetric: data.isSymmetric || false,
        isSystem: false,
      })
      .returning();

    return c.json(newType, 201);
  } catch (error) {
    console.error("Error creating relationship type:", error);
    return c.json({ error: "Failed to create relationship type" }, 500);
  }
});

// PUT /api/relationships/types/:id - Update relationship type
app.put("/types/:id", async (c) => {
  const userId = c.get("userId");
  const typeId = c.req.param("id");
  const body = await c.req.json();

  const validation = updateRelationshipTypeSchema.safeParse(body);
  if (!validation.success) {
    return c.json({ error: validation.error.errors }, 400);
  }

  const data = validation.data;

  try {
    // Verify ownership and not system type
    const [existing] = await db
      .select({ userId: relationshipTypes.userId, isSystem: relationshipTypes.isSystem })
      .from(relationshipTypes)
      .where(eq(relationshipTypes.id, typeId));

    if (!existing || existing.userId !== userId) {
      return c.json({ error: "Relationship type not found" }, 404);
    }

    if (existing.isSystem) {
      return c.json({ error: "Cannot modify system relationship types" }, 400);
    }

    const updateData: any = { updatedAt: new Date() };
    if (data.name !== undefined) updateData.name = data.name;
    if (data.reverseTypeId !== undefined)
      updateData.reverseTypeId = data.reverseTypeId || null;
    if (data.maleReverseTypeId !== undefined)
      updateData.maleReverseTypeId = data.maleReverseTypeId || null;
    if (data.femaleReverseTypeId !== undefined)
      updateData.femaleReverseTypeId = data.femaleReverseTypeId || null;
    if (data.isSymmetric !== undefined) updateData.isSymmetric = data.isSymmetric;

    const [updatedType] = await db
      .update(relationshipTypes)
      .set(updateData)
      .where(eq(relationshipTypes.id, typeId))
      .returning();

    return c.json(updatedType);
  } catch (error) {
    console.error("Error updating relationship type:", error);
    return c.json({ error: "Failed to update relationship type" }, 500);
  }
});

// DELETE /api/relationships/types/:id - Delete relationship type
app.delete("/types/:id", async (c) => {
  const userId = c.get("userId");
  const typeId = c.req.param("id");

  try {
    // Verify ownership and not system type
    const [existing] = await db
      .select({ userId: relationshipTypes.userId, isSystem: relationshipTypes.isSystem })
      .from(relationshipTypes)
      .where(eq(relationshipTypes.id, typeId));

    if (!existing || existing.userId !== userId) {
      return c.json({ error: "Relationship type not found" }, 404);
    }

    if (existing.isSystem) {
      return c.json({ error: "Cannot delete system relationship types" }, 400);
    }

    // Delete relationships using this type first
    await db.delete(relationships).where(eq(relationships.typeId, typeId));

    // Delete the type
    await db.delete(relationshipTypes).where(eq(relationshipTypes.id, typeId));

    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting relationship type:", error);
    return c.json({ error: "Failed to delete relationship type" }, 500);
  }
});

// ============================================
// Relationships Routes
// ============================================

const createRelationshipSchema = z.object({
  fromContactId: z.string(),
  toContactId: z.string(),
  typeId: z.string(),
  notes: z.string().optional(),
});

const updateRelationshipSchema = z.object({
  typeId: z.string().optional(),
  notes: z.string().optional(),
});

// GET /api/relationships - List relationships (optionally filtered by contact)
app.get("/", async (c) => {
  const userId = c.get("userId");
  const contactId = c.req.query("contactId");

  try {
    let relationshipsList;

    if (contactId) {
      // Get relationships for a specific contact
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
      // Get all relationships
      relationshipsList = await db
        .select()
        .from(relationships)
        .where(eq(relationships.userId, userId));
    }

    // Get contact and type details
    const contactIds = [
      ...new Set([
        ...relationshipsList.map((r) => r.fromContactId),
        ...relationshipsList.map((r) => r.toContactId),
      ]),
    ];
    const typeIds = [...new Set(relationshipsList.map((r) => r.typeId))];

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

    const enrichedRelationships = relationshipsList.map((rel) => ({
      ...rel,
      fromContact: contactsMap[rel.fromContactId] || null,
      toContact: contactsMap[rel.toContactId] || null,
      type: typesMap[rel.typeId] || null,
    }));

    return c.json({ relationships: enrichedRelationships });
  } catch (error) {
    console.error("Error fetching relationships:", error);
    return c.json({ error: "Failed to fetch relationships" }, 500);
  }
});

// POST /api/relationships - Create relationship
app.post("/", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();

  const validation = createRelationshipSchema.safeParse(body);
  if (!validation.success) {
    return c.json({ error: validation.error.errors }, 400);
  }

  const data = validation.data;

  try {
    // Verify contacts belong to user
    const contactsExist = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        and(
          eq(contacts.userId, userId),
          or(
            eq(contacts.id, data.fromContactId),
            eq(contacts.id, data.toContactId)
          )
        )
      );

    if (contactsExist.length !== 2) {
      return c.json({ error: "One or both contacts not found" }, 404);
    }

    // Verify relationship type belongs to user
    const [typeExists] = await db
      .select({ id: relationshipTypes.id, isSymmetric: relationshipTypes.isSymmetric })
      .from(relationshipTypes)
      .where(
        and(
          eq(relationshipTypes.userId, userId),
          eq(relationshipTypes.id, data.typeId)
        )
      );

    if (!typeExists) {
      return c.json({ error: "Relationship type not found" }, 404);
    }

    // Check for existing relationship
    const [existing] = await db
      .select({ id: relationships.id })
      .from(relationships)
      .where(
        and(
          eq(relationships.fromContactId, data.fromContactId),
          eq(relationships.toContactId, data.toContactId),
          eq(relationships.typeId, data.typeId)
        )
      );

    if (existing) {
      return c.json({ error: "This relationship already exists" }, 400);
    }

    const [newRelationship] = await db
      .insert(relationships)
      .values({
        userId,
        fromContactId: data.fromContactId,
        toContactId: data.toContactId,
        typeId: data.typeId,
        notes: data.notes || null,
      })
      .returning();

    return c.json(newRelationship, 201);
  } catch (error) {
    console.error("Error creating relationship:", error);
    return c.json({ error: "Failed to create relationship" }, 500);
  }
});

// PUT /api/relationships/:id - Update relationship
app.put("/:id", async (c) => {
  const userId = c.get("userId");
  const relationshipId = c.req.param("id");
  const body = await c.req.json();

  const validation = updateRelationshipSchema.safeParse(body);
  if (!validation.success) {
    return c.json({ error: validation.error.errors }, 400);
  }

  const data = validation.data;

  try {
    // Verify ownership
    const [existing] = await db
      .select({ userId: relationships.userId })
      .from(relationships)
      .where(eq(relationships.id, relationshipId));

    if (!existing || existing.userId !== userId) {
      return c.json({ error: "Relationship not found" }, 404);
    }

    // Verify new type if provided
    if (data.typeId) {
      const [typeExists] = await db
        .select({ id: relationshipTypes.id })
        .from(relationshipTypes)
        .where(
          and(
            eq(relationshipTypes.userId, userId),
            eq(relationshipTypes.id, data.typeId)
          )
        );

      if (!typeExists) {
        return c.json({ error: "Relationship type not found" }, 404);
      }
    }

    const updateData: any = { updatedAt: new Date() };
    if (data.typeId !== undefined) updateData.typeId = data.typeId;
    if (data.notes !== undefined) updateData.notes = data.notes || null;

    const [updatedRelationship] = await db
      .update(relationships)
      .set(updateData)
      .where(eq(relationships.id, relationshipId))
      .returning();

    return c.json(updatedRelationship);
  } catch (error) {
    console.error("Error updating relationship:", error);
    return c.json({ error: "Failed to update relationship" }, 500);
  }
});

// DELETE /api/relationships/:id - Delete relationship
app.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const relationshipId = c.req.param("id");

  try {
    // Verify ownership
    const [existing] = await db
      .select({ userId: relationships.userId })
      .from(relationships)
      .where(eq(relationships.id, relationshipId));

    if (!existing || existing.userId !== userId) {
      return c.json({ error: "Relationship not found" }, 404);
    }

    await db.delete(relationships).where(eq(relationships.id, relationshipId));

    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting relationship:", error);
    return c.json({ error: "Failed to delete relationship" }, 500);
  }
});

export default app;
