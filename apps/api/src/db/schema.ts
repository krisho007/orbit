// Drizzle ORM Schema - Ported from Prisma
// All models include userId for multi-tenancy isolation

import {
  pgTable,
  text,
  timestamp,
  pgEnum,
  boolean,
  integer,
  primaryKey,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ============================================
// Enums
// ============================================

export const genderEnum = pgEnum("Gender", ["MALE", "FEMALE"]);

export const conversationMediumEnum = pgEnum("ConversationMedium", [
  "PHONE_CALL",
  "WHATSAPP",
  "EMAIL",
  "CHANCE_ENCOUNTER",
  "ONLINE_MEETING",
  "IN_PERSON_MEETING",
  "OTHER",
]);

export const eventTypeEnum = pgEnum("EventType", [
  "MEETING",
  "CALL",
  "BIRTHDAY",
  "ANNIVERSARY",
  "CONFERENCE",
  "SOCIAL",
  "FAMILY_EVENT",
  "OTHER",
]);

// ============================================
// Users (Supabase Auth - reference only)
// ============================================

// Note: Users are managed by Supabase Auth
// This table references the auth.users table
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow().notNull(),
});

// ============================================
// Core CRM Models
// ============================================

export const contacts = pgTable(
  "contacts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("userId").notNull(),
    displayName: text("displayName").notNull(),
    googleContactName: text("googleContactName"),
    primaryPhone: text("primaryPhone"),
    primaryEmail: text("primaryEmail"),
    dateOfBirth: timestamp("dateOfBirth", { mode: "date" }),
    gender: genderEnum("gender"),
    company: text("company"),
    jobTitle: text("jobTitle"),
    location: text("location"),
    notes: text("notes"),
    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("contacts_userId_idx").on(table.userId),
    index("contacts_userId_displayName_idx").on(table.userId, table.displayName),
    index("contacts_userId_googleContactName_idx").on(table.userId, table.googleContactName),
  ]
);

export const tags = pgTable(
  "tags",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("userId").notNull(),
    name: text("name").notNull(),
    color: text("color").default("#3B82F6"),
    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    unique("tags_userId_name_unique").on(table.userId, table.name),
    index("tags_userId_idx").on(table.userId),
  ]
);

export const contactTags = pgTable(
  "contact_tags",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    contactId: text("contactId").notNull(),
    tagId: text("tagId").notNull(),
    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    unique("contact_tags_contactId_tagId_unique").on(table.contactId, table.tagId),
    index("contact_tags_contactId_idx").on(table.contactId),
    index("contact_tags_tagId_idx").on(table.tagId),
  ]
);

// ============================================
// Conversation Models
// ============================================

export const conversations = pgTable(
  "conversations",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("userId").notNull(),
    content: text("content"),
    medium: conversationMediumEnum("medium").notNull(),
    happenedAt: timestamp("happenedAt", { mode: "date" }).notNull(),
    followUpAt: timestamp("followUpAt", { mode: "date" }),
    eventId: text("eventId"),
    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("conversations_userId_idx").on(table.userId),
    index("conversations_userId_happenedAt_idx").on(table.userId, table.happenedAt),
    index("conversations_eventId_idx").on(table.eventId),
  ]
);

export const conversationParticipants = pgTable(
  "conversation_participants",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    conversationId: text("conversationId").notNull(),
    contactId: text("contactId").notNull(),
    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    unique("conversation_participants_unique").on(table.conversationId, table.contactId),
    index("conversation_participants_conversationId_idx").on(table.conversationId),
    index("conversation_participants_contactId_idx").on(table.contactId),
  ]
);

// ============================================
// Event Models
// ============================================

export const events = pgTable(
  "events",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("userId").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    eventType: eventTypeEnum("eventType").notNull(),
    startAt: timestamp("startAt", { mode: "date" }).notNull(),
    endAt: timestamp("endAt", { mode: "date" }),
    location: text("location"),
    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("events_userId_idx").on(table.userId),
    index("events_userId_startAt_idx").on(table.userId, table.startAt),
  ]
);

export const eventParticipants = pgTable(
  "event_participants",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    eventId: text("eventId").notNull(),
    contactId: text("contactId").notNull(),
    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    unique("event_participants_unique").on(table.eventId, table.contactId),
    index("event_participants_eventId_idx").on(table.eventId),
    index("event_participants_contactId_idx").on(table.contactId),
  ]
);

// ============================================
// Relationship Models
// ============================================

export const relationshipTypes = pgTable(
  "relationship_types",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("userId").notNull(),
    name: text("name").notNull(),
    reverseTypeId: text("reverseTypeId"),
    maleReverseTypeId: text("maleReverseTypeId"),
    femaleReverseTypeId: text("femaleReverseTypeId"),
    isSymmetric: boolean("isSymmetric").default(false).notNull(),
    isSystem: boolean("isSystem").default(false).notNull(),
    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    unique("relationship_types_userId_name_unique").on(table.userId, table.name),
    index("relationship_types_userId_idx").on(table.userId),
  ]
);

export const relationships = pgTable(
  "relationships",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("userId").notNull(),
    fromContactId: text("fromContactId").notNull(),
    toContactId: text("toContactId").notNull(),
    typeId: text("typeId").notNull(),
    notes: text("notes"),
    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    unique("relationships_unique").on(table.fromContactId, table.toContactId, table.typeId),
    index("relationships_userId_idx").on(table.userId),
    index("relationships_fromContactId_idx").on(table.fromContactId),
    index("relationships_toContactId_idx").on(table.toContactId),
    index("relationships_typeId_idx").on(table.typeId),
  ]
);

// ============================================
// Social Links & Images
// ============================================

export const socialLinks = pgTable(
  "social_links",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    contactId: text("contactId").notNull(),
    platform: text("platform").notNull(),
    url: text("url").notNull(),
    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [index("social_links_contactId_idx").on(table.contactId)]
);

export const contactImages = pgTable(
  "contact_images",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    contactId: text("contactId").notNull(),
    imageUrl: text("imageUrl").notNull(),
    publicId: text("publicId"),
    order: integer("order").default(0).notNull(),
    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [index("contact_images_contactId_idx").on(table.contactId)]
);

// ============================================
// Relations
// ============================================

export const contactsRelations = relations(contacts, ({ many }) => ({
  tags: many(contactTags),
  conversationParticipants: many(conversationParticipants),
  eventParticipants: many(eventParticipants),
  relationshipsFrom: many(relationships, { relationName: "fromContact" }),
  relationshipsTo: many(relationships, { relationName: "toContact" }),
  socialLinks: many(socialLinks),
  images: many(contactImages),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  contacts: many(contactTags),
}));

export const contactTagsRelations = relations(contactTags, ({ one }) => ({
  contact: one(contacts, {
    fields: [contactTags.contactId],
    references: [contacts.id],
  }),
  tag: one(tags, {
    fields: [contactTags.tagId],
    references: [tags.id],
  }),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  event: one(events, {
    fields: [conversations.eventId],
    references: [events.id],
  }),
  participants: many(conversationParticipants),
}));

export const conversationParticipantsRelations = relations(conversationParticipants, ({ one }) => ({
  conversation: one(conversations, {
    fields: [conversationParticipants.conversationId],
    references: [conversations.id],
  }),
  contact: one(contacts, {
    fields: [conversationParticipants.contactId],
    references: [contacts.id],
  }),
}));

export const eventsRelations = relations(events, ({ many }) => ({
  participants: many(eventParticipants),
  conversations: many(conversations),
}));

export const eventParticipantsRelations = relations(eventParticipants, ({ one }) => ({
  event: one(events, {
    fields: [eventParticipants.eventId],
    references: [events.id],
  }),
  contact: one(contacts, {
    fields: [eventParticipants.contactId],
    references: [contacts.id],
  }),
}));

export const relationshipsRelations = relations(relationships, ({ one }) => ({
  fromContact: one(contacts, {
    fields: [relationships.fromContactId],
    references: [contacts.id],
    relationName: "fromContact",
  }),
  toContact: one(contacts, {
    fields: [relationships.toContactId],
    references: [contacts.id],
    relationName: "toContact",
  }),
  type: one(relationshipTypes, {
    fields: [relationships.typeId],
    references: [relationshipTypes.id],
  }),
}));

export const socialLinksRelations = relations(socialLinks, ({ one }) => ({
  contact: one(contacts, {
    fields: [socialLinks.contactId],
    references: [contacts.id],
  }),
}));

export const contactImagesRelations = relations(contactImages, ({ one }) => ({
  contact: one(contacts, {
    fields: [contactImages.contactId],
    references: [contacts.id],
  }),
}));

// ============================================
// Type Exports
// ============================================

export type User = typeof users.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;
export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type Relationship = typeof relationships.$inferSelect;
export type RelationshipType = typeof relationshipTypes.$inferSelect;
export type SocialLink = typeof socialLinks.$inferSelect;
export type ContactImage = typeof contactImages.$inferSelect;
