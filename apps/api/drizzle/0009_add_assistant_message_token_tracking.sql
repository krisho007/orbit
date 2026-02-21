ALTER TABLE "assistant_messages" ADD COLUMN IF NOT EXISTS "modelName" text;
ALTER TABLE "assistant_messages" ADD COLUMN IF NOT EXISTS "inputTokens" integer;
ALTER TABLE "assistant_messages" ADD COLUMN IF NOT EXISTS "outputTokens" integer;
