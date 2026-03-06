import { z } from "zod";
import { tool } from "ai";
import { eq, and, desc, sql, ilike, asc, or, inArray } from "drizzle-orm";
import {
  db,
  contacts,
  tags,
  contactTags,
  contactImages,
  socialLinks,
  relationships,
  relationshipTypes,
  conversationParticipants,
  eventParticipants,
  reminderParticipants,
  conversations,
  events,
  reminders,
} from "../../../db";
import type { ToolResult } from "../types";
import { PAGE_SIZE } from "../types";
import { assertValidGender } from "../enums";
import { getOwnedContact } from "../ownership";
import { findBestContactMatch, resolveContactId } from "../db-helpers";
import { enrichConversations, enrichEvents, enrichReminders } from "../enrichment";
import { CONFIRMATION_TOKENS } from "../guardrails";

// ── Implementation functions ─────────────────────────────────────────

export async function createContact(
  userId: string,
  displayName: string,
  primaryPhone?: string,
  primaryEmail?: string,
  dateOfBirth?: string,
  gender?: string,
  company?: string,
  jobTitle?: string,
  location?: string,
  notes?: string,
  tagIds?: string[],
  assistantConversationId?: string
): Promise<ToolResult> {
  const [contact] = await db
    .insert(contacts)
    .values({
      displayName,
      primaryPhone: primaryPhone || null,
      primaryEmail: primaryEmail || null,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      gender: gender ? assertValidGender(gender) : null,
      company: company || null,
      jobTitle: jobTitle || null,
      location: location || null,
      notes: notes || null,
      userId,
      assistantConversationId: assistantConversationId || null,
    })
    .returning();

  if (!contact) {
    return { type: "error", message: "Failed to create contact" };
  }

  if (tagIds && tagIds.length > 0) {
    await db.insert(contactTags).values(
      tagIds.map((tagId) => ({
        contactId: contact.id,
        tagId,
      }))
    );
  }

  return {
    type: "contact_created",
    id: contact.id,
    displayName: contact.displayName,
    primaryPhone: contact.primaryPhone,
    primaryEmail: contact.primaryEmail,
    company: contact.company,
    jobTitle: contact.jobTitle,
    location: contact.location,
  };
}

export async function updateContact(
  userId: string,
  contactName: string,
  primaryPhone?: string,
  primaryEmail?: string,
  dateOfBirth?: string,
  gender?: string,
  company?: string,
  jobTitle?: string,
  location?: string,
  notes?: string,
  tagIds?: string[]
): Promise<ToolResult> {
  const contact = await findBestContactMatch(userId, contactName);

  if (!contact) {
    return {
      type: "error",
      message: `Could not find a contact named: ${contactName}`,
    };
  }

  return updateContactById(
    userId,
    contact.id,
    {
      primaryPhone,
      primaryEmail,
      dateOfBirth,
      gender,
      company,
      jobTitle,
      location,
      notes,
      tagIds,
    },
    contactName
  );
}

export async function updateContactById(
  userId: string,
  contactId: string,
  updates: {
    displayName?: string;
    primaryPhone?: string;
    primaryEmail?: string;
    dateOfBirth?: string;
    gender?: string;
    company?: string;
    jobTitle?: string;
    location?: string;
    notes?: string;
    tagIds?: string[];
  },
  fallbackName?: string
): Promise<ToolResult> {
  const existing = await getOwnedContact(userId, contactId);

  if (!existing) {
    return {
      type: "error",
      message: `Could not find contact${fallbackName ? ` named: ${fallbackName}` : ""}`,
    };
  }

  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (updates.displayName !== undefined) updateData.displayName = updates.displayName;
  if (updates.primaryPhone !== undefined)
    updateData.primaryPhone = updates.primaryPhone || null;
  if (updates.primaryEmail !== undefined)
    updateData.primaryEmail = updates.primaryEmail || null;
  if (updates.dateOfBirth !== undefined)
    updateData.dateOfBirth = updates.dateOfBirth ? new Date(updates.dateOfBirth) : null;
  if (updates.gender !== undefined) updateData.gender = updates.gender || null;
  if (updates.company !== undefined) updateData.company = updates.company || null;
  if (updates.jobTitle !== undefined) updateData.jobTitle = updates.jobTitle || null;
  if (updates.location !== undefined) updateData.location = updates.location || null;
  if (updates.notes !== undefined) updateData.notes = updates.notes || null;

  const [updatedContact] = await db
    .update(contacts)
    .set(updateData)
    .where(and(eq(contacts.id, contactId), eq(contacts.userId, userId)))
    .returning({ id: contacts.id, displayName: contacts.displayName });

  if (!updatedContact) {
    return {
      type: "error",
      message: `Could not update contact${fallbackName ? ` named: ${fallbackName}` : ""}`,
    };
  }

  if (updates.tagIds !== undefined) {
    await db.delete(contactTags).where(eq(contactTags.contactId, contactId));
    if (updates.tagIds.length > 0) {
      await db.insert(contactTags).values(
        updates.tagIds.map((tagId) => ({
          contactId,
          tagId,
        }))
      );
    }
  }

  return {
    type: "contact_updated",
    id: updatedContact.id,
    displayName: updatedContact.displayName,
  };
}

export async function getContactDetails(
  userId: string,
  contactName?: string,
  contactId?: string
): Promise<ToolResult> {
  const resolvedId = await resolveContactId(userId, contactId, contactName);

  if (!resolvedId) {
    return {
      type: "error",
      message: contactId
        ? `Could not find contact with id: ${contactId}`
        : `Could not find a contact named: ${contactName}`,
    };
  }

  const [fullContact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, resolvedId), eq(contacts.userId, userId)));

  if (!fullContact) {
    return {
      type: "error",
      message: contactId
        ? `Could not find contact with id: ${contactId}`
        : `Could not find a contact named: ${contactName}`,
    };
  }

  // Get tags
  const contactTagsList = await db
    .select()
    .from(contactTags)
    .innerJoin(tags, eq(contactTags.tagId, tags.id))
    .where(eq(contactTags.contactId, resolvedId));

  // Get relationships (with userId filter on joined contacts for defense-in-depth)
  const relationshipsFrom = await db
    .select()
    .from(relationships)
    .innerJoin(contacts, and(eq(relationships.toContactId, contacts.id), eq(contacts.userId, userId)))
    .innerJoin(relationshipTypes, eq(relationships.typeId, relationshipTypes.id))
    .where(eq(relationships.fromContactId, resolvedId));

  const relationshipsTo = await db
    .select()
    .from(relationships)
    .innerJoin(contacts, and(eq(relationships.fromContactId, contacts.id), eq(contacts.userId, userId)))
    .innerJoin(relationshipTypes, eq(relationships.typeId, relationshipTypes.id))
    .where(eq(relationships.toContactId, resolvedId));

  const [images, links] = await Promise.all([
    db
      .select()
      .from(contactImages)
      .where(eq(contactImages.contactId, resolvedId))
      .orderBy(asc(contactImages.order)),
    db
      .select()
      .from(socialLinks)
      .where(eq(socialLinks.contactId, resolvedId)),
  ]);

  return {
    type: "contact_details",
    id: fullContact.id,
    displayName: fullContact.displayName,
    primaryPhone: fullContact.primaryPhone,
    primaryEmail: fullContact.primaryEmail,
    company: fullContact.company,
    jobTitle: fullContact.jobTitle,
    location: fullContact.location,
    notes: fullContact.notes,
    dateOfBirth: fullContact.dateOfBirth,
    tags: contactTagsList.map((t: any) => t.tags.name),
    images,
    socialLinks: links,
    relationships: [
      ...relationshipsFrom.map((r: any) => ({
        type: r.relationship_types.name,
        contact: r.contacts.displayName,
      })),
      ...relationshipsTo.map((r: any) => ({
        type: r.relationship_types.name,
        contact: r.contacts.displayName,
      })),
    ],
  };
}

export async function queryContacts(
  userId: string,
  searchTerm?: string,
  limit?: number
): Promise<ToolResult> {
  const takeLimit = Math.min(limit || 10, 50);

  if (searchTerm) {
    try {
      const rows = await db
        .select({
          id: contacts.id,
          displayName: contacts.displayName,
          company: contacts.company,
          primaryEmail: contacts.primaryEmail,
          primaryPhone: contacts.primaryPhone,
          jobTitle: contacts.jobTitle,
          location: contacts.location,
        })
        .from(contacts)
        .where(
          and(
            eq(contacts.userId, userId),
            or(
              sql`similarity(${contacts.displayName}, ${searchTerm}) > 0.3`,
              ilike(contacts.displayName, `%${searchTerm}%`),
              ilike(contacts.company, `%${searchTerm}%`)
            )!
          )
        )
        .orderBy(desc(sql`similarity(${contacts.displayName}, ${searchTerm})`))
        .limit(takeLimit);

      return {
        type: "contacts_found",
        count: rows.length,
        contacts: rows,
      };
    } catch {
      // Fallback without trigram
      const contactsList = await db
        .select({
          id: contacts.id,
          displayName: contacts.displayName,
          company: contacts.company,
          primaryEmail: contacts.primaryEmail,
          primaryPhone: contacts.primaryPhone,
          jobTitle: contacts.jobTitle,
          location: contacts.location,
        })
        .from(contacts)
        .where(
          and(
            eq(contacts.userId, userId),
            ilike(contacts.displayName, `%${searchTerm}%`)
          )
        )
        .limit(takeLimit);

      return {
        type: "contacts_found",
        count: contactsList.length,
        contacts: contactsList,
      };
    }
  }

  // No search term - return all contacts
  const contactsList = await db
    .select({
      id: contacts.id,
      displayName: contacts.displayName,
      company: contacts.company,
      primaryEmail: contacts.primaryEmail,
      primaryPhone: contacts.primaryPhone,
      jobTitle: contacts.jobTitle,
      location: contacts.location,
    })
    .from(contacts)
    .where(eq(contacts.userId, userId))
    .orderBy(contacts.displayName)
    .limit(takeLimit);

  return {
    type: "contacts_found",
    count: contactsList.length,
    contacts: contactsList,
  };
}

export async function listContacts(
  userId: string,
  cursor?: string,
  search?: string,
  limit?: number
): Promise<ToolResult> {
  const takeLimit = limit || PAGE_SIZE;
  let contactsList: any;

  if (search) {
    try {
      const similarityExpr = sql<number>`
        GREATEST(
          similarity(${contacts.displayName}, ${search}),
          word_similarity(${search}, ${contacts.displayName}),
          COALESCE(similarity(${contacts.company}, ${search}), 0),
          COALESCE(word_similarity(${search}, ${contacts.company}), 0)
        )
      `;
      contactsList = await db
        .select({
          id: contacts.id,
          userId: contacts.userId,
          displayName: contacts.displayName,
          googleContactName: contacts.googleContactName,
          primaryPhone: contacts.primaryPhone,
          primaryEmail: contacts.primaryEmail,
          dateOfBirth: contacts.dateOfBirth,
          gender: contacts.gender,
          company: contacts.company,
          jobTitle: contacts.jobTitle,
          location: contacts.location,
          notes: contacts.notes,
          createdAt: contacts.createdAt,
          updatedAt: contacts.updatedAt,
          similarity: similarityExpr,
        })
        .from(contacts)
        .where(
          and(
            eq(contacts.userId, userId),
            or(
              sql`similarity(${contacts.displayName}, ${search}) > 0.3`,
              sql`word_similarity(${search}, ${contacts.displayName}) > 0.3`,
              sql`similarity(${contacts.company}, ${search}) > 0.3`,
              sql`word_similarity(${search}, ${contacts.company}) > 0.3`,
              ilike(contacts.displayName, `%${search}%`),
              ilike(contacts.company, `%${search}%`)
            )!
          )
        )
        .orderBy(desc(similarityExpr))
        .limit(takeLimit + 1);
    } catch {
      contactsList = await db
        .select()
        .from(contacts)
        .where(
          and(
            eq(contacts.userId, userId),
            or(
              ilike(contacts.displayName, `%${search}%`),
              ilike(contacts.company, `%${search}%`)
            )!
          )
        )
        .orderBy(asc(contacts.displayName))
        .limit(takeLimit + 1);
    }
  } else if (cursor) {
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
      .limit(takeLimit + 1);
  } else {
    contactsList = await db
      .select()
      .from(contacts)
      .where(eq(contacts.userId, userId))
      .orderBy(asc(contacts.displayName))
      .limit(takeLimit + 1);
  }

  const results = contactsList;
  let nextCursor: string | null = null;

  if (results.length > takeLimit) {
    const nextItem = results.pop();
    nextCursor = nextItem?.id || null;
  }

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
            and(inArray(contactImages.contactId, contactIds), eq(contactImages.order, 0))
          )
      : [],
  ]);

  const enrichedContacts = results.map((contact: any) => ({
    ...contact,
    tags: contactTagsData
      .filter((ct: any) => ct.contact_tags.contactId === contact.id)
      .map((ct: any) => ct.tags),
    images: contactImagesData.filter((img: any) => img.contactId === contact.id),
  }));

  let stats = null;
  if (!cursor && !search) {
    const [totalResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(contacts)
      .where(eq(contacts.userId, userId));

    stats = { totalCount: Number(totalResult?.count || 0) };
  }

  return {
    type: "contacts_found",
    count: enrichedContacts.length,
    contacts: enrichedContacts,
    nextCursor,
    stats,
  };
}

export async function getContactById(userId: string, contactId: string): Promise<ToolResult> {
  const contact = await getOwnedContact(userId, contactId);

  if (!contact) {
    return { type: "error", message: "Contact not found" };
  }

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
    db.select().from(socialLinks).where(eq(socialLinks.contactId, contactId)),
  ]);

  return {
    type: "contact_details",
    ...contact,
    tags: contactTagsData.map((ct) => ct.tags),
    images,
    socialLinks: links,
  };
}

export async function deleteContactById(userId: string, contactId: string): Promise<ToolResult> {
  const existing = await getOwnedContact(userId, contactId);

  if (!existing) {
    return { type: "error", message: "Contact not found" };
  }

  await db.delete(contacts).where(eq(contacts.id, contactId));

  return { type: "contact_deleted", id: contactId };
}

export async function addContactImage(
  userId: string,
  contactId: string,
  imageUrl: string,
  publicId?: string
): Promise<ToolResult> {
  const existing = await getOwnedContact(userId, contactId);

  if (!existing) {
    return { type: "error", message: "Contact not found" };
  }

  const [maxOrder] = await db
    .select({ maxOrder: sql<number>`COALESCE(MAX("order"), -1)` })
    .from(contactImages)
    .where(eq(contactImages.contactId, contactId));

  const [newImage] = await db
    .insert(contactImages)
    .values({
      contactId,
      imageUrl,
      publicId: publicId || null,
      order: (maxOrder?.maxOrder || 0) + 1,
    })
    .returning();

  return { type: "contact_image_added", image: newImage };
}

export async function deleteContactImage(
  userId: string,
  contactId: string,
  imageId: string
): Promise<ToolResult> {
  const existing = await getOwnedContact(userId, contactId);

  if (!existing) {
    return { type: "error", message: "Contact not found" };
  }

  await db.delete(contactImages).where(eq(contactImages.id, imageId));
  return { type: "contact_image_deleted", id: imageId };
}

export async function searchContactsFuzzy(
  userId: string,
  name: string,
  limit?: number
): Promise<ToolResult> {
  const takeLimit = limit || 5;
  if (!name) {
    return { type: "contacts_found", count: 0, contacts: [] };
  }

  try {
    const similarityExpr = sql<number>`
      GREATEST(
        similarity(${contacts.displayName}, ${name}),
        word_similarity(${name}, ${contacts.displayName})
      )
    `;
    const rows = await db
      .select({
        id: contacts.id,
        displayName: contacts.displayName,
        similarity: similarityExpr,
      })
      .from(contacts)
      .where(
        and(
          eq(contacts.userId, userId),
          or(
            sql`similarity(${contacts.displayName}, ${name}) > 0.3`,
            sql`word_similarity(${name}, ${contacts.displayName}) > 0.3`
          )!
        )
      )
      .orderBy(desc(similarityExpr))
      .limit(takeLimit);

    return {
      type: "contacts_found",
      count: rows.length,
      contacts: rows,
      bestMatchSimilarity: rows.length > 0 ? Number(rows[0]!.similarity) : 0,
      exactMatchFound: rows.some(
        (r) => r.displayName.toLowerCase().trim() === name.toLowerCase().trim()
      ),
    };
  } catch {
    const contactsResult = await db
      .select({ id: contacts.id, displayName: contacts.displayName })
      .from(contacts)
      .where(
        and(eq(contacts.userId, userId), ilike(contacts.displayName, `%${name}%`))
      )
      .limit(takeLimit);

    return {
      type: "contacts_found",
      count: contactsResult.length,
      contacts: contactsResult,
      bestMatchSimilarity: 0,
      exactMatchFound: contactsResult.some(
        (r) => r.displayName.toLowerCase().trim() === name.toLowerCase().trim()
      ),
    };
  }
}

export async function searchContactsByPhone(
  userId: string,
  phone: string,
  include?: string[],
  conversationsLimit?: number,
  eventsLimit?: number,
  remindersLimit?: number
): Promise<ToolResult> {
  const includeList =
    include?.map((v) => v.trim()).filter((v) => v.length > 0) || [];
  const normalized = phone.replace(/\D/g, "");

  if (!phone || normalized.length < 3) {
    return { type: "error", message: "phone query param is required" };
  }

  const normalizedLike = `%${normalized}%`;
  const normalizedPhoneExpr = sql`regexp_replace(${contacts.primaryPhone}, '\\D', '', 'g')`;
  const candidates = await db
    .select()
    .from(contacts)
    .where(
      and(
        eq(contacts.userId, userId),
        or(
          ilike(contacts.primaryPhone, `%${phone}%`),
          sql`${normalizedPhoneExpr} = ${normalized}`,
          sql`${normalizedPhoneExpr} LIKE ${normalizedLike}`
        )!
      )
    )
    .orderBy(
      sql`
        CASE
          WHEN ${normalizedPhoneExpr} = ${normalized} THEN 0
          WHEN ${normalizedPhoneExpr} LIKE ${normalizedLike} THEN 1
          ELSE 2
        END
      `,
      sql`length(${contacts.primaryPhone}) ASC`
    )
    .limit(5);

  const contact = candidates.length > 0 ? candidates[0] : null;

  if (!contact) {
    return { type: "contact_phone_search", contact: null, candidates: [] };
  }

  const response: any = { type: "contact_phone_search", contact, candidates };

  if (includeList.includes("conversations")) {
    const convIdsResult = await db
      .select({ conversationId: conversationParticipants.conversationId })
      .from(conversationParticipants)
      .where(eq(conversationParticipants.contactId, contact.id));

    const convIds = convIdsResult.map((r) => r.conversationId);

    if (convIds.length === 0) {
      response.conversations = [];
    } else {
      const conversationsList = await db
        .select()
        .from(conversations)
        .where(and(eq(conversations.userId, userId), inArray(conversations.id, convIds)))
        .orderBy(desc(conversations.happenedAt))
        .limit(conversationsLimit || 10);

      response.conversations = await enrichConversations(conversationsList);
    }
  }

  if (includeList.includes("events")) {
    const eventIdsResult = await db
      .select({ eventId: eventParticipants.eventId })
      .from(eventParticipants)
      .where(eq(eventParticipants.contactId, contact.id));

    const eventIds = eventIdsResult.map((r) => r.eventId);

    if (eventIds.length === 0) {
      response.events = [];
    } else {
      const eventsList = await db
        .select()
        .from(events)
        .where(and(eq(events.userId, userId), inArray(events.id, eventIds)))
        .orderBy(desc(events.startAt))
        .limit(eventsLimit || 10);

      response.events = await enrichEvents(eventsList);
    }
  }

  if (includeList.includes("reminders")) {
    const reminderIdsResult = await db
      .select({ reminderId: reminderParticipants.reminderId })
      .from(reminderParticipants)
      .where(eq(reminderParticipants.contactId, contact.id));

    const reminderIds = reminderIdsResult.map((r) => r.reminderId);

    if (reminderIds.length === 0) {
      response.reminders = [];
    } else {
      const remindersList = await db
        .select()
        .from(reminders)
        .where(
          and(
            eq(reminders.userId, userId),
            eq(reminders.status, "OPEN"),
            inArray(reminders.id, reminderIds)
          )
        )
        .orderBy(asc(reminders.dueAt))
        .limit(remindersLimit || 10);

      response.reminders = await enrichReminders(remindersList);
    }
  }

  return response;
}

export async function listContactConversations(
  userId: string,
  contactId: string,
  cursor?: string,
  search?: string,
  medium?: string,
  limit?: number
): Promise<ToolResult> {
  const contact = await getOwnedContact(userId, contactId);
  if (!contact) return { type: "error", message: "Contact not found" };

  const convIdsResult = await db
    .select({ conversationId: conversationParticipants.conversationId })
    .from(conversationParticipants)
    .where(eq(conversationParticipants.contactId, contactId));

  const convIds = convIdsResult.map((r) => r.conversationId);
  if (convIds.length === 0) {
    return { type: "conversations_found", count: 0, conversations: [], nextCursor: null };
  }

  const { assertValidMedium } = await import("../enums");
  const conditions = [
    eq(conversations.userId, userId),
    inArray(conversations.id, convIds),
  ];

  if (medium) {
    conditions.push(eq(conversations.medium, assertValidMedium(medium)));
  }

  if (search) {
    conditions.push(ilike(conversations.content, `%${search}%`));
  }

  const takeLimit = limit || PAGE_SIZE;
  let conversationsList;
  if (cursor) {
    conversationsList = await db
      .select()
      .from(conversations)
      .where(
        and(
          ...conditions,
          sql`${conversations.happenedAt} < (SELECT "happenedAt" FROM conversations WHERE id = ${cursor})`
        )
      )
      .orderBy(desc(conversations.happenedAt))
      .limit(takeLimit + 1);
  } else {
    conversationsList = await db
      .select()
      .from(conversations)
      .where(and(...conditions))
      .orderBy(desc(conversations.happenedAt))
      .limit(takeLimit + 1);
  }

  let nextCursor: string | null = null;
  if (conversationsList.length > takeLimit) {
    const nextItem = conversationsList.pop();
    nextCursor = nextItem?.id || null;
  }

  const enrichedConversations = await enrichConversations(conversationsList);

  return {
    type: "conversations_found",
    count: enrichedConversations.length,
    conversations: enrichedConversations,
    nextCursor,
  };
}

export async function listContactEvents(
  userId: string,
  contactId: string,
  cursor?: string,
  search?: string,
  eventType?: string,
  limit?: number
): Promise<ToolResult> {
  const contact = await getOwnedContact(userId, contactId);
  if (!contact) return { type: "error", message: "Contact not found" };

  const eventIdsResult = await db
    .select({ eventId: eventParticipants.eventId })
    .from(eventParticipants)
    .where(eq(eventParticipants.contactId, contactId));

  const eventIds = eventIdsResult.map((r) => r.eventId);
  if (eventIds.length === 0) {
    return { type: "events_found", count: 0, events: [], nextCursor: null };
  }

  const { assertValidEventType } = await import("../enums");
  const conditions = [eq(events.userId, userId), inArray(events.id, eventIds)];

  if (eventType) {
    conditions.push(eq(events.eventType, assertValidEventType(eventType)));
  }

  if (search) {
    conditions.push(
      or(
        ilike(events.title, `%${search}%`),
        ilike(events.description, `%${search}%`),
        ilike(events.location, `%${search}%`)
      )!
    );
  }

  const takeLimit = limit || PAGE_SIZE;
  let eventsList;
  if (cursor) {
    eventsList = await db
      .select()
      .from(events)
      .where(
        and(
          ...conditions,
          sql`${events.startAt} < (SELECT "startAt" FROM events WHERE id = ${cursor})`
        )
      )
      .orderBy(desc(events.startAt))
      .limit(takeLimit + 1);
  } else {
    eventsList = await db
      .select()
      .from(events)
      .where(and(...conditions))
      .orderBy(desc(events.startAt))
      .limit(takeLimit + 1);
  }

  let nextCursor: string | null = null;
  if (eventsList.length > takeLimit) {
    const nextItem = eventsList.pop();
    nextCursor = nextItem?.id || null;
  }

  const enrichedEvents = await enrichEvents(eventsList);

  return {
    type: "events_found",
    count: enrichedEvents.length,
    events: enrichedEvents,
    nextCursor,
  };
}

// ── Tool definitions ─────────────────────────────────────────────────

export type EnumSchemas = {
  mediumSchema: any;
  optionalMediumSchema: any;
  eventTypeSchema: any;
  optionalEventTypeSchema: any;
};

export function createContactTools(userId: string, schemas: EnumSchemas, assistantConversationId?: string) {
  return {
    create_contact: tool({
      description: "Create a new contact with their details",
      inputSchema: z.object({
        displayName: z.string().describe("The contact's full name"),
        primaryPhone: z.string().optional().describe("Phone number"),
        primaryEmail: z.string().optional().describe("Email address"),
        dateOfBirth: z.string().optional().describe("Date of birth in ISO format"),
        gender: z.enum(["MALE", "FEMALE"]).optional().describe("Gender"),
        company: z.string().optional().describe("Company or organization"),
        jobTitle: z.string().optional().describe("Job title or role"),
        location: z.string().optional().describe("City, country, or address"),
        notes: z.string().optional().describe("Any notes about the contact"),
        tagIds: z.array(z.string()).optional().describe("Tag IDs to apply to the contact"),
      }),
      execute: async ({
        displayName,
        primaryPhone,
        primaryEmail,
        dateOfBirth,
        gender,
        company,
        jobTitle,
        location,
        notes,
        tagIds,
      }) => {
        if (CONFIRMATION_TOKENS.has(displayName.trim().toLowerCase().replace(/[.!?]+$/, ""))) {
          return {
            type: "error",
            message: `"${displayName}" is not a valid contact name — it looks like a confirmation phrase. Use the actual contact name from the earlier conversation.`,
          };
        }
        return createContact(
          userId,
          displayName,
          primaryPhone,
          primaryEmail,
          dateOfBirth,
          gender,
          company,
          jobTitle,
          location,
          notes,
          tagIds,
          assistantConversationId
        );
      },
    }),

    update_contact: tool({
      description: "Update an existing contact's information including phone number, email, etc.",
      inputSchema: z.object({
        contactName: z.string().describe("Name of the contact to update"),
        primaryPhone: z.string().optional().describe("New phone number"),
        primaryEmail: z.string().optional().describe("New email address"),
        dateOfBirth: z.string().optional().describe("New date of birth in ISO format"),
        gender: z.enum(["MALE", "FEMALE"]).optional().describe("New gender"),
        company: z.string().optional().describe("New company or organization"),
        jobTitle: z.string().optional().describe("New job title or role"),
        location: z.string().optional().describe("New city, country, or address"),
        notes: z.string().optional().describe("New notes about the contact"),
        tagIds: z.array(z.string()).optional().describe("Replace tags with these tag IDs"),
      }),
      execute: async ({
        contactName,
        primaryPhone,
        primaryEmail,
        dateOfBirth,
        gender,
        company,
        jobTitle,
        location,
        notes,
        tagIds,
      }) =>
        updateContact(
          userId,
          contactName,
          primaryPhone,
          primaryEmail,
          dateOfBirth,
          gender,
          company,
          jobTitle,
          location,
          notes,
          tagIds
        ),
    }),

    query_contacts: tool({
      description: "Search and retrieve contacts by name, company, or other attributes using fuzzy matching",
      inputSchema: z.object({
        searchTerm: z.string().optional().describe("Name, company, or other term to search for"),
        limit: z.number().optional().describe("Number of results to return, defaults to 10"),
      }),
      execute: async ({ searchTerm, limit }) => queryContacts(userId, searchTerm, limit),
    }),

    get_contact_details: tool({
      description: "Get full details of a specific contact including phone number, email, and all other information",
      inputSchema: z.object({
        contactName: z.string().describe("Name of the contact to look up"),
      }),
      execute: async ({ contactName }) => getContactDetails(userId, contactName),
    }),

    list_contacts: tool({
      description: "List contacts with optional pagination and search",
      inputSchema: z.object({
        cursor: z.string().optional().describe("Pagination cursor (contact id)"),
        search: z.string().optional().describe("Search term"),
        limit: z.number().optional().describe("Number of results to return"),
      }),
      execute: async ({ cursor, search, limit }) =>
        listContacts(userId, cursor, search, limit),
    }),

    get_contact: tool({
      description: "Get a single contact by id",
      inputSchema: z.object({
        contactId: z.string().describe("Contact id"),
      }),
      execute: async ({ contactId }) => getContactById(userId, contactId),
    }),

    update_contact_by_id: tool({
      description: "Update a contact by id",
      inputSchema: z.object({
        contactId: z.string().describe("Contact id"),
        displayName: z.string().optional().describe("New display name"),
        primaryPhone: z.string().optional().describe("New phone number"),
        primaryEmail: z.string().optional().describe("New email address"),
        dateOfBirth: z.string().optional().describe("New date of birth in ISO format"),
        gender: z.enum(["MALE", "FEMALE"]).optional().describe("New gender"),
        company: z.string().optional().describe("New company or organization"),
        jobTitle: z.string().optional().describe("New job title or role"),
        location: z.string().optional().describe("New city, country, or address"),
        notes: z.string().optional().describe("New notes about the contact"),
        tagIds: z.array(z.string()).optional().describe("Replace tags with these tag IDs"),
      }),
      execute: async ({
        contactId,
        displayName,
        primaryPhone,
        primaryEmail,
        dateOfBirth,
        gender,
        company,
        jobTitle,
        location,
        notes,
        tagIds,
      }) =>
        updateContactById(userId, contactId, {
          displayName,
          primaryPhone,
          primaryEmail,
          dateOfBirth,
          gender,
          company,
          jobTitle,
          location,
          notes,
          tagIds,
        }),
    }),

    add_contact_image: tool({
      description: "Add a contact image",
      inputSchema: z.object({
        contactId: z.string().describe("Contact id"),
        imageUrl: z.string().describe("Image URL"),
        publicId: z.string().optional().describe("Optional public id"),
      }),
      execute: async ({ contactId, imageUrl, publicId }) =>
        addContactImage(userId, contactId, imageUrl, publicId),
    }),

    search_contacts_fuzzy: tool({
      description: "Fuzzy search contacts by name",
      inputSchema: z.object({
        name: z.string().describe("Name to search for"),
        limit: z.number().optional().describe("Number of results to return"),
      }),
      execute: async ({ name, limit }) => searchContactsFuzzy(userId, name, limit),
    }),

    search_contacts_by_phone: tool({
      description: "Search contacts by phone number, optionally including conversations, events, or reminders",
      inputSchema: z.object({
        phone: z.string().describe("Phone number to search"),
        include: z
          .array(z.enum(["conversations", "events", "reminders"]))
          .optional()
          .describe("Include related conversations, events, and/or reminders"),
        conversationsLimit: z.number().optional().describe("Limit for conversations"),
        eventsLimit: z.number().optional().describe("Limit for events"),
        remindersLimit: z.number().optional().describe("Limit for reminders"),
      }),
      execute: async ({ phone, include, conversationsLimit, eventsLimit, remindersLimit }) =>
        searchContactsByPhone(
          userId,
          phone,
          include,
          conversationsLimit,
          eventsLimit,
          remindersLimit
        ),
    }),

    list_contact_conversations: tool({
      description: "List conversations for a contact",
      inputSchema: z.object({
        contactId: z.string().describe("Contact id"),
        cursor: z.string().optional().describe("Pagination cursor (conversation id)"),
        search: z.string().optional().describe("Search term"),
        medium: schemas.optionalMediumSchema.describe("Conversation medium"),
        limit: z.number().optional().describe("Number of results to return"),
      }),
      execute: async ({ contactId, cursor, search, medium, limit }) =>
        listContactConversations(userId, contactId, cursor, search, medium, limit),
    }),

    list_contact_events: tool({
      description: "List events for a contact",
      inputSchema: z.object({
        contactId: z.string().describe("Contact id"),
        cursor: z.string().optional().describe("Pagination cursor (event id)"),
        search: z.string().optional().describe("Search term"),
        eventType: schemas.optionalEventTypeSchema.describe("Event type"),
        limit: z.number().optional().describe("Number of results to return"),
      }),
      execute: async ({ contactId, cursor, search, eventType, limit }) =>
        listContactEvents(userId, contactId, cursor, search, eventType, limit),
    }),

    searchContacts: tool({
      description: "Search contacts for context resolution by name or free text",
      inputSchema: z.object({
        query: z.string().describe("Search text"),
        limit: z.number().optional().describe("Maximum results"),
      }),
      execute: async ({ query, limit }) => queryContacts(userId, query, limit),
    }),
  };
}
