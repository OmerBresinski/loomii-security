/**
 * Embedding Generation Processor
 *
 * Processes embedding-generation queue jobs. Takes content from a context bundle,
 * chunks it into ~500-token segments with overlap, generates embeddings via
 * Amazon Titan Embed v2 (1024 dimensions), and upserts into pgvector.
 *
 * Flow:
 * 1. Receive job with { tenantId, documentId, content, metadata? }
 * 2. Chunk content into ~500-token segments with 50-token overlap
 * 3. Generate embeddings via Bedrock (Titan Embed v2)
 * 4. Upsert embeddings into DB (replace old chunks when source updates)
 * 5. Clean up stale chunks (if re-processing reduced chunk count)
 *
 * SLA: Embedding generation completes within 30 seconds per bundle.
 */
import type { Job } from "bullmq";
import { db, insertEmbedding } from "@loomii/db";
import type { EmbeddingGenerationPayload } from "@loomii/queue";
import { chunkContent } from "../lib/chunker";
import { generateEmbeddings } from "../lib/embeddings";
import { logger } from "../lib/logger";

const OVERALL_TIMEOUT_MS = 30_000; // 30 seconds SLA

export async function processEmbeddingGeneration(
  job: Job<EmbeddingGenerationPayload>
): Promise<void> {
  const { tenantId, documentId, content, metadata } = job.data;

  const childLogger = logger.child({
    queue: "embedding-generation",
    jobId: job.id,
    jobName: job.name,
    tenantId,
    documentId,
  });

  childLogger.info("Starting embedding generation");
  const startTime = Date.now();

  // Race against timeout
  const result = await Promise.race([
    generateAndStore({ tenantId, documentId, content, metadata, childLogger }),
    createTimeout(OVERALL_TIMEOUT_MS),
  ]);

  if (result === "TIMEOUT") {
    childLogger.warn("Embedding generation hit 30s timeout");
    return;
  }

  const durationMs = Date.now() - startTime;
  childLogger.info(
    { durationMs, chunkCount: result.chunkCount },
    "Embedding generation completed"
  );
}

function createTimeout(ms: number): Promise<"TIMEOUT"> {
  return new Promise((resolve) => setTimeout(() => resolve("TIMEOUT"), ms));
}

interface GenerateParams {
  tenantId: string;
  documentId: string;
  content: string;
  metadata?: Record<string, unknown>;
  childLogger: typeof logger;
}

interface GenerateResult {
  chunkCount: number;
}

async function generateAndStore(
  params: GenerateParams
): Promise<GenerateResult> {
  const { tenantId, documentId, content, metadata, childLogger } = params;

  // 1. Chunk the content
  const chunks = chunkContent(content);

  if (chunks.length === 0) {
    childLogger.warn("No content to embed (empty after chunking)");
    return { chunkCount: 0 };
  }

  childLogger.info(
    { chunkCount: chunks.length, totalTokens: chunks.reduce((sum, c) => sum + c.tokens, 0) },
    "Content chunked"
  );

  // 2. Generate embeddings via Bedrock Titan Embed v2
  const embeddingResults = await generateEmbeddings(chunks);

  childLogger.info(
    { embeddingsGenerated: embeddingResults.length },
    "Embeddings generated"
  );

  // 3. Upsert embeddings into DB
  // Uses ON CONFLICT (tenant_id, document_id, chunk) DO UPDATE to replace old versions
  // Process in parallel for better throughput (each upsert is independent)
  await Promise.all(
    embeddingResults.map((result) => {
      const id = `${tenantId}_${documentId}_${result.index}`;
      return insertEmbedding(db, {
        id,
        tenantId,
        documentId,
        chunk: result.index,
        content: result.content,
        vector: result.vector,
        metadata: metadata ?? null,
      });
    })
  );

  // 4. Clean up stale chunks (when re-processing reduces chunk count)
  // Delete any chunks with index >= current chunk count for this document
  await db.$executeRaw`
    DELETE FROM embeddings
    WHERE tenant_id = ${tenantId}
      AND document_id = ${documentId}
      AND chunk >= ${chunks.length}
  `;

  childLogger.info(
    { upserted: embeddingResults.length },
    "Embeddings stored in pgvector"
  );

  return { chunkCount: chunks.length };
}
