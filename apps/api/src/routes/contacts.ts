// Contacts API Routes
import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc, asc, sql, ilike, or, inArray } from "drizzle-orm";
import { db, contacts, contactTags, tags, contactImages, socialLinks } from "../db";
import { authMiddleware } from "../middleware/auth";

const app = new Hono();

// Apply auth middleware to all routes
app.use("/*", authMiddleware);

const PAGE_SIZE = 20;

// Validation schemas
const createContactSchema = z.object({
  displayName: z.string().min(1, "Display name is required"),
  primaryPhone: z.string().optional(),
  primaryEmail: z.string().email().optional().or(z.literal("")),
  dateOfBirth: z.string().optional(),
  gender: z.enum(["MALE", "FEMALE"]).optional(),
  company: z.string().optional(),
  jobTitle: z.string().optional(),
  location: z.string().optional(),
  notes: z.string().optional(),
  tagIds: z.array(z.string()).optional(),
});

const updateContactSchema = createContactSchema.partial();

// GET /api/contacts - List contacts with pagination and search
app.get("/", async (c) => {
  const userId = c.get("userId");
  const cursor = c.req.query("cursor");
  const search = c.req.query("search") || "";
  const limit = parseInt(c.req.query("limit") || String(PAGE_SIZE));

  console.log("[Contacts] Fetching for userId:", userId);

  try {
    let contactsList;

    if (search) {
      // Fuzzy search using trigram similarity
      contactsList = await db.execute(sql`
        SELECT
          c.*,
          GREATEST(
            similarity(c."displayName", ${search}),
            word_similarity(${search}, c."displayName"),
            COALESCE(similarity(c.company, ${search}), 0),
            COALESCE(word_similarity(${search}, c.company), 0)
          ) as similarity
        FROM contacts c
        WHERE
          c."userId" = ${userId}
          AND (
            similarity(c."displayName", ${search}) > 0.3
            OR word_similarity(${search}, c."displayName") > 0.3
            OR similarity(c.company, ${search}) > 0.3
            OR word_similarity(${search}, c.company) > 0.3
            OR c."displayName" ILIKE ${"%" + search + "%"}
            OR c.company ILIKE ${"%" + search + "%"}
          )
        ORDER BY similarity DESC
        LIMIT ${limit + 1}
      `);
    } else {
      // Regular paginated list
      if (cursor) {
        contactsList = await db
          .select()
          .from(contacts)
          .where(
            and(
              eq(contacts.userId, userId),
              sql`${contacts.displayName} > (SELECT "displayName" FROM contacts WHERE id = ${cursor})`
            )
          )
          .orderBy(asc(contacts.displayName))
          .limit(limit + 1);
      } else {
        contactsList = await db
          .select()
          .from(contacts)
          .where(eq(contacts.userId, userId))
          .orderBy(asc(contacts.displayName))
          .limit(limit + 1);
      }
    }

    // Check if there are more results
    let nextCursor: string | null = null;
    const results = Array.isArray(contactsList) ? contactsList : contactsList.rows || [];
    
    if (results.length > limit) {
      const nextItem = results.pop();
      nextCursor = nextItem?.id || null;
    }

    // Get tags and images for each contact
    const contactIds = results.map((c: any) => c.id);
    
    const [contactTagsData, contactImagesData] = await Promise.all([
      contactIds.length > 0
        ? db
            .select()
            .from(contactTags)
            .innerJoin(tags, eq(contactTags.tagId, tags.id))
            .where(inArray(contactTags.contactId, contactIds))
        : [],
      contactIds.length > 0
        ? db
            .select()
            .from(contactImages)
            .where(
              and(
                inArray(contactImages.contactId, contactIds),
                eq(contactImages.order, 0)
              )
            )
        : [],
    ]);

    // Map tags and images to contacts
    const enrichedContacts = results.map((contact: any) => ({
      ...contact,
      tags: contactTagsData
        .filter((ct: any) => ct.contact_tags.contactId === contact.id)
        .map((ct: any) => ct.tags),
      images: contactImagesData.filter(
        (img: any) => img.contactId === contact.id
      ),
    }));

    // Get stats on first load (no cursor)
    let stats = null;
    if (!cursor && !search) {
      const [totalResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(contacts)
        .where(eq(contacts.userId, userId));
      
      stats = {
        totalCount: Number(totalResult?.count || 0),
      };
    }

    return c.json({
      contacts: enrichedContacts,
      nextCursor,
      stats,
    });
  } catch (error) {
    console.error("Error fetching contacts:", error);
    return c.json({ error: "Failed to fetch contacts" }, 500);
  }
});

// GET /api/contacts/:id - Get single contact
app.get("/:id", async (c) => {
  const userId = c.get("userId");
  const contactId = c.req.param("id");

  try {
    const [contact] = await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.id, contactId), eq(contacts.userId, userId)));

    if (!contact) {
      return c.json({ error: "Contact not found" }, 404);
    }

    // Get related data
    const [contactTagsData, images, links] = await Promise.all([
      db
        .select()
        .from(contactTags)
        .innerJoin(tags, eq(contactTags.tagId, tags.id))
        .where(eq(contactTags.contactId, contactId)),
      db
        .select()
        .from(contactImages)
        .where(eq(contactImages.contactId, contactId))
        .orderBy(asc(contactImages.order)),
      db
        .select()
        .from(socialLinks)
        .where(eq(socialLinks.contactId, contactId)),
    ]);

    return c.json({
      ...contact,
      tags: contactTagsData.map((ct) => ct.tags),
      images,
      socialLinks: links,
    });
  } catch (error) {
    console.error("Error fetching contact:", error);
    return c.json({ error: "Failed to fetch contact" }, 500);
  }
});

// POST /api/contacts - Create contact
app.post("/", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();

  const validation = createContactSchema.safeParse(body);
  if (!validation.success) {
    return c.json({ error: validation.error.errors }, 400);
  }

  const data = validation.data;

  try {
    const [newContact] = await db
      .insert(contacts)
      .values({
        userId,
        displayName: data.displayName,
        primaryPhone: data.primaryPhone || null,
        primaryEmail: data.primaryEmail || null,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
        gender: data.gender || null,
        company: data.company || null,
        jobTitle: data.jobTitle || null,
        location: data.location || null,
        notes: data.notes || null,
      })
      .returning();

    // Add tags if provided
    if (data.tagIds && data.tagIds.length > 0) {
      await db.insert(contactTags).values(
        data.tagIds.map((tagId) => ({
          contactId: newContact.id,
          tagId,
        }))
      );
    }

    return c.json(newContact, 201);
  } catch (error) {
    console.error("Error creating contact:", error);
    return c.json({ error: "Failed to create contact" }, 500);
  }
});

// PUT /api/contacts/:id - Update contact
app.put("/:id", async (c) => {
  const userId = c.get("userId");
  const contactId = c.req.param("id");
  const body = await c.req.json();

  const validation = updateContactSchema.safeParse(body);
  if (!validation.success) {
    return c.json({ error: validation.error.errors }, 400);
  }

  const data = validation.data;

  try {
    // Verify ownership
    const [existing] = await db
      .select({ userId: contacts.userId })
      .from(contacts)
      .where(eq(contacts.id, contactId));

    if (!existing || existing.userId !== userId) {
      return c.json({ error: "Contact not found" }, 404);
    }

    // Build update object
    const updateData: any = { updatedAt: new Date() };
    if (data.displayName !== undefined) updateData.displayName = data.displayName;
    if (data.primaryPhone !== undefined) updateData.primaryPhone = data.primaryPhone || null;
    if (data.primaryEmail !== undefined) updateData.primaryEmail = data.primaryEmail || null;
    if (data.dateOfBirth !== undefined) updateData.dateOfBirth = data.dateOfBirth ? new Date(data.dateOfBirth) : null;
    if (data.gender !== undefined) updateData.gender = data.gender || null;
    if (data.company !== undefined) updateData.company = data.company || null;
    if (data.jobTitle !== undefined) updateData.jobTitle = data.jobTitle || null;
    if (data.location !== undefined) updateData.location = data.location || null;
    if (data.notes !== undefined) updateData.notes = data.notes || null;

    const [updatedContact] = await db
      .update(contacts)
      .set(updateData)
      .where(eq(contacts.id, contactId))
      .returning();

    // Update tags if provided
    if (data.tagIds !== undefined) {
      // Remove existing tags
      await db.delete(contactTags).where(eq(contactTags.contactId, contactId));

      // Add new tags
      if (data.tagIds.length > 0) {
        await db.insert(contactTags).values(
          data.tagIds.map((tagId) => ({
            contactId,
            tagId,
          }))
        );
      }
    }

    return c.json(updatedContact);
  } catch (error) {
    console.error("Error updating contact:", error);
    return c.json({ error: "Failed to update contact" }, 500);
  }
});

// DELETE /api/contacts/:id - Delete contact
app.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const contactId = c.req.param("id");

  try {
    // Verify ownership
    const [existing] = await db
      .select({ userId: contacts.userId })
      .from(contacts)
      .where(eq(contacts.id, contactId));

    if (!existing || existing.userId !== userId) {
      return c.json({ error: "Contact not found" }, 404);
    }

    await db.delete(contacts).where(eq(contacts.id, contactId));

    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting contact:", error);
    return c.json({ error: "Failed to delete contact" }, 500);
  }
});

// POST /api/contacts/:id/images - Upload image
app.post("/:id/images", async (c) => {
  const userId = c.get("userId");
  const contactId = c.req.param("id");
  const body = await c.req.json();

  try {
    // Verify ownership
    const [existing] = await db
      .select({ userId: contacts.userId })
      .from(contacts)
      .where(eq(contacts.id, contactId));

    if (!existing || existing.userId !== userId) {
      return c.json({ error: "Contact not found" }, 404);
    }

    // Get current max order
    const [maxOrder] = await db
      .select({ maxOrder: sql<number>`COALESCE(MAX("order"), -1)` })
      .from(contactImages)
      .where(eq(contactImages.contactId, contactId));

    const [newImage] = await db
      .insert(contactImages)
      .values({
        contactId,
        imageUrl: body.imageUrl,
        publicId: body.publicId || null,
        order: (maxOrder?.maxOrder || 0) + 1,
      })
      .returning();

    return c.json(newImage, 201);
  } catch (error) {
    console.error("Error adding image:", error);
    return c.json({ error: "Failed to add image" }, 500);
  }
});

// DELETE /api/contacts/:id/images/:imageId - Delete image
app.delete("/:id/images/:imageId", async (c) => {
  const userId = c.get("userId");
  const contactId = c.req.param("id");
  const imageId = c.req.param("imageId");

  try {
    // Verify ownership
    const [existing] = await db
      .select({ userId: contacts.userId })
      .from(contacts)
      .where(eq(contacts.id, contactId));

    if (!existing || existing.userId !== userId) {
      return c.json({ error: "Contact not found" }, 404);
    }

    await db.delete(contactImages).where(eq(contactImages.id, imageId));

    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting image:", error);
    return c.json({ error: "Failed to delete image" }, 500);
  }
});

// Fuzzy search helper for internal use (e.g., assistant)
app.get("/search/fuzzy", async (c) => {
  const userId = c.get("userId");
  const name = c.req.query("name") || "";
  const limit = parseInt(c.req.query("limit") || "10");

  if (!name) {
    return c.json({ contacts: [] });
  }

  try {
    const results = await db.execute(sql`
      SELECT
        id,
        "displayName",
        GREATEST(
          similarity("displayName", ${name}),
          word_similarity(${name}, "displayName")
        ) as similarity
      FROM contacts
      WHERE
        "userId" = ${userId}
        AND (
          similarity("displayName", ${name}) > 0.3
          OR word_similarity(${name}, "displayName") > 0.3
        )
      ORDER BY similarity DESC
      LIMIT ${limit}
    `);

    return c.json({ contacts: results.rows || results });
  } catch (error) {
    console.error("Error in fuzzy search:", error);
    // Fallback to ILIKE
    const contacts_result = await db
      .select({ id: contacts.id, displayName: contacts.displayName })
      .from(contacts)
      .where(
        and(
          eq(contacts.userId, userId),
          ilike(contacts.displayName, `%${name}%`)
        )
      )
      .limit(limit);

    return c.json({ contacts: contacts_result });
  }
});

export default app;
