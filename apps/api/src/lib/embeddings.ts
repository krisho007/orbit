import { embed, embedMany } from "ai";
import { google } from "@ai-sdk/google";

const embeddingModel = google.embedding("text-embedding-004");

/**
 * Build enriched text for embedding a conversation.
 * Format: [MEDIUM] phone call | [PARTICIPANTS] Alice, Bob | [CONTENT] discussed budget...
 */
export function buildEmbeddingText({
  content,
  medium,
  participantNames,
}: {
  content?: string | null;
  medium?: string;
  participantNames?: string[];
}): string {
  const parts: string[] = [];

  if (medium) {
    parts.push(`[MEDIUM] ${medium.toLowerCase().replace(/_/g, " ")}`);
  }

  if (participantNames && participantNames.length > 0) {
    parts.push(`[PARTICIPANTS] ${participantNames.join(", ")}`);
  }

  if (content) {
    parts.push(`[CONTENT] ${content}`);
  }

  return parts.join(" | ");
}

/**
 * Generate an embedding for a document (conversation content).
 * Uses RETRIEVAL_DOCUMENT task type for storage.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: embeddingModel,
    value: text,
    providerOptions: {
      google: { taskType: "RETRIEVAL_DOCUMENT" },
    },
  });
  return embedding;
}

/**
 * Generate an embedding for a search query.
 * Uses RETRIEVAL_QUERY task type for asymmetric search.
 */
export async function generateQueryEmbedding(query: string): Promise<number[]> {
  const { embedding } = await embed({
    model: embeddingModel,
    value: query,
    providerOptions: {
      google: { taskType: "RETRIEVAL_QUERY" },
    },
  });
  return embedding;
}

/**
 * Batch-embed multiple documents using embedMany().
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const { embeddings } = await embedMany({
    model: embeddingModel,
    values: texts,
    providerOptions: {
      google: { taskType: "RETRIEVAL_DOCUMENT" },
    },
  });
  return embeddings;
}
