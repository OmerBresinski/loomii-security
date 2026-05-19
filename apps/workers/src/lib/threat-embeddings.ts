/**
 * Threat Embeddings
 *
 * Embeds threat descriptions directly into pgvector for semantic search.
 * Threats are short (<500 tokens each), so no chunking is needed —
 * each threat gets a single embedding at chunkIndex=0.
 *
 * Uses the same Titan Embed v2 infrastructure from LOO-135 but
 * operates synchronously (not via queue) for immediate availability.
 *
 * Upsert semantics: modified threats get their embedding replaced,
 * not duplicated. Key: (tenantId, documentId='threat_{id}', chunk=0).
 *
 * SLA: 50 threats embedded in <30 seconds.
 */
import { db, insertEmbedding } from "@loomii/db";
import { generateEmbeddings } from "./embeddings";
import { logger } from "./logger";

export interface EmbedThreatsResult {
  embedded: number;
  durationMs: number;
}

/**
 * Embed all active (non-deprecated) threats for a threat model.
 *
 * Fetches threats from DB, generates embeddings via Titan Embed v2,
 * and upserts into the Embedding table. Tenant-scoped via tenantId.
 *
 * @param tenantId - Tenant scope for the embeddings
 * @param threatModelId - The threat model to embed threats from
 */
export async function embedThreats(
  tenantId: string,
  threatModelId: string
): Promise<EmbedThreatsResult> {
  const childLogger = logger.child({
    module: "threat-embeddings",
    tenantId,
    threatModelId,
  });

  const startTime = Date.now();

  // 1. Fetch all active threats
  const threats = await db.tmThreat.findMany({
    where: { threatModelId, isDeprecated: false },
    select: {
      id: true,
      title: true,
      description: true,
      strideCategory: true,
      severity: true,
      likelihood: true,
    },
  });

  if (threats.length === 0) {
    childLogger.info("No threats to embed");
    return { embedded: 0, durationMs: Date.now() - startTime };
  }

  childLogger.info({ count: threats.length }, "Embedding threats");

  // 2. Build embedding content for each threat
  // Format: "[STRIDE_CATEGORY] Title: Description"
  // This format enables semantic search by category, title, or description
  const chunks = threats.map((threat, index) => ({
    index,
    content: buildThreatEmbeddingContent(threat),
  }));

  // 3. Generate embeddings via Titan Embed v2
  const embeddingResults = await generateEmbeddings(chunks);

  // 4. Upsert each embedding into pgvector
  // documentId format: "threat_{threatId}" ensures upsert replaces on modification
  await Promise.all(
    embeddingResults.map((result, i) => {
      const threat = threats[i]!;
      const documentId = `threat_${threat.id}`;

      return insertEmbedding(db, {
        id: `${tenantId}_${documentId}_0`,
        tenantId,
        documentId,
        chunk: 0, // No chunking needed for threats
        content: result.content,
        vector: result.vector,
        metadata: {
          sourceType: "threat",
          threatId: threat.id,
          threatModelId,
          strideCategory: threat.strideCategory,
          severity: threat.severity,
        },
      });
    })
  );

  const durationMs = Date.now() - startTime;

  childLogger.info(
    { embedded: threats.length, durationMs },
    "Threat embedding complete"
  );

  return { embedded: threats.length, durationMs };
}

/**
 * Embed a subset of threats (e.g., only modified ones during incremental update).
 *
 * @param tenantId - Tenant scope
 * @param threatModelId - The threat model
 * @param threatIds - Specific threat IDs to embed
 */
export async function embedSpecificThreats(
  tenantId: string,
  threatModelId: string,
  threatIds: string[]
): Promise<EmbedThreatsResult> {
  const childLogger = logger.child({
    module: "threat-embeddings",
    tenantId,
    threatModelId,
  });

  const startTime = Date.now();

  if (threatIds.length === 0) {
    return { embedded: 0, durationMs: 0 };
  }

  // Fetch the specific threats
  const threats = await db.tmThreat.findMany({
    where: { id: { in: threatIds }, isDeprecated: false },
    select: {
      id: true,
      title: true,
      description: true,
      strideCategory: true,
      severity: true,
      likelihood: true,
    },
  });

  if (threats.length === 0) {
    return { embedded: 0, durationMs: Date.now() - startTime };
  }

  const chunks = threats.map((threat, index) => ({
    index,
    content: buildThreatEmbeddingContent(threat),
  }));

  const embeddingResults = await generateEmbeddings(chunks);

  await Promise.all(
    embeddingResults.map((result, i) => {
      const threat = threats[i]!;
      const documentId = `threat_${threat.id}`;

      return insertEmbedding(db, {
        id: `${tenantId}_${documentId}_0`,
        tenantId,
        documentId,
        chunk: 0,
        content: result.content,
        vector: result.vector,
        metadata: {
          sourceType: "threat",
          threatId: threat.id,
          threatModelId,
          strideCategory: threat.strideCategory,
          severity: threat.severity,
        },
      });
    })
  );

  const durationMs = Date.now() - startTime;

  childLogger.info(
    { embedded: threats.length, durationMs },
    "Specific threats embedded"
  );

  return { embedded: threats.length, durationMs };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build the text content to embed for a threat.
 * Format designed for semantic search relevance.
 */
function buildThreatEmbeddingContent(threat: {
  title: string;
  description: string | null;
  strideCategory: string;
  severity: string;
  likelihood: string | null;
}): string {
  const parts = [
    `[${threat.strideCategory}]`,
    `[${threat.severity}]`,
    threat.title,
  ];

  if (threat.description) {
    parts.push(threat.description);
  }

  if (threat.likelihood) {
    parts.push(`Likelihood: ${threat.likelihood}`);
  }

  return parts.join(" ");
}
