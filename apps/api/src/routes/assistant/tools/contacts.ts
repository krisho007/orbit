import { z } from "zod";
import { tool } from "ai";
import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import {
  db,
  contacts,
  contactImages,
  contactTags,
  socialLinks,
  tags,
} from "../../../db";
import { getOwnedContact } from "../ownership";
import { ensurePgTrgmExtension } from "../db-helpers";

type Ctx = { userId: string };

const genderSchema = z.enum(["MALE", "FEMALE"]).optional();

async function doSearchContacts(userId: string, query: string, limit: number) {
  await ensurePgTrgmExtension();
  const normalized = query.replace(/\D/g, "");
  const likePattern = `%${query}%`;
  try {
    const similarity = sql<number>`GREATEST(
      similarity(${contacts.displayName}, ${query}),
      word_similarity(${query}, ${contacts.displayName}),
      COALESCE(similarity(${contacts.company}, ${query}), 0)
    )`;
    const phoneClauses = normalized.length >= 3
      ? [
          ilike(contacts.primaryPhone, `%${query}%`),
          sql`regexp_replace(${contacts.primaryPhone}, '\\D', '', 'g') LIKE ${"%" + normalized + "%"}`,
        ]
      : [];
    const rows = await db
      .select({
        id: contacts.id,
        displayName: contacts.displayName,
        primaryPhone: contacts.primaryPhone,
        primaryEmail: contacts.primaryEmail,
        company: contacts.company,
        jobTitle: contacts.jobTitle,
      })
      .from(contacts)
      .where(
        and(
          eq(contacts.userId, userId),
          or(
            sql`similarity(${contacts.displayName}, ${query}) > 0.3`,
            sql`word_similarity(${query}, ${contacts.displayName}) > 0.3`,
            ilike(contacts.displayName, likePattern),
            ilike(contacts.company, likePattern),
            ...phoneClauses
          )!
        )
      )
      .orderBy(desc(similarity))
      .limit(limit);
    return rows;
  } catch {
    return db
      .select({
        id: contacts.id,
        displayName: contacts.displayName,
        primaryPhone: contacts.primaryPhone,
        primaryEmail: contacts.primaryEmail,
        company: contacts.company,
        jobTitle: contacts.jobTitle,
      })
      .from(contacts)
      .where(and(eq(contacts.userId, userId), ilike(contacts.displayName, likePattern)))
      .limit(limit);
  }
}

export function contactTools({ userId }: Ctx) {
  return {
    search_contacts: tool({
      description:
        "Fuzzy-search the user's contacts by name, company, or phone digits. Returns up to `limit` candidates. Prefer this over get_contact when you don't have the id.",
      inputSchema: z.object({
        query: z.string().min(1).describe("Name, company, or phone digits to match"),
        limit: z.number().int().min(1).max(20).default(5),
      }),
      execute: async ({ query, limit }) => {
        const rows = await doSearchContacts(userId, query, limit);
        return { count: rows.length, candidates: rows };
      },
    }),

    get_contact: tool({
      description:
        "Get a contact's full details by id, including tags, images, and social links.",
      inputSchema: z.object({ contactId: z.string().describe("Contact id") }),
      execute: async ({ contactId }) => {
        const contact = await getOwnedContact(userId, contactId);
        if (!contact) return { error: "Contact not found" };
        const [tagsRows, imagesRows, linksRows] = await Promise.all([
          db
            .select({ id: tags.id, name: tags.name, color: tags.color })
            .from(contactTags)
            .innerJoin(tags, eq(contactTags.tagId, tags.id))
            .where(eq(contactTags.contactId, contactId)),
          db
            .select()
            .from(contactImages)
            .where(eq(contactImages.contactId, contactId))
            .orderBy(asc(contactImages.order)),
          db.select().from(socialLinks).where(eq(socialLinks.contactId, contactId)),
        ]);
        return { contact, tags: tagsRows, images: imagesRows, socialLinks: linksRows };
      },
    }),

    create_contact: tool({
      description:
        "Create a new contact. Only call this when the user is clearly asking to save a contact and has provided the name. Use open_contact_create_form instead when the user would benefit from reviewing fields first.",
      inputSchema: z.object({
        displayName: z.string().min(1),
        primaryPhone: z.string().optional(),
        primaryEmail: z.string().email().optional(),
        dateOfBirth: z.string().optional().describe("ISO date"),
        gender: genderSchema,
        company: z.string().optional(),
        jobTitle: z.string().optional(),
        location: z.string().optional(),
        notes: z.string().optional(),
      }),
      execute: async (input) => {
        const [row] = await db
          .insert(contacts)
          .values({
            userId,
            displayName: input.displayName,
            primaryPhone: input.primaryPhone ?? null,
            primaryEmail: input.primaryEmail ?? null,
            dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
            gender: input.gender ?? null,
            company: input.company ?? null,
            jobTitle: input.jobTitle ?? null,
            location: input.location ?? null,
            notes: input.notes ?? null,
          })
          .returning({
            id: contacts.id,
            displayName: contacts.displayName,
            primaryPhone: contacts.primaryPhone,
            primaryEmail: contacts.primaryEmail,
            company: contacts.company,
            jobTitle: contacts.jobTitle,
            location: contacts.location,
          });
        return { contact: row };
      },
    }),

    update_contact: tool({
      description: "Update fields on a contact by id. Only provided fields are changed.",
      inputSchema: z.object({
        contactId: z.string(),
        displayName: z.string().optional(),
        primaryPhone: z.string().nullable().optional(),
        primaryEmail: z.string().email().nullable().optional(),
        dateOfBirth: z.string().nullable().optional(),
        gender: genderSchema,
        company: z.string().nullable().optional(),
        jobTitle: z.string().nullable().optional(),
        location: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      }),
      execute: async ({ contactId, ...updates }) => {
        const owned = await getOwnedContact(userId, contactId);
        if (!owned) return { error: "Contact not found" };
        const patch: Record<string, unknown> = { updatedAt: new Date() };
        for (const [k, v] of Object.entries(updates)) {
          if (v === undefined) continue;
          if (k === "dateOfBirth") patch.dateOfBirth = v ? new Date(v as string) : null;
          else patch[k] = v;
        }
        const [row] = await db
          .update(contacts)
          .set(patch)
          .where(and(eq(contacts.id, contactId), eq(contacts.userId, userId)))
          .returning({ id: contacts.id, displayName: contacts.displayName });
        return { contact: row };
      },
    }),

    delete_contact: tool({
      description: "Delete a contact by id. Cascades to their conversations, events, reminders, images, social links, and tag assignments.",
      inputSchema: z.object({ contactId: z.string() }),
      execute: async ({ contactId }) => {
        const owned = await getOwnedContact(userId, contactId);
        if (!owned) return { error: "Contact not found" };
        await db.delete(contacts).where(and(eq(contacts.id, contactId), eq(contacts.userId, userId)));
        return { ok: true, contactId };
      },
    }),

    add_contact_image: tool({
      description: "Attach an image URL to a contact.",
      inputSchema: z.object({
        contactId: z.string(),
        imageUrl: z.string().url(),
        publicId: z.string().optional(),
      }),
      execute: async ({ contactId, imageUrl, publicId }) => {
        const owned = await getOwnedContact(userId, contactId);
        if (!owned) return { error: "Contact not found" };
        const [maxRow] = await db
          .select({ maxOrder: sql<number>`COALESCE(MAX("order"), -1)` })
          .from(contactImages)
          .where(eq(contactImages.contactId, contactId));
        const [image] = await db
          .insert(contactImages)
          .values({
            contactId,
            imageUrl,
            publicId: publicId ?? null,
            order: (maxRow?.maxOrder ?? -1) + 1,
          })
          .returning();
        return { image };
      },
    }),

    remove_contact_image: tool({
      description: "Remove a contact image by its image id.",
      inputSchema: z.object({ contactId: z.string(), imageId: z.string() }),
      execute: async ({ contactId, imageId }) => {
        const owned = await getOwnedContact(userId, contactId);
        if (!owned) return { error: "Contact not found" };
        await db
          .delete(contactImages)
          .where(and(eq(contactImages.id, imageId), eq(contactImages.contactId, contactId)));
        return { ok: true, imageId };
      },
    }),

    add_social_link: tool({
      description: "Add a social link (platform + URL) to a contact.",
      inputSchema: z.object({
        contactId: z.string(),
        platform: z.string().min(1),
        url: z.string().url(),
      }),
      execute: async ({ contactId, platform, url }) => {
        const owned = await getOwnedContact(userId, contactId);
        if (!owned) return { error: "Contact not found" };
        const [link] = await db
          .insert(socialLinks)
          .values({ contactId, platform, url })
          .returning();
        return { link };
      },
    }),

    remove_social_link: tool({
      description: "Remove a social link from a contact by link id.",
      inputSchema: z.object({ contactId: z.string(), linkId: z.string() }),
      execute: async ({ contactId, linkId }) => {
        const owned = await getOwnedContact(userId, contactId);
        if (!owned) return { error: "Contact not found" };
        await db
          .delete(socialLinks)
          .where(and(eq(socialLinks.id, linkId), eq(socialLinks.contactId, contactId)));
        return { ok: true, linkId };
      },
    }),

    list_contacts: tool({
      description:
        "List the user's contacts alphabetically. Use when the user asks to see their contact list without a specific name.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(50).default(20),
      }),
      execute: async ({ limit }) => {
        const rows = await db
          .select({
            id: contacts.id,
            displayName: contacts.displayName,
            primaryPhone: contacts.primaryPhone,
            primaryEmail: contacts.primaryEmail,
            company: contacts.company,
          })
          .from(contacts)
          .where(eq(contacts.userId, userId))
          .orderBy(asc(contacts.displayName))
          .limit(limit);
        const [totalRow] = await db
          .select({ total: sql<number>`count(*)::int` })
          .from(contacts)
          .where(eq(contacts.userId, userId));
        return { count: rows.length, total: Number(totalRow?.total ?? 0), contacts: rows };
      },
    }),
  };
}
