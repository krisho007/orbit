import { eq, and, desc, sql, or } from "drizzle-orm";
import { db, users, contacts } from "../../db";
import type { UserContext } from "./types";
import { getOwnedContact } from "./ownership";

let pgTrgmReady = false;

export async function ensurePgTrgmExtension(): Promise<void> {
  if (pgTrgmReady) return;
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
  pgTrgmReady = true;
}

// Fuzzy search for contacts
export async function findBestContactMatch(userId: string, name: string) {
  console.log(`[assistant:tool] findBestContactMatch — searching for "${name}"`);
  await ensurePgTrgmExtension();

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
    .limit(1);

  if (rows.length > 0) {
    console.log(`[assistant:tool] findBestContactMatch — found: "${rows[0].displayName}" (similarity match)`);
    return rows[0] as { id: string; displayName: string };
  }

  console.log(`[assistant:tool] findBestContactMatch — no match found for "${name}"`);
  return null;
}

export async function getUserContext(userId: string): Promise<UserContext> {
  try {
    const [user] = await db
      .select({
        name: users.name,
        email: users.email,
        primaryContactId: users.primaryContactId,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return { userName: null, userEmail: "", primaryContactId: null, primaryContactName: null };
    }

    let primaryContactName: string | null = null;
    if (user.primaryContactId) {
      const [contact] = await db
        .select({ displayName: contacts.displayName })
        .from(contacts)
        .where(and(eq(contacts.id, user.primaryContactId), eq(contacts.userId, userId)))
        .limit(1);
      primaryContactName = contact?.displayName ?? null;
    }

    return {
      userName: user.name,
      userEmail: user.email,
      primaryContactId: user.primaryContactId,
      primaryContactName,
    };
  } catch (error) {
    console.warn("[assistant:user-context] Failed to load user context:", error);
    return { userName: null, userEmail: "", primaryContactId: null, primaryContactName: null };
  }
}

export async function resolveContactId(
  userId: string,
  contactId?: string,
  contactName?: string
): Promise<string | null> {
  if (contactId) {
    const contact = await getOwnedContact(userId, contactId);
    return contact?.id ?? null;
  }

  if (contactName) {
    const contact = await findBestContactMatch(userId, contactName);
    return contact?.id ?? null;
  }

  return null;
}

export async function resolveContactIdsFromNames(userId: string, names: string[]) {
  const resolvedIds: string[] = [];
  const missing: string[] = [];

  for (const name of names) {
    const contact = await findBestContactMatch(userId, name);
    if (contact) {
      resolvedIds.push(contact.id);
    } else {
      missing.push(name);
    }
  }

  return {
    ids: [...new Set(resolvedIds)],
    missing,
  };
}
