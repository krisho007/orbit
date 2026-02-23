ALTER TABLE "events" ADD COLUMN "embedding" vector(768);--> statement-breakpoint
CREATE INDEX "events_embedding_idx" ON "events" USING hnsw ("embedding" vector_cosine_ops);
