import { eq, and } from "drizzle-orm";
import {
  db,
  contacts,
  conversations,
  events,
  reminders,
  tags,
  relationshipTypes,
  relationships,
} from "../../db";

export async function getOwnedContact(userId: string, contactId: string) {
  const [contact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.userId, userId)));
  return contact || null;
}

export async function getOwnedConversation(userId: string, conversationId: string) {
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)));
  return conversation || null;
}

export async function getOwnedEvent(userId: string, eventId: string) {
  const [event] = await db
    .select()
    .from(events)
    .where(and(eq(events.id, eventId), eq(events.userId, userId)));
  return event || null;
}

export async function getOwnedReminder(userId: string, reminderId: string) {
  const [reminder] = await db
    .select()
    .from(reminders)
    .where(and(eq(reminders.id, reminderId), eq(reminders.userId, userId)));
  return reminder || null;
}

export async function getOwnedTag(userId: string, tagId: string) {
  const [tag] = await db
    .select()
    .from(tags)
    .where(and(eq(tags.id, tagId), eq(tags.userId, userId)));
  return tag || null;
}

export async function getOwnedRelationshipType(userId: string, typeId: string) {
  const [type] = await db
    .select()
    .from(relationshipTypes)
    .where(and(eq(relationshipTypes.id, typeId), eq(relationshipTypes.userId, userId)));
  return type || null;
}

export async function getOwnedRelationship(userId: string, relationshipId: string) {
  const [relationship] = await db
    .select()
    .from(relationships)
    .where(and(eq(relationships.id, relationshipId), eq(relationships.userId, userId)));
  return relationship || null;
}
