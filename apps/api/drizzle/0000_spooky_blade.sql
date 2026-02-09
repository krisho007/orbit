DO $$ BEGIN
    CREATE TYPE "public"."ConversationMedium" AS ENUM('PHONE_CALL', 'WHATSAPP', 'EMAIL', 'CHANCE_ENCOUNTER', 'ONLINE_MEETING', 'IN_PERSON_MEETING', 'OTHER');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
    CREATE TYPE "public"."EventType" AS ENUM('MEETING', 'CALL', 'BIRTHDAY', 'ANNIVERSARY', 'CONFERENCE', 'SOCIAL', 'FAMILY_EVENT', 'OTHER');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
    CREATE TYPE "public"."Gender" AS ENUM('MALE', 'FEMALE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
    CREATE TYPE "public"."ReminderRecurrence" AS ENUM('NONE', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
    CREATE TYPE "public"."ReminderStatus" AS ENUM('OPEN', 'DONE', 'CANCELED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contact_images" (
	"id" text PRIMARY KEY NOT NULL,
	"contactId" text NOT NULL,
	"imageUrl" text NOT NULL,
	"publicId" text,
	"order" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contact_tags" (
	"id" text PRIMARY KEY NOT NULL,
	"contactId" text NOT NULL,
	"tagId" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "contact_tags_contactId_tagId_unique" UNIQUE("contactId","tagId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"displayName" text NOT NULL,
	"googleContactName" text,
	"primaryPhone" text,
	"primaryEmail" text,
	"dateOfBirth" timestamp,
	"gender" "Gender",
	"company" text,
	"jobTitle" text,
	"location" text,
	"notes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversation_participants" (
	"id" text PRIMARY KEY NOT NULL,
	"conversationId" text NOT NULL,
	"contactId" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_participants_unique" UNIQUE("conversationId","contactId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"content" text,
	"medium" "ConversationMedium" NOT NULL,
	"happenedAt" timestamp NOT NULL,
	"followUpAt" timestamp,
	"eventId" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_participants" (
	"id" text PRIMARY KEY NOT NULL,
	"eventId" text NOT NULL,
	"contactId" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "event_participants_unique" UNIQUE("eventId","contactId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "events" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"eventType" "EventType" NOT NULL,
	"startAt" timestamp NOT NULL,
	"endAt" timestamp,
	"location" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "relationship_types" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"name" text NOT NULL,
	"reverseTypeId" text,
	"maleReverseTypeId" text,
	"femaleReverseTypeId" text,
	"isSymmetric" boolean DEFAULT false NOT NULL,
	"isSystem" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "relationship_types_userId_name_unique" UNIQUE("userId","name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "relationships" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"fromContactId" text NOT NULL,
	"toContactId" text NOT NULL,
	"typeId" text NOT NULL,
	"notes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "relationships_unique" UNIQUE("fromContactId","toContactId","typeId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reminder_participants" (
	"id" text PRIMARY KEY NOT NULL,
	"reminderId" text NOT NULL,
	"contactId" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "reminder_participants_unique" UNIQUE("reminderId","contactId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reminders" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"title" text NOT NULL,
	"notes" text,
	"dueAt" timestamp NOT NULL,
	"status" "ReminderStatus" DEFAULT 'OPEN' NOT NULL,
	"recurrence" "ReminderRecurrence" DEFAULT 'NONE' NOT NULL,
	"recurrenceInterval" integer DEFAULT 1 NOT NULL,
	"recurrenceEndsAt" timestamp,
	"conversationId" text,
	"isAutoFromConversation" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "social_links" (
	"id" text PRIMARY KEY NOT NULL,
	"contactId" text NOT NULL,
	"platform" text NOT NULL,
	"url" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tags" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#3B82F6',
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tags_userId_name_unique" UNIQUE("userId","name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"emailVerified" timestamp,
	"image" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contact_images_contactId_idx" ON "contact_images" USING btree ("contactId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contact_tags_contactId_idx" ON "contact_tags" USING btree ("contactId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contact_tags_tagId_idx" ON "contact_tags" USING btree ("tagId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_userId_idx" ON "contacts" USING btree ("userId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_userId_displayName_idx" ON "contacts" USING btree ("userId","displayName");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_userId_googleContactName_idx" ON "contacts" USING btree ("userId","googleContactName");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversation_participants_conversationId_idx" ON "conversation_participants" USING btree ("conversationId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversation_participants_contactId_idx" ON "conversation_participants" USING btree ("contactId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversations_userId_idx" ON "conversations" USING btree ("userId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversations_userId_happenedAt_idx" ON "conversations" USING btree ("userId","happenedAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversations_eventId_idx" ON "conversations" USING btree ("eventId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_participants_eventId_idx" ON "event_participants" USING btree ("eventId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_participants_contactId_idx" ON "event_participants" USING btree ("contactId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_userId_idx" ON "events" USING btree ("userId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_userId_startAt_idx" ON "events" USING btree ("userId","startAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "relationship_types_userId_idx" ON "relationship_types" USING btree ("userId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "relationships_userId_idx" ON "relationships" USING btree ("userId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "relationships_fromContactId_idx" ON "relationships" USING btree ("fromContactId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "relationships_toContactId_idx" ON "relationships" USING btree ("toContactId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "relationships_typeId_idx" ON "relationships" USING btree ("typeId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reminder_participants_reminderId_idx" ON "reminder_participants" USING btree ("reminderId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reminder_participants_contactId_idx" ON "reminder_participants" USING btree ("contactId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reminders_userId_idx" ON "reminders" USING btree ("userId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reminders_userId_dueAt_idx" ON "reminders" USING btree ("userId","dueAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reminders_userId_status_idx" ON "reminders" USING btree ("userId","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reminders_conversationId_idx" ON "reminders" USING btree ("conversationId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_links_contactId_idx" ON "social_links" USING btree ("contactId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tags_userId_idx" ON "tags" USING btree ("userId");
