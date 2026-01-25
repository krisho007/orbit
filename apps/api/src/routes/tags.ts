// Tags API Routes
import { Hono } from "hono";
import { z } from "zod";
import { eq, and, asc, sql } from "drizzle-orm";
import { db, tags, contactTags } from "../db";
import { authMiddleware } from "../middleware/auth";

const app = new Hono();

app.use("/*", authMiddleware);

// Validation schemas
const createTagSchema = z.object({
  name: z.string().min(1, "Name is required"),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

const updateTagSchema = createTagSchema.partial();

// GET /api/tags - List all tags
app.get("/", async (c) => {
  const userId = c.get("userId");

  try {
    const tagsList = await db
      .select()
      .from(tags)
      .where(eq(tags.userId, userId))
      .orderBy(asc(tags.name));

    // Get contact counts for each tag
    const tagIds = tagsList.map((t) => t.id);
    
    const contactCounts = tagIds.length > 0
      ? await db
          .select({
            tagId: contactTags.tagId,
            count: sql<number>`count(*)`,
          })
          .from(contactTags)
          .where(sql`${contactTags.tagId} = ANY(${tagIds})`)
          .groupBy(contactTags.tagId)
      : [];

    const enrichedTags = tagsList.map((tag) => ({
      ...tag,
      _count: {
        contacts: Number(contactCounts.find((cc) => cc.tagId === tag.id)?.count || 0),
      },
    }));

    return c.json({ tags: enrichedTags });
  } catch (error) {
    console.error("Error fetching tags:", error);
    return c.json({ error: "Failed to fetch tags" }, 500);
  }
});

// GET /api/tags/:id - Get single tag
app.get("/:id", async (c) => {
  const userId = c.get("userId");
  const tagId = c.req.param("id");

  try {
    const [tag] = await db
      .select()
      .from(tags)
      .where(and(eq(tags.id, tagId), eq(tags.userId, userId)));

    if (!tag) {
      return c.json({ error: "Tag not found" }, 404);
    }

    // Get contact count
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(contactTags)
      .where(eq(contactTags.tagId, tagId));

    return c.json({
      ...tag,
      _count: {
        contacts: Number(countResult?.count || 0),
      },
    });
  } catch (error) {
    console.error("Error fetching tag:", error);
    return c.json({ error: "Failed to fetch tag" }, 500);
  }
});

// POST /api/tags - Create tag
app.post("/", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();

  const validation = createTagSchema.safeParse(body);
  if (!validation.success) {
    return c.json({ error: validation.error.errors }, 400);
  }

  const data = validation.data;

  try {
    // Check for duplicate name
    const [existing] = await db
      .select({ id: tags.id })
      .from(tags)
      .where(and(eq(tags.userId, userId), eq(tags.name, data.name)));

    if (existing) {
      return c.json({ error: "A tag with this name already exists" }, 400);
    }

    const [newTag] = await db
      .insert(tags)
      .values({
        userId,
        name: data.name,
        color: data.color || "#3B82F6",
      })
      .returning();

    return c.json(newTag, 201);
  } catch (error) {
    console.error("Error creating tag:", error);
    return c.json({ error: "Failed to create tag" }, 500);
  }
});

// PUT /api/tags/:id - Update tag
app.put("/:id", async (c) => {
  const userId = c.get("userId");
  const tagId = c.req.param("id");
  const body = await c.req.json();

  const validation = updateTagSchema.safeParse(body);
  if (!validation.success) {
    return c.json({ error: validation.error.errors }, 400);
  }

  const data = validation.data;

  try {
    // Verify ownership
    const [existing] = await db
      .select({ userId: tags.userId })
      .from(tags)
      .where(eq(tags.id, tagId));

    if (!existing || existing.userId !== userId) {
      return c.json({ error: "Tag not found" }, 404);
    }

    // Check for duplicate name if name is being updated
    if (data.name) {
      const [duplicate] = await db
        .select({ id: tags.id })
        .from(tags)
        .where(
          and(
            eq(tags.userId, userId),
            eq(tags.name, data.name),
            sql`${tags.id} != ${tagId}`
          )
        );

      if (duplicate) {
        return c.json({ error: "A tag with this name already exists" }, 400);
      }
    }

    const updateData: any = { updatedAt: new Date() };
    if (data.name !== undefined) updateData.name = data.name;
    if (data.color !== undefined) updateData.color = data.color;

    const [updatedTag] = await db
      .update(tags)
      .set(updateData)
      .where(eq(tags.id, tagId))
      .returning();

    return c.json(updatedTag);
  } catch (error) {
    console.error("Error updating tag:", error);
    return c.json({ error: "Failed to update tag" }, 500);
  }
});

// DELETE /api/tags/:id - Delete tag
app.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const tagId = c.req.param("id");

  try {
    // Verify ownership
    const [existing] = await db
      .select({ userId: tags.userId })
      .from(tags)
      .where(eq(tags.id, tagId));

    if (!existing || existing.userId !== userId) {
      return c.json({ error: "Tag not found" }, 404);
    }

    // Delete tag (contact_tags will cascade)
    await db.delete(tags).where(eq(tags.id, tagId));

    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting tag:", error);
    return c.json({ error: "Failed to delete tag" }, 500);
  }
});

export default app;
