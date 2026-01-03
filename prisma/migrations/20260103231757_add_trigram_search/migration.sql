-- Enable pg_trgm extension for trigram-based fuzzy search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create GIN index on displayName for efficient trigram search
CREATE INDEX IF NOT EXISTS "contacts_displayName_trgm_idx"
ON "contacts" USING GIN ("displayName" gin_trgm_ops);

-- Create GIN index on company for fuzzy search
CREATE INDEX IF NOT EXISTS "contacts_company_trgm_idx"
ON "contacts" USING GIN ("company" gin_trgm_ops);
