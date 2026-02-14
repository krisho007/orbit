// Contacts API Routes
import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc, asc, sql, ilike, or, inArray } from "drizzle-orm";
import { createClient } from "@supabase/supabase-js";
import {
  db,
  contacts,
  contactTags,
  tags,
  contactImages,
  socialLinks,
  conversations,
  conversationParticipants,
  reminders,
  reminderParticipants,
  events,
  eventParticipants,
} from "../db";
import { authMiddleware } from "../middleware/auth";

const app = new Hono();

// Apply auth middleware to all routes
app.use("/*", authMiddleware);

const PAGE_SIZE = 20;

// Validation schemas
const conversationMediums = [
  "PHONE_CALL",
  "WHATSAPP",
  "EMAIL",
  "CHANCE_ENCOUNTER",
  "ONLINE_MEETING",
  "IN_PERSON_MEETING",
  "OTHER",
] as const;

const eventTypes = [
  "MEETING",
  "CALL",
  "BIRTHDAY",
  "ANNIVERSARY",
  "CONFERENCE",
  "SOCIAL",
  "FAMILY_EVENT",
  "OTHER",
] as const;

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
const addImageSchema = z.object({
  imageUrl: z.string().url(),
  publicId: z.string().optional().or(z.literal("")),
});
const uploadImageSchema = z.object({
  base64Data: z.string().min(1, "base64Data is required"),
  contentType: z
    .string()
    .regex(/^image\/[a-zA-Z0-9.+-]+$/, "contentType must be an image MIME type"),
  fileName: z.string().optional(),
});
const fetchGoogleContactsSchema = z.object({
  accessToken: z.string().min(1, "accessToken is required"),
  includePhotos: z.boolean().optional().default(true),
});
const googleImportContactSchema = z.object({
  displayName: z.string().optional(),
  primaryEmail: z.string().email().optional().or(z.literal("")),
  primaryPhone: z.string().optional(),
  company: z.string().optional(),
  jobTitle: z.string().optional(),
  location: z.string().optional(),
  notes: z.string().optional(),
  dateOfBirth: z.string().optional(),
  photoBase64: z.string().optional(),
  photoContentType: z
    .string()
    .regex(/^image\/[a-zA-Z0-9.+-]+$/, "photoContentType must be an image MIME type")
    .optional(),
});
const importGoogleContactsBatchSchema = z.object({
  contacts: z.array(googleImportContactSchema),
  overrideExisting: z.boolean().optional().default(false),
});

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "orbit";

function getStorageClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getImageExtension(contentType: string, fileName?: string): string {
  const fileNameExt = fileName?.split(".").pop()?.trim();
  const mimeExt = contentType.split("/")[1]?.split(";")[0]?.trim();
  const raw = (fileNameExt || mimeExt || "jpg").toLowerCase();
  const cleaned = raw.replace(/[^a-z0-9]/g, "");
  return cleaned || "jpg";
}

async function getContactMaxImageOrder(contactId: string) {
  const [maxOrder] = await db
    .select({ maxOrder: sql<number>`COALESCE(MAX("order"), -1)` })
    .from(contactImages)
    .where(eq(contactImages.contactId, contactId));

  return Number(maxOrder?.maxOrder ?? -1);
}

function normalizePhoneDigits(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

function normalizeName(name?: string | null): string {
  return (name || "").trim().replace(/\s+/g, " ");
}

function normalizeNameForExactMatch(name?: string | null): string | null {
  const normalized = normalizeName(name);
  if (!normalized) return null;
  const asciiLike = normalized
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return asciiLike.length > 0 ? asciiLike : null;
}

function normalizeEmail(email?: string | null): string | null {
  const normalized = (email || "").trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function parseOptionalDate(value?: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isIncomingNameMoreDetailed(
  incomingName?: string | null,
  existingName?: string | null
): boolean {
  const incoming = normalizeName(incomingName);
  const existing = normalizeName(existingName);

  if (!incoming) return false;
  if (!existing) return true;
  if (incoming.toLowerCase() === existing.toLowerCase()) return false;

  return incoming.length > existing.length;
}

async function getOrCreateGoogleImportTagId(userId: string): Promise<string> {
  const tagName = "Google Import";
  const [created] = await db
    .insert(tags)
    .values({
      userId,
      name: tagName,
      color: "#4285F4",
    })
    .onConflictDoNothing()
    .returning({ id: tags.id });

  if (created) {
    return created.id;
  }

  const [existing] = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.userId, userId), eq(tags.name, tagName)))
    .limit(1);

  if (!existing) {
    throw new Error("Failed to create or retrieve Google Import tag");
  }

  return existing.id;
}

async function uploadImportedContactPhoto(
  contactId: string,
  photoBase64: string,
  photoContentType: string,
  replacePrimary: boolean
) {
  const imageBuffer = Buffer.from(photoBase64, "base64");
  if (imageBuffer.length === 0 || imageBuffer.length > MAX_IMAGE_SIZE_BYTES) {
    return;
  }

  const storageClient = getStorageClient();
  if (!storageClient) {
    return;
  }

  const [existingPrimary] = await db
    .select()
    .from(contactImages)
    .where(and(eq(contactImages.contactId, contactId), eq(contactImages.order, 0)))
    .orderBy(asc(contactImages.createdAt))
    .limit(1);

  if (existingPrimary && !replacePrimary) {
    return;
  }

  if (existingPrimary) {
    if (existingPrimary.publicId) {
      const { error: storageDeleteError } = await storageClient.storage
        .from(SUPABASE_STORAGE_BUCKET)
        .remove([existingPrimary.publicId]);
      if (storageDeleteError) {
        console.error("Error deleting old imported image from storage:", storageDeleteError);
      }
    }
    await db.delete(contactImages).where(eq(contactImages.id, existingPrimary.id));
  }

  const extension = getImageExtension(photoContentType);
  const filePath = `contact-images/${contactId}-${Date.now()}.${extension}`;

  const { error: uploadError } = await storageClient.storage
    .from(SUPABASE_STORAGE_BUCKET)
    .upload(filePath, imageBuffer, {
      cacheControl: "3600",
      upsert: false,
      contentType: photoContentType,
    });

  if (uploadError) {
    throw new Error(`Failed to upload imported contact photo: ${uploadError.message}`);
  }

  const { data: signedUrlData, error: signedUrlError } = await storageClient.storage
    .from(SUPABASE_STORAGE_BUCKET)
    .createSignedUrl(filePath, 31536000);

  if (signedUrlError || !signedUrlData) {
    throw new Error("Failed to create signed URL for imported contact photo");
  }

  await db.insert(contactImages).values({
    contactId,
    imageUrl: signedUrlData.signedUrl,
    publicId: filePath,
    order: 0,
  });
}

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
        .limit(limit + 1);
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
    const results = contactsList;
    
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
            .where(inArray(contactImages.contactId, contactIds))
            .orderBy(asc(contactImages.contactId), asc(contactImages.order))
        : [],
    ]);

    const primaryImageByContactId = new Map<string, (typeof contactImagesData)[number]>();
    for (const image of contactImagesData) {
      if (!primaryImageByContactId.has(image.contactId)) {
        primaryImageByContactId.set(image.contactId, image);
      }
    }

    // Map tags and images to contacts
    const enrichedContacts = results.map((contact: any) => {
      const primaryImage = primaryImageByContactId.get(contact.id);
      return {
        ...contact,
        tags: contactTagsData
          .filter((ct: any) => ct.contact_tags.contactId === contact.id)
          .map((ct: any) => ct.tags),
        images: primaryImage ? [primaryImage] : [],
      };
    });

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

// GET /api/contacts/search/phone - Find contact by phone number
app.get("/search/phone", async (c) => {
  const userId = c.get("userId");
  const phone = c.req.query("phone") || "";
  const includeRaw = c.req.query("include") || "";
  const include = includeRaw
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
  const conversationsLimit = parseInt(c.req.query("conversationsLimit") || "10");
  const eventsLimit = parseInt(c.req.query("eventsLimit") || "10");
  const remindersLimit = parseInt(c.req.query("remindersLimit") || "10");

  const normalized = phone.replace(/\D/g, "");
  if (!phone || normalized.length < 3) {
    return c.json({ error: "phone query param is required" }, 400);
  }

  try {
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
      return c.json({ contact: null, candidates: [] });
    }

    const response: any = { contact, candidates };

    if (include.includes("conversations")) {
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
          .where(
            and(eq(conversations.userId, userId), inArray(conversations.id, convIds))
          )
          .orderBy(desc(conversations.happenedAt))
          .limit(conversationsLimit);

        const conversationIds = conversationsList.map((conv) => conv.id);

        const [participantsData, eventsData] = await Promise.all([
          conversationIds.length > 0
            ? db
                .select()
                .from(conversationParticipants)
                .innerJoin(contacts, eq(conversationParticipants.contactId, contacts.id))
                .where(inArray(conversationParticipants.conversationId, conversationIds))
            : [],
          conversationIds.length > 0
            ? db
                .select({ id: events.id, title: events.title, conversationEventId: conversations.id })
                .from(events)
                .innerJoin(conversations, eq(conversations.eventId, events.id))
                .where(inArray(conversations.id, conversationIds))
            : [],
        ]);

        response.conversations = conversationsList.map((conv) => ({
          ...conv,
          participants: participantsData
            .filter((p: any) => p.conversation_participants.conversationId === conv.id)
            .map((p: any) => ({
              ...p.conversation_participants,
              contact: p.contacts,
            })),
          event: eventsData.find((e: any) => conv.eventId === e.id) || null,
        }));
      }
    }

    if (include.includes("events")) {
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
          .limit(eventsLimit);

        const eventIdsPage = eventsList.map((evt) => evt.id);

        const [participantsData, conversationCounts] = await Promise.all([
          eventIdsPage.length > 0
            ? db
                .select()
                .from(eventParticipants)
                .innerJoin(contacts, eq(eventParticipants.contactId, contacts.id))
                .where(inArray(eventParticipants.eventId, eventIdsPage))
            : [],
          eventIdsPage.length > 0
            ? db
                .select({
                  eventId: conversations.eventId,
                  count: sql<number>`count(*)`,
                })
                .from(conversations)
                .where(inArray(conversations.eventId, eventIdsPage))
                .groupBy(conversations.eventId)
            : [],
        ]);

        response.events = eventsList.map((evt) => ({
          ...evt,
          participants: participantsData
            .filter((p: any) => p.event_participants.eventId === evt.id)
            .map((p: any) => ({
              ...p.event_participants,
              contact: p.contacts,
            })),
          _count: {
            conversations:
              conversationCounts.find((cc: any) => cc.eventId === evt.id)?.count || 0,
          },
        }));
      }
    }

    if (include.includes("reminders")) {
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
          .limit(remindersLimit);

        const reminderIdsPage = remindersList.map((reminder) => reminder.id);
        const conversationIds = remindersList
          .map((reminder) => reminder.conversationId)
          .filter((id: string | null): id is string => Boolean(id));

        const [participantsData, conversationsData] = await Promise.all([
          reminderIdsPage.length > 0
            ? db
                .select()
                .from(reminderParticipants)
                .innerJoin(contacts, eq(reminderParticipants.contactId, contacts.id))
                .where(inArray(reminderParticipants.reminderId, reminderIdsPage))
            : [],
          conversationIds.length > 0
            ? db
                .select({
                  id: conversations.id,
                  medium: conversations.medium,
                  happenedAt: conversations.happenedAt,
                })
                .from(conversations)
                .where(inArray(conversations.id, conversationIds))
            : [],
        ]);

        response.reminders = remindersList.map((reminder) => ({
          ...reminder,
          participants: participantsData
            .filter((p: any) => p.reminder_participants.reminderId === reminder.id)
            .map((p: any) => ({
              ...p.reminder_participants,
              contact: p.contacts,
            })),
          conversation:
            conversationsData.find((conversation) => conversation.id === reminder.conversationId) ||
            null,
        }));
      }
    }

    return c.json(response);
  } catch (error) {
    console.error("Error searching contact by phone:", error);
    return c.json({ error: "Failed to search contacts" }, 500);
  }
});

// POST /api/contacts/google/fetch - Fetch Google contacts from People API
app.post("/google/fetch", async (c) => {
  const body = await c.req.json();
  const validation = fetchGoogleContactsSchema.safeParse(body);
  if (!validation.success) {
    return c.json({ error: validation.error.issues }, 400);
  }

  const { accessToken, includePhotos } = validation.data;

  try {
    const allGoogleConnections: any[] = [];
    let nextPageToken: string | undefined;

    do {
      const url = new URL("https://people.googleapis.com/v1/people/me/connections");
      url.searchParams.set(
        "personFields",
        "names,emailAddresses,phoneNumbers,birthdays,organizations,addresses,biographies,photos"
      );
      url.searchParams.set("pageSize", "1000");
      if (nextPageToken) {
        url.searchParams.set("pageToken", nextPageToken);
      }

      const googleResponse = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!googleResponse.ok) {
        const errorText = await googleResponse.text();
        console.error("Google API error:", errorText);
        return c.json({ error: "Failed to fetch contacts from Google" }, 500);
      }

      const googleData = (await googleResponse.json()) as {
        connections?: any[];
        nextPageToken?: string;
      };
      if (googleData.connections) {
        allGoogleConnections.push(...googleData.connections);
      }

      nextPageToken = googleData.nextPageToken;
    } while (nextPageToken);

    const transformedContacts = await Promise.all(
      allGoogleConnections.map(async (person: any) => {
        const name = person.names?.[0]?.displayName || "Unknown";
        const email = person.emailAddresses?.[0]?.value || null;
        const phone = person.phoneNumbers?.[0]?.value || null;
        const organization = person.organizations?.[0];
        const company = organization?.name || null;
        const jobTitle = organization?.title || null;
        const address = person.addresses?.[0];
        const location = address
          ? [address.city, address.region, address.country].filter(Boolean).join(", ")
          : null;
        const bio = person.biographies?.[0]?.value || null;
        const birthday = person.birthdays?.[0];
        const dateOfBirth = birthday?.date
          ? `${birthday.date.year || "1900"}-${String(birthday.date.month || 1).padStart(2, "0")}-${String(
              birthday.date.day || 1
            ).padStart(2, "0")}`
          : null;
        const photoUrl = person.photos?.[0]?.url || null;

        let photoBase64: string | null = null;
        let photoContentType: string | null = null;

        if (includePhotos && photoUrl) {
          try {
            const photoResponse = await fetch(photoUrl, {
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
            });

            if (photoResponse.ok) {
              const arrayBuffer = await photoResponse.arrayBuffer();
              photoBase64 = Buffer.from(arrayBuffer).toString("base64");
              photoContentType = photoResponse.headers.get("content-type") || "image/jpeg";
            }
          } catch (error) {
            console.error(`Failed to download Google photo for ${name}:`, error);
          }
        }

        return {
          displayName: name,
          primaryEmail: email,
          primaryPhone: phone,
          company,
          jobTitle,
          location,
          notes: bio,
          dateOfBirth,
          photoUrl,
          photoBase64,
          photoContentType,
        };
      })
    );

    return c.json({ contacts: transformedContacts });
  } catch (error) {
    console.error("Error fetching Google contacts:", error);
    return c.json({ error: "Failed to fetch Google contacts" }, 500);
  }
});

// POST /api/contacts/google/import/batch - Import Google contacts in batch
app.post("/google/import/batch", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();

  const validation = importGoogleContactsBatchSchema.safeParse(body);
  if (!validation.success) {
    return c.json({ error: validation.error.issues }, 400);
  }

  const { contacts: incomingContacts, overrideExisting } = validation.data;

  if (incomingContacts.length === 0) {
    return c.json({ imported: 0, updated: 0, skipped: 0, errors: 0 });
  }

  try {
    const googleImportTagId = await getOrCreateGoogleImportTagId(userId);

    type ExistingImportContact = {
      id: string;
      displayName: string;
      primaryPhone: string | null;
      primaryEmail: string | null;
      company: string | null;
      jobTitle: string | null;
      location: string | null;
      notes: string | null;
      dateOfBirth: Date | null;
      googleContactName: string | null;
    };

    const existingContacts = await db
      .select({
        id: contacts.id,
        displayName: contacts.displayName,
        primaryPhone: contacts.primaryPhone,
        primaryEmail: contacts.primaryEmail,
        company: contacts.company,
        jobTitle: contacts.jobTitle,
        location: contacts.location,
        notes: contacts.notes,
        dateOfBirth: contacts.dateOfBirth,
        googleContactName: contacts.googleContactName,
      })
      .from(contacts)
      .where(eq(contacts.userId, userId))
      .orderBy(asc(contacts.createdAt));

    const existingByNormalizedPhone = new Map<string, ExistingImportContact>();
    const existingByNormalizedEmail = new Map<string, ExistingImportContact>();
    const existingByNormalizedNameWithoutPhone = new Map<string, ExistingImportContact>();

    const indexExistingContact = (contact: ExistingImportContact) => {
      const normalizedPhone = normalizePhoneDigits(contact.primaryPhone);
      if (normalizedPhone && !existingByNormalizedPhone.has(normalizedPhone)) {
        existingByNormalizedPhone.set(normalizedPhone, contact);
      }

      const normalizedEmail = normalizeEmail(contact.primaryEmail);
      if (normalizedEmail && !existingByNormalizedEmail.has(normalizedEmail)) {
        existingByNormalizedEmail.set(normalizedEmail, contact);
      }

      if (!normalizedPhone) {
        const normalizedName = normalizeNameForExactMatch(contact.displayName);
        if (normalizedName && !existingByNormalizedNameWithoutPhone.has(normalizedName)) {
          existingByNormalizedNameWithoutPhone.set(normalizedName, contact);
        }
      }
    };

    const removeExistingContactIndexes = (contact: ExistingImportContact) => {
      const normalizedPhone = normalizePhoneDigits(contact.primaryPhone);
      if (normalizedPhone && existingByNormalizedPhone.get(normalizedPhone)?.id === contact.id) {
        existingByNormalizedPhone.delete(normalizedPhone);
      }

      const normalizedEmail = normalizeEmail(contact.primaryEmail);
      if (normalizedEmail && existingByNormalizedEmail.get(normalizedEmail)?.id === contact.id) {
        existingByNormalizedEmail.delete(normalizedEmail);
      }

      const normalizedName = normalizeNameForExactMatch(contact.displayName);
      if (
        !normalizedPhone &&
        normalizedName &&
        existingByNormalizedNameWithoutPhone.get(normalizedName)?.id === contact.id
      ) {
        existingByNormalizedNameWithoutPhone.delete(normalizedName);
      }
    };

    for (const existing of existingContacts) {
      indexExistingContact(existing);
    }

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const incoming of incomingContacts) {
      try {
        const incomingName = normalizeName(incoming.displayName);
        if (!incomingName || incomingName.toLowerCase() === "unknown") {
          skipped += 1;
          continue;
        }

        const normalizedIncomingPhone = normalizePhoneDigits(incoming.primaryPhone);
        const normalizedIncomingEmail = normalizeEmail(incoming.primaryEmail);
        const normalizedIncomingName = normalizeNameForExactMatch(incomingName);

        let existing: ExistingImportContact | null = null;

        if (normalizedIncomingPhone) {
          existing = existingByNormalizedPhone.get(normalizedIncomingPhone) || null;
        }

        // Fallback when incoming contact has no phone: exact email match.
        if (!existing && !normalizedIncomingPhone && normalizedIncomingEmail) {
          existing = existingByNormalizedEmail.get(normalizedIncomingEmail) || null;
        }

        // Last fallback when incoming contact has no phone: strict normalized name match
        // against contacts that also have no phone number.
        if (!existing && !normalizedIncomingPhone && normalizedIncomingName) {
          existing = existingByNormalizedNameWithoutPhone.get(normalizedIncomingName) || null;
        }

        if (!existing) {
          const [createdContact] = await db
            .insert(contacts)
            .values({
              userId,
              displayName: incomingName,
              googleContactName: incomingName,
              primaryPhone: incoming.primaryPhone || null,
              primaryEmail: incoming.primaryEmail || null,
              dateOfBirth: parseOptionalDate(incoming.dateOfBirth),
              company: incoming.company || null,
              jobTitle: incoming.jobTitle || null,
              location: incoming.location || null,
              notes: incoming.notes || null,
            })
            .returning({
              id: contacts.id,
              displayName: contacts.displayName,
              primaryPhone: contacts.primaryPhone,
              primaryEmail: contacts.primaryEmail,
              company: contacts.company,
              jobTitle: contacts.jobTitle,
              location: contacts.location,
              notes: contacts.notes,
              dateOfBirth: contacts.dateOfBirth,
              googleContactName: contacts.googleContactName,
            });

          if (!createdContact) {
            errors += 1;
            continue;
          }

          imported += 1;

          await db
            .insert(contactTags)
            .values({
              contactId: createdContact.id,
              tagId: googleImportTagId,
            })
            .onConflictDoNothing();

          if (incoming.photoBase64 && incoming.photoContentType) {
            try {
              await uploadImportedContactPhoto(
                createdContact.id,
                incoming.photoBase64,
                incoming.photoContentType,
                false
              );
            } catch (photoError) {
              console.error("Error uploading imported photo for new contact:", photoError);
            }
          }

          indexExistingContact(createdContact);

          continue;
        }

        const shouldUpgradeName = isIncomingNameMoreDetailed(incomingName, existing.displayName);
        const updateData: Record<string, unknown> = {};

        if (shouldUpgradeName) {
          updateData.displayName = incomingName;
          updateData.googleContactName = incomingName;
        }

        if (overrideExisting) {
          updateData.googleContactName = incomingName;
          updateData.primaryPhone = incoming.primaryPhone || null;
          updateData.primaryEmail = incoming.primaryEmail || null;
          updateData.dateOfBirth = parseOptionalDate(incoming.dateOfBirth);
          updateData.company = incoming.company || null;
          updateData.jobTitle = incoming.jobTitle || null;
          updateData.location = incoming.location || null;
          updateData.notes = incoming.notes || null;
        }

        if (Object.keys(updateData).length === 0) {
          skipped += 1;
          continue;
        }

        updateData.updatedAt = new Date();

        const [updatedContact] = await db
          .update(contacts)
          .set(updateData)
          .where(eq(contacts.id, existing.id))
          .returning({
            id: contacts.id,
            displayName: contacts.displayName,
            primaryPhone: contacts.primaryPhone,
            primaryEmail: contacts.primaryEmail,
            company: contacts.company,
            jobTitle: contacts.jobTitle,
            location: contacts.location,
            notes: contacts.notes,
            dateOfBirth: contacts.dateOfBirth,
            googleContactName: contacts.googleContactName,
          });

        if (!updatedContact) {
          skipped += 1;
          continue;
        }

        removeExistingContactIndexes(existing);
        indexExistingContact(updatedContact);

        updated += 1;

        if (incoming.photoBase64 && incoming.photoContentType) {
          try {
            await uploadImportedContactPhoto(
              updatedContact.id,
              incoming.photoBase64,
              incoming.photoContentType,
              overrideExisting
            );
          } catch (photoError) {
            console.error("Error uploading imported photo for existing contact:", photoError);
          }
        }

      } catch (error) {
        console.error("Error importing contact:", incoming?.displayName, error);
        errors += 1;
      }
    }

    return c.json({ imported, updated, skipped, errors });
  } catch (error) {
    console.error("Error during Google contact import batch:", error);
    return c.json({ error: "Failed to import Google contacts" }, 500);
  }
});

// GET /api/contacts/:id/conversations - List conversations for a contact
app.get("/:id/conversations", async (c) => {
  const userId = c.get("userId");
  const contactId = c.req.param("id");
  const cursor = c.req.query("cursor");
  const search = c.req.query("search") || "";
  const medium = c.req.query("medium");
  const limit = parseInt(c.req.query("limit") || String(PAGE_SIZE));

  try {
    const [contact] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.id, contactId), eq(contacts.userId, userId)));

    if (!contact) {
      return c.json({ error: "Contact not found" }, 404);
    }

    const convIdsResult = await db
      .select({ conversationId: conversationParticipants.conversationId })
      .from(conversationParticipants)
      .where(eq(conversationParticipants.contactId, contactId));

    const convIds = convIdsResult.map((r) => r.conversationId);

    if (convIds.length === 0) {
      return c.json({ conversations: [], nextCursor: null });
    }

    const conditions = [
      eq(conversations.userId, userId),
      inArray(conversations.id, convIds),
    ];

    if (medium && conversationMediums.includes(medium as any)) {
      conditions.push(eq(conversations.medium, medium as any));
    }

    if (search) {
      conditions.push(ilike(conversations.content, `%${search}%`));
    }

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
        .limit(limit + 1);
    } else {
      conversationsList = await db
        .select()
        .from(conversations)
        .where(and(...conditions))
        .orderBy(desc(conversations.happenedAt))
        .limit(limit + 1);
    }

    let nextCursor: string | null = null;
    if (conversationsList.length > limit) {
      const nextItem = conversationsList.pop();
      nextCursor = nextItem?.id || null;
    }

    const conversationIds = conversationsList.map((conv) => conv.id);

    const [participantsData, eventsData] = await Promise.all([
      conversationIds.length > 0
        ? db
            .select()
            .from(conversationParticipants)
            .innerJoin(contacts, eq(conversationParticipants.contactId, contacts.id))
            .where(inArray(conversationParticipants.conversationId, conversationIds))
        : [],
      conversationIds.length > 0
        ? db
            .select({ id: events.id, title: events.title, conversationEventId: conversations.id })
            .from(events)
            .innerJoin(conversations, eq(conversations.eventId, events.id))
            .where(inArray(conversations.id, conversationIds))
        : [],
    ]);

    const enrichedConversations = conversationsList.map((conv) => ({
      ...conv,
      participants: participantsData
        .filter((p: any) => p.conversation_participants.conversationId === conv.id)
        .map((p: any) => ({
          ...p.conversation_participants,
          contact: p.contacts,
        })),
      event: eventsData.find((e: any) => conv.eventId === e.id) || null,
    }));

    return c.json({
      conversations: enrichedConversations,
      nextCursor,
    });
  } catch (error) {
    console.error("Error fetching contact conversations:", error);
    return c.json({ error: "Failed to fetch conversations" }, 500);
  }
});

// GET /api/contacts/:id/events - List events for a contact
app.get("/:id/events", async (c) => {
  const userId = c.get("userId");
  const contactId = c.req.param("id");
  const cursor = c.req.query("cursor");
  const search = c.req.query("search") || "";
  const eventType = c.req.query("eventType");
  const limit = parseInt(c.req.query("limit") || String(PAGE_SIZE));

  try {
    const [contact] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.id, contactId), eq(contacts.userId, userId)));

    if (!contact) {
      return c.json({ error: "Contact not found" }, 404);
    }

    const eventIdsResult = await db
      .select({ eventId: eventParticipants.eventId })
      .from(eventParticipants)
      .where(eq(eventParticipants.contactId, contactId));

    const eventIds = eventIdsResult.map((r) => r.eventId);

    if (eventIds.length === 0) {
      return c.json({ events: [], nextCursor: null });
    }

    const conditions = [eq(events.userId, userId), inArray(events.id, eventIds)];

    if (eventType && eventTypes.includes(eventType as any)) {
      conditions.push(eq(events.eventType, eventType as any));
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
        .limit(limit + 1);
    } else {
      eventsList = await db
        .select()
        .from(events)
        .where(and(...conditions))
        .orderBy(desc(events.startAt))
        .limit(limit + 1);
    }

    let nextCursor: string | null = null;
    if (eventsList.length > limit) {
      const nextItem = eventsList.pop();
      nextCursor = nextItem?.id || null;
    }

    const eventIdsPage = eventsList.map((evt) => evt.id);

    const [participantsData, conversationCounts] = await Promise.all([
      eventIdsPage.length > 0
        ? db
            .select()
            .from(eventParticipants)
            .innerJoin(contacts, eq(eventParticipants.contactId, contacts.id))
            .where(inArray(eventParticipants.eventId, eventIdsPage))
        : [],
      eventIdsPage.length > 0
        ? db
            .select({
              eventId: conversations.eventId,
              count: sql<number>`count(*)`,
            })
            .from(conversations)
            .where(inArray(conversations.eventId, eventIdsPage))
            .groupBy(conversations.eventId)
        : [],
    ]);

    const enrichedEvents = eventsList.map((evt) => ({
      ...evt,
      participants: participantsData
        .filter((p: any) => p.event_participants.eventId === evt.id)
        .map((p: any) => ({
          ...p.event_participants,
          contact: p.contacts,
        })),
      _count: {
        conversations:
          conversationCounts.find((cc: any) => cc.eventId === evt.id)?.count || 0,
      },
    }));

    return c.json({
      events: enrichedEvents,
      nextCursor,
    });
  } catch (error) {
    console.error("Error fetching contact events:", error);
    return c.json({ error: "Failed to fetch events" }, 500);
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
    return c.json({ error: validation.error.issues }, 400);
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

    if (!newContact) {
      return c.json({ error: "Failed to create contact" }, 500);
    }

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
    return c.json({ error: validation.error.issues }, 400);
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
  const validation = addImageSchema.safeParse(body);

  if (!validation.success) {
    return c.json({ error: validation.error.issues }, 400);
  }

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
    const maxOrder = await getContactMaxImageOrder(contactId);
    const [newImage] = await db
      .insert(contactImages)
      .values({
        contactId,
        imageUrl: validation.data.imageUrl,
        publicId: validation.data.publicId || null,
        order: maxOrder + 1,
      })
      .returning();

    return c.json(newImage, 201);
  } catch (error) {
    console.error("Error adding image:", error);
    return c.json({ error: "Failed to add image" }, 500);
  }
});

// POST /api/contacts/:id/images/upload - Upload base64 image and attach to contact
app.post("/:id/images/upload", async (c) => {
  const userId = c.get("userId");
  const contactId = c.req.param("id");
  const body = await c.req.json();
  const validation = uploadImageSchema.safeParse(body);

  if (!validation.success) {
    return c.json({ error: validation.error.issues }, 400);
  }

  try {
    const [existing] = await db
      .select({ userId: contacts.userId })
      .from(contacts)
      .where(eq(contacts.id, contactId));

    if (!existing || existing.userId !== userId) {
      return c.json({ error: "Contact not found" }, 404);
    }

    const storageClient = getStorageClient();
    if (!storageClient) {
      return c.json(
        {
          error:
            "Storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
        },
        500
      );
    }

    const { base64Data, contentType, fileName } = validation.data;
    const imageBuffer = Buffer.from(base64Data, "base64");
    if (imageBuffer.length === 0 || imageBuffer.length > MAX_IMAGE_SIZE_BYTES) {
      return c.json({ error: "Image must be between 1 byte and 5MB" }, 400);
    }

    const extension = getImageExtension(contentType, fileName);
    const filePath = `contact-images/${contactId}-${Date.now()}.${extension}`;

    const { error: uploadError } = await storageClient.storage
      .from(SUPABASE_STORAGE_BUCKET)
      .upload(filePath, imageBuffer, {
        cacheControl: "3600",
        upsert: false,
        contentType,
      });

    if (uploadError) {
      console.error("Error uploading image to storage:", uploadError);
      return c.json({ error: "Failed to upload image" }, 500);
    }

    const { data: signedUrlData, error: signedUrlError } = await storageClient.storage
      .from(SUPABASE_STORAGE_BUCKET)
      .createSignedUrl(filePath, 31536000);

    if (signedUrlError || !signedUrlData) {
      console.error("Error creating signed URL:", signedUrlError);
      return c.json({ error: "Failed to generate image URL" }, 500);
    }

    const maxOrder = await getContactMaxImageOrder(contactId);
    const [newImage] = await db
      .insert(contactImages)
      .values({
        contactId,
        imageUrl: signedUrlData.signedUrl,
        publicId: filePath,
        order: maxOrder + 1,
      })
      .returning();

    return c.json(newImage, 201);
  } catch (error) {
    console.error("Error uploading image:", error);
    return c.json({ error: "Failed to upload image" }, 500);
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

    const [image] = await db
      .select()
      .from(contactImages)
      .where(and(eq(contactImages.id, imageId), eq(contactImages.contactId, contactId)));

    if (!image) {
      return c.json({ error: "Image not found" }, 404);
    }

    if (image.publicId) {
      const storageClient = getStorageClient();
      if (storageClient) {
        const { error: storageDeleteError } = await storageClient.storage
          .from(SUPABASE_STORAGE_BUCKET)
          .remove([image.publicId]);
        if (storageDeleteError) {
          console.error("Error deleting image from storage:", storageDeleteError);
        }
      }
    }

    await db.delete(contactImages).where(eq(contactImages.id, imageId));

    // Keep image ordering contiguous so the first image remains deterministic.
    const remainingImages = await db
      .select({ id: contactImages.id })
      .from(contactImages)
      .where(eq(contactImages.contactId, contactId))
      .orderBy(asc(contactImages.order), asc(contactImages.createdAt));

    await Promise.all(
      remainingImages.map((remainingImage, index) =>
        db
          .update(contactImages)
          .set({ order: index })
          .where(eq(contactImages.id, remainingImage.id))
      )
    );

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
    const similarityExpr = sql<number>`
      GREATEST(
        similarity(${contacts.displayName}, ${name}),
        word_similarity(${name}, ${contacts.displayName})
      )
    `;
    const contactsResult = await db
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
      .limit(limit);

    return c.json({ contacts: contactsResult });
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
