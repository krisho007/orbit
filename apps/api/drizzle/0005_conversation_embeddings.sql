-- Enable pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column to conversations table
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "embedding" vector(768);

-- Create HNSW index for cosine similarity search
CREATE INDEX IF NOT EXISTS "conversations_embedding_idx" ON "conversations" USING hnsw ("embedding" vector_cosine_ops);
