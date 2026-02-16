-- New enum for assistant message roles
CREATE TYPE "public"."AssistantMessageRole" AS ENUM('user', 'assistant');--> statement-breakpoint

-- Assistant conversations table
CREATE TABLE "assistant_conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"title" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

-- Assistant messages table
CREATE TABLE "assistant_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"assistantConversationId" text NOT NULL,
	"role" "AssistantMessageRole" NOT NULL,
	"content" text NOT NULL,
	"ui" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

-- Indexes for assistant_conversations
CREATE INDEX "assistant_conversations_userId_idx" ON "assistant_conversations" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "assistant_conversations_userId_updatedAt_idx" ON "assistant_conversations" USING btree ("userId","updatedAt");--> statement-breakpoint

-- Indexes for assistant_messages
CREATE INDEX "assistant_messages_conversationId_idx" ON "assistant_messages" USING btree ("assistantConversationId");--> statement-breakpoint
CREATE INDEX "assistant_messages_convId_createdAt_idx" ON "assistant_messages" USING btree ("assistantConversationId","createdAt");--> statement-breakpoint

-- Add assistantConversationId FK columns to core entity tables
ALTER TABLE "contacts" ADD COLUMN "assistantConversationId" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "assistantConversationId" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "assistantConversationId" text;--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN "assistantConversationId" text;
