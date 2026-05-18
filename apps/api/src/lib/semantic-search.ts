/**
 * Semantic Search Library
 *
 * Generates a query embedding via Amazon Titan Embed v2 and performs
 * cosine similarity search against the pgvector Embedding table.
 *
 * All searches are tenant-scoped (NEVER returns another tenant's content).
 */
import { embed } from "ai";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { db, vectorSearch, type VectorSearchResult } from "@loomii/db";

/**
 * Bedrock provider for embedding generation.
 * Reads AWS credentials from environment (same as workers).
 */
const bedrock = createAmazonBedrock({
  region: process.env.AWS_REGION ?? "us-east-1",
});

const EMBEDDING_MODEL_ID = "amazon.titan-embed-text-v2:0";

export interface SearchOptions {
  /** The search query text */
  query: string;
  /** The tenant to scope results to */
  tenantId: string;
  /** Max results to return (default: 10, max: 50) */
  limit?: number;
  /** Minimum similarity threshold (default: 0.3) */
  threshold?: number;
}

export interface SearchResult {
  /** Embedding record ID */
  id: string;
  /** The source document ID (contextBundle ID, etc.) */
  documentId: string;
  /** Chunk index within the document */
  chunk: number;
  /** The text content of this chunk */
  content: string;
  /** Metadata (sourceType, sourceId, etc.) */
  metadata: unknown;
  /** Cosine similarity score (0-1, higher = more similar) */
  similarity: number;
}

/**
 * Perform semantic search for a query within a tenant's embeddings.
 *
 * 1. Generates an embedding for the query text via Titan Embed v2
 * 2. Runs cosine similarity search against pgvector (tenant-scoped)
 * 3. Returns ranked results with similarity scores
 *
 * @param options - Search parameters
 * @returns Array of search results ordered by relevance (highest similarity first)
 */
export async function semanticSearch(
  options: SearchOptions
): Promise<SearchResult[]> {
  const { query, tenantId, limit = 10, threshold = 0.3 } = options;

  // Clamp limit to valid range
  const effectiveLimit = Math.min(Math.max(1, limit), 50);

  // 1. Generate query embedding
  const model = bedrock.embeddingModel(EMBEDDING_MODEL_ID);
  const { embedding } = await embed({
    model,
    value: query,
    abortSignal: AbortSignal.timeout(10_000), // 10s timeout for embedding
  });

  // 2. Perform vector similarity search (tenant-scoped)
  const results = await vectorSearch(db, {
    tenantId,
    vector: embedding,
    limit: effectiveLimit,
    threshold,
  });

  // 3. Map to response shape
  return results.map((r: VectorSearchResult) => ({
    id: r.id,
    documentId: r.documentId,
    chunk: r.chunk,
    content: r.content,
    metadata: r.metadata,
    similarity: r.similarity,
  }));
}
