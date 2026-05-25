/**
 * Summary Generation Processor
 *
 * BullMQ worker for the "summary-generation" queue. Generates AI project summaries
 * using Claude Sonnet, then embeds the summary using Titan Embed v2 for project matching.
 *
 * Flow:
 * 1. Fetch project with active (non-archived, non-unlinked) sources
 * 2. Fetch content for each source from the local embedding index
 * 3. Fetch up to 10 most recent approved/published reviews for the project
 * 4. Call Claude Sonnet with structured system prompt
 * 5. Embed the generated summary using Titan Embed v2
 * 6. Store summary text + embedding + timestamp in the Project record
 *
 * Concurrency: 2 (configured in processors/index.ts)
 * SLA: <30 seconds per generation
 * Retry: 2x with 5s exponential backoff (configured via BullMQ job options)
 *
 * On failure: project retains old summary (no null-ing), error logged.
 */
import type { Job } from "bullmq";
import { generateText } from "ai";
import { db } from "@loomii/db";
import { type SummaryGenerationPayload, eventsQueue } from "@loomii/queue";
import { bedrock } from "../lib/bedrock";
import { generateQueryEmbedding } from "../lib/embeddings";
import { SUMMARY_SYSTEM_PROMPT } from "../prompts/summary-system";
import { logger } from "../lib/logger";
import { MODELS } from "../lib/bedrock";
import { recordUsage } from "../lib/ai-usage";

/** Claude Sonnet model for summary generation (cross-region inference profile) */
const SONNET_MODEL_ID = MODELS.CLAUDE_SONNET;

/** Maximum tokens for the generated summary */
const MAX_OUTPUT_TOKENS = 600;

/** Overall timeout for the entire job */
const OVERALL_TIMEOUT_MS = 30_000;

/** Maximum number of sources to include in the prompt */
const MAX_SOURCES_IN_PROMPT = 20;

/** Maximum total character length for source content in the prompt */
const MAX_TOTAL_PROMPT_CHARS = 60_000;

/** Maximum characters per individual source */
const MAX_CHARS_PER_SOURCE = 3000;

export async function processSummaryGeneration(
  job: Job<SummaryGenerationPayload>
): Promise<void> {
  const { projectId, trigger } = job.data;

  const childLogger = logger.child({
    queue: "summary-generation",
    jobId: job.id,
    jobName: job.name,
    projectId,
    trigger,
  });

  childLogger.info("Starting summary generation");
  const startTime = Date.now();

  try {
    const result = await Promise.race([
      generateAndStoreSummary({ projectId, childLogger }),
      createTimeout(OVERALL_TIMEOUT_MS),
    ]);

    if (result === "TIMEOUT") {
      throw new Error(
        `Summary generation timed out after ${OVERALL_TIMEOUT_MS}ms for project ${projectId}`
      );
    }

    const durationMs = Date.now() - startTime;
    childLogger.info({ durationMs }, "Summary generation completed");

    // Publish summary.updated event for notifications (non-blocking)
    try {
      const project = await db.project.findUnique({
        where: { id: projectId },
        select: { id: true, name: true, tenantId: true },
      });
      if (project) {
        await eventsQueue.add("summary.updated", {
          tenantId: project.tenantId,
          eventType: "summary.updated",
          data: {
            projectId: project.id,
            projectName: project.name,
            trigger: trigger ?? null,
          },
          timestamp: new Date().toISOString(),
        });
      }
    } catch {
      childLogger.warn("Failed to publish summary.updated event");
    }
  } catch (err) {
    // On failure: preserve existing summary, log error
    const error = err instanceof Error ? err : new Error(String(err));
    childLogger.error(
      { error: error.message, stack: error.stack },
      "Summary generation failed, preserving existing summary"
    );
    throw err; // Re-throw to trigger BullMQ retry
  }
}

function createTimeout(ms: number): Promise<"TIMEOUT"> {
  return new Promise((resolve) => setTimeout(() => resolve("TIMEOUT"), ms));
}

interface GenerateParams {
  projectId: string;
  childLogger: typeof logger;
}

async function generateAndStoreSummary(params: GenerateParams): Promise<"DONE"> {
  const { projectId, childLogger } = params;

  // ─── 1. Fetch project and active sources ──────────────────────────────────
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: {
      sources: {
        where: {
          isArchived: false,
          unlinkedAt: null,
        },
      },
    },
  });

  if (!project) {
    childLogger.error("Project not found, skipping summary generation");
    return "DONE";
  }

  childLogger.info(
    { sourceCount: project.sources.length, tenantId: project.tenantId },
    "Fetched project sources"
  );

  // ─── 2. Fetch content for each source from the local index ────────────────
  const sourceContents = await fetchSourceContents(project.sources, project.tenantId);

  childLogger.info(
    { sourcesWithContent: sourceContents.length },
    "Fetched source content from embedding index"
  );

  // ─── 3. Fetch up to 10 most recent published reviews ────────────────────────
  const recentReviews = await db.review.findMany({
    where: {
      tenantId: project.tenantId,
      status: "PUBLISHED",
      contextBundle: {
        projectId: project.id,
      },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      summary: true,
      severity: true,
      createdAt: true,
    },
  });

  childLogger.info(
    { reviewCount: recentReviews.length },
    "Fetched recent approved/published reviews"
  );

  // ─── 4. Build prompt and call Claude Sonnet ───────────────────────────────
  const userPrompt = buildUserPrompt(project.name, sourceContents, recentReviews);

  const { text: summaryText, usage } = await generateText({
    model: bedrock(SONNET_MODEL_ID),
    system: SUMMARY_SYSTEM_PROMPT,
    prompt: userPrompt,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    temperature: 0.2,
    abortSignal: AbortSignal.timeout(25_000), // Leave 5s buffer within 30s SLA
  });

  // Record AI usage (fire-and-forget)
  if (usage) {
    recordUsage({
      tenantId: project.tenantId,
      modelId: SONNET_MODEL_ID,
      operation: "summary-generation",
      usage: { promptTokens: usage.promptTokens, completionTokens: usage.completionTokens },
    });
  }

  if (!summaryText || summaryText.trim().length === 0) {
    childLogger.warn("LLM returned empty summary, preserving existing");
    return "DONE";
  }

  childLogger.info(
    { summaryLength: summaryText.length },
    "Summary generated by Claude Sonnet"
  );

  // ─── 5. Embed the summary text ───────────────────────────────────────────
  const embedding = await generateQueryEmbedding(summaryText);

  childLogger.info(
    { embeddingDimensions: embedding.length },
    "Summary embedding generated"
  );

  // ─── 6. Store summary + embedding in Project record ───────────────────────
  // Use raw SQL for pgvector column (Prisma doesn't support vector type natively)
  // Pattern consistent with insertEmbedding() in @loomii/db
  const vectorStr = `[${embedding.join(",")}]`;

  await db.$executeRaw`
    UPDATE projects
    SET summary = ${summaryText},
        summary_embedding = ${vectorStr}::vector,
        summary_updated_at = NOW(),
        updated_at = NOW()
    WHERE id = ${projectId}
  `;

  childLogger.info("Summary and embedding stored in project record");

  return "DONE";
}

/**
 * Fetch content from the embedding index for each source.
 * Uses a single batched query for efficiency, then groups results by documentId.
 */
async function fetchSourceContents(
  sources: Array<{ id: string; sourceType: string; sourceId: string }>,
  tenantId: string
): Promise<Array<{ sourceType: string; sourceId: string; content: string }>> {
  if (sources.length === 0) return [];

  // Build a lookup map: sourceId -> sourceType
  const sourceTypeMap = new Map(
    sources.map((s) => [s.sourceId, s.sourceType])
  );

  const sourceIds = sources.map((s) => s.sourceId);

  // Single batched query instead of N+1
  const embeddings = await db.embedding.findMany({
    where: {
      tenantId,
      documentId: { in: sourceIds },
    },
    orderBy: [{ documentId: "asc" }, { chunk: "asc" }],
    select: { documentId: true, content: true },
  });

  // Group by documentId and concatenate chunks
  const contentByDoc = new Map<string, string[]>();
  for (const emb of embeddings) {
    const existing = contentByDoc.get(emb.documentId);
    if (existing) {
      existing.push(emb.content);
    } else {
      contentByDoc.set(emb.documentId, [emb.content]);
    }
  }

  const results: Array<{ sourceType: string; sourceId: string; content: string }> = [];
  for (const [documentId, chunks] of contentByDoc) {
    const sourceType = sourceTypeMap.get(documentId);
    if (sourceType) {
      results.push({
        sourceType,
        sourceId: documentId,
        content: chunks.join("\n\n"),
      });
    }
  }

  return results;
}

/**
 * Build the user prompt containing source content and review summaries.
 * Applies caps to prevent prompt explosion:
 * - Max 20 sources included
 * - Max 3000 chars per source
 * - Max 60K total chars for source content
 */
function buildUserPrompt(
  projectName: string,
  sourceContents: Array<{ sourceType: string; sourceId: string; content: string }>,
  recentReviews: Array<{ id: string; summary: string | null; severity: string | null; createdAt: Date }>
): string {
  const parts: string[] = [];

  parts.push(`# Project: ${projectName}\n`);

  // Source content section (capped)
  if (sourceContents.length > 0) {
    parts.push("## Sources\n");

    const cappedSources = sourceContents.slice(0, MAX_SOURCES_IN_PROMPT);
    let totalChars = 0;

    for (let i = 0; i < cappedSources.length; i++) {
      if (totalChars >= MAX_TOTAL_PROMPT_CHARS) {
        parts.push(`\n... (${cappedSources.length - i} additional sources omitted for brevity)\n`);
        break;
      }

      const source = cappedSources[i];
      const typeLabel = source.sourceType === "NOTION_PAGE" ? "Notion Page" : "Linear Issue";
      const truncated = source.content.length > MAX_CHARS_PER_SOURCE
        ? source.content.slice(0, MAX_CHARS_PER_SOURCE) + "\n... (truncated)"
        : source.content;

      totalChars += truncated.length;
      parts.push(`### ${typeLabel}: ${source.sourceId}\n${truncated}\n`);
    }

    if (sourceContents.length > MAX_SOURCES_IN_PROMPT) {
      parts.push(`\n... (${sourceContents.length - MAX_SOURCES_IN_PROMPT} additional sources omitted)\n`);
    }
  } else {
    parts.push("## Sources\nNo source content available yet.\n");
  }

  // Recent reviews section
  if (recentReviews.length > 0) {
    parts.push("## Recent Approved Security Reviews\n");
    for (const review of recentReviews) {
      const date = review.createdAt.toISOString().split("T")[0];
      const severity = review.severity ?? "unknown";
      const summary = review.summary ?? "No summary available";
      parts.push(`- [${date}] Severity: ${severity} — ${summary}`);
    }
    parts.push("");
  } else {
    parts.push("## Recent Approved Security Reviews\nNo prior approved reviews.\n");
  }

  return parts.join("\n");
}
