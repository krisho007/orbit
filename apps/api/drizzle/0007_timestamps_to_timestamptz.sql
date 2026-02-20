-- Convert all timestamp columns from "timestamp without time zone" to "timestamp with time zone"
-- PostgreSQL interprets existing values as being in the server's current timezone (UTC for Supabase),
-- so "2024-01-15 10:00:00" becomes "2024-01-15 10:00:00+00". No data loss.

-- users
ALTER TABLE "users" ALTER COLUMN "emailVerified" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "createdAt" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp with time zone;--> statement-breakpoint

-- contacts
ALTER TABLE "contacts" ALTER COLUMN "dateOfBirth" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contacts" ALTER COLUMN "createdAt" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contacts" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp with time zone;--> statement-breakpoint

-- tags
ALTER TABLE "tags" ALTER COLUMN "createdAt" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tags" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp with time zone;--> statement-breakpoint

-- contact_tags
ALTER TABLE "contact_tags" ALTER COLUMN "createdAt" SET DATA TYPE timestamp with time zone;--> statement-breakpoint

-- conversations
ALTER TABLE "conversations" ALTER COLUMN "happenedAt" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "conversations" ALTER COLUMN "followUpAt" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "conversations" ALTER COLUMN "createdAt" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "conversations" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp with time zone;--> statement-breakpoint

-- conversation_participants
ALTER TABLE "conversation_participants" ALTER COLUMN "createdAt" SET DATA TYPE timestamp with time zone;--> statement-breakpoint

-- reminders
ALTER TABLE "reminders" ALTER COLUMN "dueAt" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reminders" ALTER COLUMN "recurrenceEndsAt" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reminders" ALTER COLUMN "createdAt" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reminders" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp with time zone;--> statement-breakpoint

-- reminder_participants
ALTER TABLE "reminder_participants" ALTER COLUMN "createdAt" SET DATA TYPE timestamp with time zone;--> statement-breakpoint

-- events
ALTER TABLE "events" ALTER COLUMN "startAt" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "endAt" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "createdAt" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp with time zone;--> statement-breakpoint

-- event_participants
ALTER TABLE "event_participants" ALTER COLUMN "createdAt" SET DATA TYPE timestamp with time zone;--> statement-breakpoint

-- relationship_types
ALTER TABLE "relationship_types" ALTER COLUMN "createdAt" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "relationship_types" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp with time zone;--> statement-breakpoint

-- relationships
ALTER TABLE "relationships" ALTER COLUMN "createdAt" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "relationships" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp with time zone;--> statement-breakpoint

-- social_links
ALTER TABLE "social_links" ALTER COLUMN "createdAt" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "social_links" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp with time zone;--> statement-breakpoint

-- contact_images
ALTER TABLE "contact_images" ALTER COLUMN "createdAt" SET DATA TYPE timestamp with time zone;--> statement-breakpoint

-- assistant_conversations
ALTER TABLE "assistant_conversations" ALTER COLUMN "createdAt" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "assistant_conversations" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp with time zone;--> statement-breakpoint

-- assistant_messages
ALTER TABLE "assistant_messages" ALTER COLUMN "createdAt" SET DATA TYPE timestamp with time zone;
