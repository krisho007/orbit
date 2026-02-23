// Users API Routes
import { Hono } from "hono";
import { z } from "zod";
import { eq, and, inArray } from "drizzle-orm";
import { createClient } from "@supabase/supabase-js";
import {
  db,
  users,
  contacts,
  contactTags,
  contactImages,
  socialLinks,
  tags,
  conversations,
  conversationParticipants,
  reminders,
  reminderParticipants,
  events,
  eventParticipants,
  relationships,
  relationshipTypes,
} from "../db";
import { authMiddleware } from "../middleware/auth";
import { formatValidationErrors } from "../utils/validation";

const app = new Hono();

app.use("/*", authMiddleware);

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "orbit";

function getAdminClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// GET /api/users/me/contact - Get the current user's linked contact
app.get("/me/contact", async (c) => {
  const userId = c.get("userId");

  try {
    const [user] = await db
      .select({
        primaryContactId: users.primaryContactId,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user?.primaryContactId) {
      return c.json({ primaryContact: null });
    }

    // Fetch the full contact record
    const [contact] = await db
      .select()
      .from(contacts)
      .where(
        and(eq(contacts.id, user.primaryContactId), eq(contacts.userId, userId))
      )
      .limit(1);

    return c.json({ primaryContact: contact || null });
  } catch (error) {
    console.error("Error fetching user contact:", error);
    return c.json({ error: "Failed to fetch user contact" }, 500);
  }
});

// PUT /api/users/me/contact - Set the current user's primary contact
app.put("/me/contact", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();

  const schema = z.object({
    contactId: z.string().min(1, "Contact ID is required"),
  });

  const validation = schema.safeParse(body);
  if (!validation.success) {
    return c.json({ error: formatValidationErrors(validation.error) }, 400);
  }

  const { contactId } = validation.data;

  try {
    // Verify the contact belongs to this user
    const [contact] = await db
      .select({ id: contacts.id, displayName: contacts.displayName })
      .from(contacts)
      .where(and(eq(contacts.id, contactId), eq(contacts.userId, userId)))
      .limit(1);

    if (!contact) {
      return c.json({ error: "Contact not found" }, 404);
    }

    // Update the user's primary contact
    await db
      .update(users)
      .set({
        primaryContactId: contactId,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    return c.json({
      primaryContact: contact,
      message: `Your contact has been set to "${contact.displayName}"`,
    });
  } catch (error) {
    console.error("Error setting user contact:", error);
    return c.json({ error: "Failed to set user contact" }, 500);
  }
});

// GET /api/users/me/consent - Get consent status
app.get("/me/consent", async (c) => {
  const userId = c.get("userId");

  try {
    const [user] = await db
      .select({
        thirdPartyConsentGranted: users.thirdPartyConsentGranted,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const consent = user?.thirdPartyConsentGranted ?? false;
    return c.json({
      aiConsent: consent,
      sttConsent: consent,
    });
  } catch (error) {
    console.error("Error fetching consent:", error);
    return c.json({ error: "Failed to fetch consent status" }, 500);
  }
});

// PUT /api/users/me/consent - Update consent
app.put("/me/consent", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();

  const consentSchema = z.object({
    aiConsent: z.boolean().optional(),
    sttConsent: z.boolean().optional(),
  });

  const validation = consentSchema.safeParse(body);
  if (!validation.success) {
    return c.json({ error: formatValidationErrors(validation.error) }, 400);
  }

  const { aiConsent, sttConsent } = validation.data;
  // Either field sets the unified consent flag
  const consentValue = aiConsent ?? sttConsent;

  try {
    await db.update(users).set({
      ...(consentValue !== undefined && { thirdPartyConsentGranted: consentValue }),
      updatedAt: new Date(),
    }).where(eq(users.id, userId));
    return c.json({ success: true });
  } catch (error) {
    console.error("Error updating consent:", error);
    return c.json({ error: "Failed to update consent" }, 500);
  }
});

// GET /api/users/me/export - Export all user data (GDPR Article 15 & 20)
app.get("/me/export", async (c) => {
  const userId = c.get("userId");

  try {
    // Fetch user
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    // Fetch all user data in parallel
    const [
      userContacts,
      userConversations,
      userEvents,
      userReminders,
      userRelationships,
      userRelationshipTypes,
      userTags,
    ] = await Promise.all([
      db.select().from(contacts).where(eq(contacts.userId, userId)),
      db.select().from(conversations).where(eq(conversations.userId, userId)),
      db.select().from(events).where(eq(events.userId, userId)),
      db.select().from(reminders).where(eq(reminders.userId, userId)),
      db.select().from(relationships).where(eq(relationships.userId, userId)),
      db.select().from(relationshipTypes).where(eq(relationshipTypes.userId, userId)),
      db.select().from(tags).where(eq(tags.userId, userId)),
    ]);

    const contactIds = userContacts.map((c) => c.id);
    const conversationIds = userConversations.map((c) => c.id);
    const eventIds = userEvents.map((e) => e.id);
    const reminderIds = userReminders.map((r) => r.id);

    // Fetch related data
    const [
      allContactTags,
      allSocialLinks,
      allContactImageRows,
      allConvParticipants,
      allEventParticipants,
      allReminderParticipants,
    ] = await Promise.all([
      contactIds.length > 0
        ? db.select().from(contactTags).where(inArray(contactTags.contactId, contactIds))
        : [],
      contactIds.length > 0
        ? db.select().from(socialLinks).where(inArray(socialLinks.contactId, contactIds))
        : [],
      contactIds.length > 0
        ? db.select().from(contactImages).where(inArray(contactImages.contactId, contactIds))
        : [],
      conversationIds.length > 0
        ? db.select().from(conversationParticipants).where(inArray(conversationParticipants.conversationId, conversationIds))
        : [],
      eventIds.length > 0
        ? db.select().from(eventParticipants).where(inArray(eventParticipants.eventId, eventIds))
        : [],
      reminderIds.length > 0
        ? db.select().from(reminderParticipants).where(inArray(reminderParticipants.reminderId, reminderIds))
        : [],
    ]);

    // Build a contact name lookup
    const contactNameMap = new Map(userContacts.map((c) => [c.id, c.displayName]));

    // Assemble enriched contacts
    const enrichedContacts = userContacts.map((contact) => ({
      ...contact,
      tags: allContactTags
        .filter((ct) => ct.contactId === contact.id)
        .map((ct) => {
          const tag = userTags.find((t) => t.id === ct.tagId);
          return tag ? { name: tag.name, color: tag.color } : null;
        })
        .filter(Boolean),
      socialLinks: allSocialLinks.filter((sl) => sl.contactId === contact.id),
      images: allContactImageRows.filter((img) => img.contactId === contact.id),
    }));

    // Assemble enriched conversations
    const enrichedConversations = userConversations.map((conv) => ({
      ...conv,
      participants: allConvParticipants
        .filter((p) => p.conversationId === conv.id)
        .map((p) => ({ displayName: contactNameMap.get(p.contactId) || p.contactId })),
    }));

    // Assemble enriched events
    const enrichedEvents = userEvents.map((event) => ({
      ...event,
      participants: allEventParticipants
        .filter((p) => p.eventId === event.id)
        .map((p) => ({ displayName: contactNameMap.get(p.contactId) || p.contactId })),
    }));

    // Assemble enriched reminders
    const enrichedReminders = userReminders.map((reminder) => ({
      ...reminder,
      participants: allReminderParticipants
        .filter((p) => p.reminderId === reminder.id)
        .map((p) => ({ displayName: contactNameMap.get(p.contactId) || p.contactId })),
    }));

    // Assemble enriched relationships
    const typeMap = new Map(userRelationshipTypes.map((t) => [t.id, t.name]));
    const enrichedRelationships = userRelationships.map((rel) => ({
      fromContact: contactNameMap.get(rel.fromContactId) || rel.fromContactId,
      toContact: contactNameMap.get(rel.toContactId) || rel.toContactId,
      type: typeMap.get(rel.typeId) || rel.typeId,
      notes: rel.notes,
    }));

    const exportData = {
      exportedAt: new Date().toISOString(),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        createdAt: user.createdAt,
      },
      contacts: enrichedContacts,
      conversations: enrichedConversations,
      events: enrichedEvents,
      reminders: enrichedReminders,
      relationships: enrichedRelationships,
      tags: userTags.map((t) => ({ name: t.name, color: t.color })),
    };

    return new Response(JSON.stringify(exportData, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": 'attachment; filename="orbit-data-export.json"',
      },
    });
  } catch (error) {
    console.error("Error exporting user data:", error);
    return c.json({ error: "Failed to export data" }, 500);
  }
});

// PUT /api/users/me/google-tokens - Store Google OAuth tokens
app.put("/me/google-tokens", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();

  const schema = z.object({
    providerToken: z.string().min(1, "Provider token is required"),
    providerRefreshToken: z.string().optional(),
  });

  const validation = schema.safeParse(body);
  if (!validation.success) {
    return c.json({ error: formatValidationErrors(validation.error) }, 400);
  }

  const { providerToken, providerRefreshToken } = validation.data;

  try {
    const updateData: Record<string, unknown> = {
      googleProviderToken: providerToken,
      googleTokenExpiresAt: new Date(Date.now() + 55 * 60 * 1000), // ~55 min
      updatedAt: new Date(),
    };

    // Only overwrite refresh token if a new one is provided
    if (providerRefreshToken) {
      updateData.googleProviderRefreshToken = providerRefreshToken;
    }

    await db.update(users).set(updateData).where(eq(users.id, userId));
    return c.json({ success: true });
  } catch (error) {
    console.error("Error storing Google tokens:", error);
    return c.json({ error: "Failed to store Google tokens" }, 500);
  }
});

// DELETE /api/users/me - Delete account and all data (GDPR Article 17)
app.delete("/me", async (c) => {
  const userId = c.get("userId");

  try {
    // Collect all entity IDs for the user
    const userContactRows = await db.select({ id: contacts.id }).from(contacts).where(eq(contacts.userId, userId));
    const userConversationRows = await db.select({ id: conversations.id }).from(conversations).where(eq(conversations.userId, userId));
    const userEventRows = await db.select({ id: events.id }).from(events).where(eq(events.userId, userId));
    const userReminderRows = await db.select({ id: reminders.id }).from(reminders).where(eq(reminders.userId, userId));

    const contactIds = userContactRows.map((r) => r.id);
    const conversationIds = userConversationRows.map((r) => r.id);
    const eventIds = userEventRows.map((r) => r.id);
    const reminderIds = userReminderRows.map((r) => r.id);

    // Get images for storage cleanup
    const imageRows = contactIds.length > 0
      ? await db.select({ publicId: contactImages.publicId }).from(contactImages).where(inArray(contactImages.contactId, contactIds))
      : [];
    const storagePublicIds = imageRows.map((r) => r.publicId).filter((id): id is string => !!id);

    // Delete all data in a transaction
    await db.transaction(async (tx) => {
      // Junction / dependent tables first
      if (conversationIds.length > 0) {
        await tx.delete(conversationParticipants).where(inArray(conversationParticipants.conversationId, conversationIds));
      }
      if (reminderIds.length > 0) {
        await tx.delete(reminderParticipants).where(inArray(reminderParticipants.reminderId, reminderIds));
      }
      if (eventIds.length > 0) {
        await tx.delete(eventParticipants).where(inArray(eventParticipants.eventId, eventIds));
      }
      if (contactIds.length > 0) {
        await tx.delete(contactTags).where(inArray(contactTags.contactId, contactIds));
        await tx.delete(socialLinks).where(inArray(socialLinks.contactId, contactIds));
        await tx.delete(contactImages).where(inArray(contactImages.contactId, contactIds));
      }

      // Core tables
      await tx.delete(relationships).where(eq(relationships.userId, userId));
      await tx.delete(relationshipTypes).where(eq(relationshipTypes.userId, userId));
      await tx.delete(reminders).where(eq(reminders.userId, userId));
      await tx.delete(conversations).where(eq(conversations.userId, userId));
      await tx.delete(events).where(eq(events.userId, userId));
      await tx.delete(contacts).where(eq(contacts.userId, userId));
      await tx.delete(tags).where(eq(tags.userId, userId));
      await tx.delete(users).where(eq(users.id, userId));
    });

    // Delete images from Supabase Storage (after transaction)
    if (storagePublicIds.length > 0) {
      const adminClient = getAdminClient();
      if (adminClient) {
        const { error: storageError } = await adminClient.storage
          .from(SUPABASE_STORAGE_BUCKET)
          .remove(storagePublicIds);
        if (storageError) {
          console.error("Failed to delete storage files:", storageError);
        }
      }
    }

    // Delete Supabase Auth user
    const adminClient = getAdminClient();
    if (adminClient) {
      const { error: authError } = await adminClient.auth.admin.deleteUser(userId);
      if (authError) {
        console.error("Failed to delete auth user:", authError);
        // Don't fail the request — DB data is already gone
      }
    }

    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting account:", error);
    return c.json({ error: "Failed to delete account" }, 500);
  }
});

export default app;
