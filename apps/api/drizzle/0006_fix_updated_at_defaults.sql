-- Fix missing DEFAULT now() on updatedAt columns
-- The Drizzle schema specifies .defaultNow() but some tables were created
-- before this was added, so the DB columns lack the DEFAULT constraint.

ALTER TABLE "accounts" ALTER COLUMN "updatedAt" SET DEFAULT now();
ALTER TABLE "contacts" ALTER COLUMN "updatedAt" SET DEFAULT now();
ALTER TABLE "conversations" ALTER COLUMN "updatedAt" SET DEFAULT now();
ALTER TABLE "events" ALTER COLUMN "updatedAt" SET DEFAULT now();
ALTER TABLE "relationship_types" ALTER COLUMN "updatedAt" SET DEFAULT now();
ALTER TABLE "relationships" ALTER COLUMN "updatedAt" SET DEFAULT now();
ALTER TABLE "sessions" ALTER COLUMN "updatedAt" SET DEFAULT now();
ALTER TABLE "social_links" ALTER COLUMN "updatedAt" SET DEFAULT now();
ALTER TABLE "tags" ALTER COLUMN "updatedAt" SET DEFAULT now();
ALTER TABLE "users" ALTER COLUMN "updatedAt" SET DEFAULT now();
