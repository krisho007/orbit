// Users API Routes
import { Hono } from "hono";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db, users, contacts } from "../db";
import { authMiddleware } from "../middleware/auth";

const app = new Hono();

app.use("/*", authMiddleware);

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
    return c.json({ error: validation.error.issues }, 400);
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

export default app;
