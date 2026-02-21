ALTER TABLE "assistant_messages" ADD COLUMN IF NOT EXISTS "thumbsUp" boolean NOT NULL DEFAULT false;
ALTER TABLE "assistant_messages" ADD COLUMN IF NOT EXISTS "thumbsDown" boolean NOT NULL DEFAULT false;
