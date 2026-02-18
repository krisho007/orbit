import { z } from "zod";
import { tool } from "ai";
import { eq, and, sql, asc, inArray } from "drizzle-orm";
import { db, tags, contactTags } from "../../../db";
import type { ToolResult } from "../types";
import { getOwnedTag } from "../ownership";

// ── Implementation functions ─────────────────────────────────────────

export async function listTags(userId: string): Promise<ToolResult> {
  const tagsList = await db
    .select()
    .from(tags)
    .where(eq(tags.userId, userId))
    .orderBy(asc(tags.name));

  const tagIds = tagsList.map((t) => t.id);
  const contactCounts =
    tagIds.length > 0
      ? await db
          .select({
            tagId: contactTags.tagId,
            count: sql<number>`count(*)`,
          })
          .from(contactTags)
          .where(inArray(contactTags.tagId, tagIds))
          .groupBy(contactTags.tagId)
      : [];

  const enrichedTags = tagsList.map((tag) => ({
    ...tag,
    _count: {
      contacts: Number(contactCounts.find((cc) => cc.tagId === tag.id)?.count || 0),
    },
  }));

  return { type: "tags_found", tags: enrichedTags };
}

export async function getTagById(userId: string, tagId: string): Promise<ToolResult> {
  const tag = await getOwnedTag(userId, tagId);
  if (!tag) return { type: "error", message: "Tag not found" };

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(contactTags)
    .where(eq(contactTags.tagId, tagId));

  return {
    type: "tag_details",
    ...tag,
    _count: { contacts: Number(countResult?.count || 0) },
  };
}

export async function createTag(
  userId: string,
  name: string,
  color?: string
): Promise<ToolResult> {
  const [existing] = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.userId, userId), eq(tags.name, name)));

  if (existing) {
    return { type: "error", message: "A tag with this name already exists" };
  }

  const [newTag] = await db
    .insert(tags)
    .values({ userId, name, color: color || "#3B82F6" })
    .returning();

  if (!newTag) {
    return { type: "error", message: "Failed to create tag" };
  }

  return { type: "tag_created", id: newTag.id, name: newTag.name, color: newTag.color };
}

export async function updateTagById(
  userId: string,
  tagId: string,
  updates: { name?: string; color?: string }
): Promise<ToolResult> {
  const tag = await getOwnedTag(userId, tagId);
  if (!tag) return { type: "error", message: "Tag not found" };

  if (updates.name) {
    const [duplicate] = await db
      .select({ id: tags.id })
      .from(tags)
      .where(
        and(
          eq(tags.userId, userId),
          eq(tags.name, updates.name),
          sql`${tags.id} != ${tagId}`
        )
      );

    if (duplicate) {
      return { type: "error", message: "A tag with this name already exists" };
    }
  }

  const updateData: any = { updatedAt: new Date() };
  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.color !== undefined) updateData.color = updates.color;

  const [updatedTag] = await db
    .update(tags)
    .set(updateData)
    .where(eq(tags.id, tagId))
    .returning();

  if (!updatedTag) {
    return { type: "error", message: "Failed to update tag" };
  }

  return { type: "tag_updated", id: updatedTag.id, name: updatedTag.name, color: updatedTag.color };
}

export async function deleteTagById(userId: string, tagId: string): Promise<ToolResult> {
  const tag = await getOwnedTag(userId, tagId);
  if (!tag) return { type: "error", message: "Tag not found" };

  await db.delete(tags).where(eq(tags.id, tagId));
  return { type: "tag_deleted", id: tagId };
}

// ── Tool definitions ─────────────────────────────────────────────────

export function createTagTools(userId: string) {
  return {
    list_tags: tool({
      description: "List all tags",
      inputSchema: z.object({}),
      execute: async () => listTags(userId),
    }),

    get_tag: tool({
      description: "Get a tag by id",
      inputSchema: z.object({
        tagId: z.string().describe("Tag id"),
      }),
      execute: async ({ tagId }) => getTagById(userId, tagId),
    }),

    create_tag: tool({
      description: "Create a tag",
      inputSchema: z.object({
        name: z.string().describe("Tag name"),
        color: z
          .string()
          .regex(/^#[0-9A-Fa-f]{6}$/)
          .optional()
          .describe("Hex color"),
      }),
      execute: async ({ name, color }) => createTag(userId, name, color),
    }),

    update_tag: tool({
      description: "Update a tag by id",
      inputSchema: z.object({
        tagId: z.string().describe("Tag id"),
        name: z.string().optional().describe("New tag name"),
        color: z
          .string()
          .regex(/^#[0-9A-Fa-f]{6}$/)
          .optional()
          .describe("New hex color"),
      }),
      execute: async ({ tagId, name, color }) =>
        updateTagById(userId, tagId, { name, color }),
    }),
  };
}
