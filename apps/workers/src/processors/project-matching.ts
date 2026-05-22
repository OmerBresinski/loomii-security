/**
 * Project Matching Processor
 *
 * BullMQ worker for the "project-matching" queue. Runs on every incoming event
 * to determine project membership before context assembly.
 *
 * Pipeline:
 * 1. Check if source already linked to active projects → use existing link
 * 2. Run metadata heuristics (unconditional auto-link)
 * 3. Run embedding similarity matching (threshold 0.75)
 * 4. Create ProjectSource records for new auto-links
 * 5. Trigger debounced summary regeneration for linked projects
 * 6. Enqueue context assembly with resolved projectId
 *
 * On failure: enqueues context assembly with projectId=null (graceful degradation).
 *
 * Concurrency: 5
 * SLA: <5 seconds for 95% of events
 */
import type { Job } from "bullmq";
import { db } from "@loomii/db";
import {
  contextAssemblyQueue,
  summaryGenerationQueue,
  type ProjectMatchingPayload,
} from "@loomii/queue";
import { generateQueryEmbedding } from "../lib/embeddings";
import { runMetadataHeuristics, type HeuristicMatch } from "../lib/metadata-heuristics";
import { logger } from "../lib/logger";

/** Minimum cosine similarity for embedding-based auto-link */
const EMBEDDING_SIMILARITY_THRESHOLD = 0.75;

/** Overall timeout - must stay well under 5s SLA */
const OVERALL_TIMEOUT_MS = 5_000;

interface ProjectMatch {
  projectId: string;
  score: number;
  signal: string;
  reason: Record<string, unknown>;
}

export async function processProjectMatching(
  job: Job<ProjectMatchingPayload>
): Promise<void> {
  const { eventId, tenantId, sourceType, sourceId, content } = job.data;

  const childLogger = logger.child({
    queue: "project-matching",
    jobId: job.id,
    jobName: job.name,
    tenantId,
    eventId,
    sourceType,
    sourceId,
  });

  childLogger.info("Starting project matching");

  let primaryProjectId: string | null = null;

  try {
    const result = await Promise.race([
      matchProject({ eventId, tenantId, sourceType, sourceId, content, childLogger }),
      createTimeout(OVERALL_TIMEOUT_MS),
    ]);

    if (result === "TIMEOUT") {
      childLogger.warn("Project matching timed out, proceeding with null projectId");
    } else {
      primaryProjectId = result;
    }
  } catch (err) {
    // Graceful degradation: matching failure never blocks the pipeline
    const error = err instanceof Error ? err : new Error(String(err));
    childLogger.error(
      { error: error.message, stack: error.stack },
      "Project matching failed, proceeding with null projectId"
    );
  }

  // Always enqueue context assembly regardless of matching outcome
  try {
    await contextAssemblyQueue.add("assemble", {
      eventId,
      tenantId,
      sourceType,
      sourceId,
      projectId: primaryProjectId,
    });

    childLogger.info(
      { projectId: primaryProjectId },
      "Context assembly enqueued"
    );
  } catch (enqueueErr) {
    // Critical: if we can't enqueue context assembly, the event is lost.
    // Re-throw to trigger BullMQ retry so the event eventually gets processed.
    const error = enqueueErr instanceof Error ? enqueueErr : new Error(String(enqueueErr));
    childLogger.error(
      { error: error.message, stack: error.stack },
      "Failed to enqueue context assembly"
    );
    throw enqueueErr;
  }
}

function createTimeout(ms: number): Promise<"TIMEOUT"> {
  return new Promise((resolve) => setTimeout(() => resolve("TIMEOUT"), ms));
}

interface MatchParams {
  eventId: string;
  tenantId: string;
  sourceType: "linear" | "notion";
  sourceId: string;
  content: string;
  childLogger: typeof logger;
}

async function matchProject(params: MatchParams): Promise<string | null> {
  const { eventId, tenantId, sourceType, sourceId, content, childLogger } = params;

  // ─── Step 1: Check existing links ─────────────────────────────────────────
  const existingLinks = await db.projectSource.findMany({
    where: {
      sourceId,
      sourceType: sourceType === "linear" ? "LINEAR_ISSUE" : "NOTION_PAGE",
      isArchived: false,
      unlinkedAt: null,
      project: { tenantId },
    },
    select: { projectId: true },
  });

  if (existingLinks.length > 0) {
    // Already linked - pick most relevant by embedding similarity if multiple
    const projectId = existingLinks.length === 1
      ? existingLinks[0].projectId
      : await pickBestProject(existingLinks.map((l) => l.projectId), content, tenantId);

    childLogger.info(
      { projectId, existingLinkCount: existingLinks.length },
      "Source already linked to project(s)"
    );
    return projectId;
  }

  // ─── Step 2: Metadata heuristics ──────────────────────────────────────────
  const event = await db.event.findFirst({
    where: { id: eventId },
    select: { payload: true },
  });

  const eventPayload = (event?.payload as Record<string, unknown>) ?? {};

  const heuristicMatches = await runMetadataHeuristics({
    tenantId,
    sourceType,
    sourceId,
    content,
    eventPayload,
  });

  childLogger.info(
    { heuristicMatchCount: heuristicMatches.length },
    "Metadata heuristics completed"
  );

  // ─── Step 3: Embedding similarity ─────────────────────────────────────────
  const embeddingMatches = await matchByEmbeddingSimilarity(tenantId, content, childLogger);

  childLogger.info(
    { embeddingMatchCount: embeddingMatches.length },
    "Embedding similarity completed"
  );

  // ─── Step 4: Combine and deduplicate matches ──────────────────────────────
  const allMatches: ProjectMatch[] = [];
  const seenProjectIds = new Set<string>();

  // Heuristic matches get a high score (1.0) since they're unconditional
  for (const match of heuristicMatches) {
    if (!seenProjectIds.has(match.projectId)) {
      seenProjectIds.add(match.projectId);
      allMatches.push({
        projectId: match.projectId,
        score: 1.0,
        signal: match.signal,
        reason: match.reason,
      });
    }
  }

  // Embedding matches (only add if not already matched by heuristic)
  for (const match of embeddingMatches) {
    if (!seenProjectIds.has(match.projectId)) {
      seenProjectIds.add(match.projectId);
      allMatches.push(match);
    }
  }

  if (allMatches.length === 0) {
    childLogger.info("No project matches found");
    return null;
  }

  // ─── Step 5: Create ProjectSource records ─────────────────────────────────
  const dbSourceType = sourceType === "linear" ? "LINEAR_ISSUE" : "NOTION_PAGE";

  for (const match of allMatches) {
    try {
      await db.projectSource.create({
        data: {
          projectId: match.projectId,
          sourceType: dbSourceType as any,
          sourceId,
          linkedBy: "AUTO",
          linkReason: match.reason as any,
        },
      });
    } catch (err: any) {
      // Unique constraint violation = already linked (race condition), skip
      if (err?.code === "P2002") {
        childLogger.debug(
          { projectId: match.projectId },
          "Source already linked (race condition), skipping"
        );
      } else {
        throw err;
      }
    }
  }

  childLogger.info(
    { linkedCount: allMatches.length },
    "ProjectSource records created"
  );

  // ─── Step 6: Trigger debounced summary regeneration ───────────────────────
  for (const match of allMatches) {
    await summaryGenerationQueue.add(
      "regenerate",
      { projectId: match.projectId, trigger: "auto-link" },
      {
        jobId: `summary-${match.projectId}`,
        delay: 60_000, // 1 minute debounce
      }
    );
  }

  // ─── Step 7: Pick highest-scoring as primary ──────────────────────────────
  allMatches.sort((a, b) => b.score - a.score);
  const primaryProjectId = allMatches[0].projectId;

  childLogger.info(
    { primaryProjectId, totalMatches: allMatches.length },
    "Primary project selected"
  );

  return primaryProjectId;
}

/**
 * When a source is already linked to multiple projects, pick the best one
 * by computing embedding similarity between event content and project summaries.
 */
async function pickBestProject(
  projectIds: string[],
  content: string,
  tenantId: string
): Promise<string> {
  if (projectIds.length === 1) return projectIds[0];

  try {
    const embedding = await generateQueryEmbedding(content);
    const vectorStr = `[${embedding.join(",")}]`;

    const results = await db.$queryRaw<Array<{ id: string; similarity: number }>>`
      SELECT id, 1 - (summary_embedding <=> ${vectorStr}::vector) as similarity
      FROM projects
      WHERE id = ANY(${projectIds})
        AND tenant_id = ${tenantId}
        AND summary_embedding IS NOT NULL
      ORDER BY similarity DESC
      LIMIT 1
    `;

    if (results.length > 0) {
      return results[0].id;
    }
  } catch {
    // Fallback to first project on embedding failure
  }

  return projectIds[0];
}

/**
 * Match event content against all tenant project summary embeddings.
 * Returns projects with similarity >= threshold.
 */
async function matchByEmbeddingSimilarity(
  tenantId: string,
  content: string,
  childLogger: typeof logger
): Promise<ProjectMatch[]> {
  if (!content || content.trim().length === 0) return [];

  try {
    const embedding = await generateQueryEmbedding(content);
    const vectorStr = `[${embedding.join(",")}]`;

    const results = await db.$queryRaw<Array<{ id: string; similarity: number }>>`
      SELECT id, 1 - (summary_embedding <=> ${vectorStr}::vector) as similarity
      FROM projects
      WHERE tenant_id = ${tenantId}
        AND summary_embedding IS NOT NULL
        AND 1 - (summary_embedding <=> ${vectorStr}::vector) >= ${EMBEDDING_SIMILARITY_THRESHOLD}
      ORDER BY similarity DESC
    `;

    return results.map((row) => ({
      projectId: row.id,
      score: row.similarity,
      signal: "embedding",
      reason: { signal: "embedding", score: row.similarity },
    }));
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    childLogger.warn(
      { error: error.message },
      "Embedding similarity matching failed, skipping"
    );
    return [];
  }
}
