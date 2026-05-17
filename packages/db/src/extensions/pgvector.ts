import { Prisma, PrismaClient } from "@prisma/client";

/**
 * pgvector helper functions for similarity search.
 * Since the vector column uses Unsupported type, all vector operations
 * must go through $queryRaw / $executeRaw.
 */

export interface VectorSearchOptions {
  tenantId: string;
  vector: number[];
  limit?: number;
  threshold?: number;
}

export interface VectorSearchResult {
  id: string;
  documentId: string;
  chunk: number;
  content: string;
  metadata: unknown;
  similarity: number;
}

/**
 * Perform cosine similarity search against embeddings.
 */
export async function vectorSearch(
  db: PrismaClient,
  options: VectorSearchOptions
): Promise<VectorSearchResult[]> {
  const { tenantId, vector, limit = 10, threshold = 0.7 } = options;
  const vectorStr = `[${vector.join(",")}]`;

  const results = await db.$queryRaw<VectorSearchResult[]>`
    SELECT 
      id,
      document_id as "documentId",
      chunk,
      content,
      metadata,
      1 - (vector <=> ${vectorStr}::vector) as similarity
    FROM embeddings
    WHERE tenant_id = ${tenantId}
      AND 1 - (vector <=> ${vectorStr}::vector) > ${threshold}
    ORDER BY vector <=> ${vectorStr}::vector
    LIMIT ${limit}
  `;

  return results;
}

/**
 * Insert an embedding with its vector.
 */
export async function insertEmbedding(
  db: PrismaClient,
  data: {
    id: string;
    tenantId: string;
    documentId: string;
    chunk: number;
    content: string;
    vector: number[];
    metadata?: unknown;
  }
): Promise<void> {
  const vectorStr = `[${data.vector.join(",")}]`;

  await db.$executeRaw`
    INSERT INTO embeddings (id, tenant_id, document_id, chunk, content, vector, metadata, created_at, updated_at)
    VALUES (
      ${data.id},
      ${data.tenantId},
      ${data.documentId},
      ${data.chunk},
      ${data.content},
      ${vectorStr}::vector,
      ${data.metadata ? JSON.stringify(data.metadata) : null}::jsonb,
      NOW(),
      NOW()
    )
    ON CONFLICT (tenant_id, document_id, chunk) 
    DO UPDATE SET
      content = EXCLUDED.content,
      vector = EXCLUDED.vector,
      metadata = EXCLUDED.metadata,
      updated_at = NOW()
  `;
}
