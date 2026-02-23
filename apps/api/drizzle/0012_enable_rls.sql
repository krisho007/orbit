-- Enable Row Level Security on all tables
-- The API uses Supabase service role key which bypasses RLS,
-- so this has zero impact on API operations.
-- This locks down direct access via the anon/public key.

-- Tables with userId (direct tenant isolation)
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contacts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reminders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "relationship_types" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "relationships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assistant_conversations" ENABLE ROW LEVEL SECURITY;

-- Junction / child tables (no userId, linked via parent)
ALTER TABLE "contact_tags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "conversation_participants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reminder_participants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "event_participants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "social_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contact_images" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assistant_messages" ENABLE ROW LEVEL SECURITY;
