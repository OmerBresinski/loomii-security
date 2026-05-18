/**
 * Embedding Generation Client
 *
 * Uses the AI SDK's `embedMany` function with Amazon Bedrock's
 * Titan Embed Text v2 model to generate 1024-dimensional vectors.
 *
 * Rate limiting: Bedrock has per-model token-per-minute limits.
 * The AI SDK handles retries automatically (maxRetries: 2 by default).
 */
import { embedMany } from "ai";
import { bedrock } from "./bedrock";

/**
 * Amazon Titan Embed Text v2 - 1024 dimensions.
 * Must be enabled in AWS Bedrock Model Access console.
 */
const EMBEDDING_MODEL_ID = "amazon.titan-embed-text-v2:0";

/** Maximum values per embedMany call (Titan Embed v2 supports up to 25) */
const MAX_BATCH_SIZE = 25;

export interface EmbeddingResult {
  /** The chunk index this embedding corresponds to */
  index: number;
  /** The text that was embedded */
  content: string;
  /** The 1024-dimensional embedding vector */
  vector: number[];
}

/**
 * Generate embeddings for an array of text chunks using Titan Embed v2.
 *
 * Automatically batches requests if there are more than MAX_BATCH_SIZE chunks.
 * Uses AI SDK's built-in retry logic (default: 2 retries).
 *
 * @param chunks - Array of text strings to embed
 * @returns Array of EmbeddingResult with vectors in the same order as input
 */
export async function generateEmbeddings(
  chunks: Array<{ index: number; content: string }>
): Promise<EmbeddingResult[]> {
  if (chunks.length === 0) {
    return [];
  }

  const model = bedrock.embeddingModel(EMBEDDING_MODEL_ID);
  const results: EmbeddingResult[] = [];

  // Process in batches to respect Bedrock limits
  for (let i = 0; i < chunks.length; i += MAX_BATCH_SIZE) {
    const batch = chunks.slice(i, i + MAX_BATCH_SIZE);

    const { embeddings } = await embedMany({
      model,
      values: batch.map((c) => c.content),
      // 30s timeout per batch to stay within overall 30s SLA
      abortSignal: AbortSignal.timeout(30_000),
    });

    for (let j = 0; j < batch.length; j++) {
      results.push({
        index: batch[j].index,
        content: batch[j].content,
        vector: embeddings[j],
      });
    }
  }

  return results;
}

/**
 * Generate a single embedding for a query string.
 * Used for semantic search queries.
 */
export async function generateQueryEmbedding(query: string): Promise<number[]> {
  const model = bedrock.embeddingModel(EMBEDDING_MODEL_ID);

  const { embeddings } = await embedMany({
    model,
    values: [query],
    abortSignal: AbortSignal.timeout(10_000),
  });

  return embeddings[0];
}
