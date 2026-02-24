ALTER TABLE "assistant_messages" ADD COLUMN "responseTimeMs" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "googleProviderToken" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "googleProviderRefreshToken" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "googleTokenExpiresAt" timestamp with time zone;