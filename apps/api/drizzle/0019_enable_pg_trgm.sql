-- Enable pg_trgm for fuzzy contact search (similarity() / word_similarity()).
-- Contact search in /api/contacts?search= and the assistant contact tools rely
-- on these functions; without the extension every search query 500s with
-- "function similarity(text, text) does not exist".
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Trigram GIN indexes so fuzzy search stays fast as the contact list grows.
CREATE INDEX IF NOT EXISTS "contacts_displayName_trgm_idx"
  ON "contacts" USING gin ("displayName" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "contacts_company_trgm_idx"
  ON "contacts" USING gin ("company" gin_trgm_ops);
