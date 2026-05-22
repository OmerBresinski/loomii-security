/**
 * Project Context Enrichment
 *
 * Fetches project summary + top-8 most relevant sources for inclusion
 * in the context bundle. This gives the review agent cross-source context
 * for richer security reviews.
 *
 * Token budget:
 * - Summary: ~1,500 tokens
 * - 8 sources x ~3,000 tokens avg = ~24,000 tokens
 * - Total: ~25,500 tokens of project context
 */
import { db } from "@loomii/db";
import { generateQueryEmbedding } from "./embeddings";
import { logger } from "./logger";

/** Maximum number of related sources to include */
const MAX_RELATED_SOURCES = 8;

/** Max characters per source (~8K tokens ≈ 32K chars at 4 chars/token) */
const MAX_CHARS_PER_SOURCE = 32_000;

/** Chunk size for relevance-based truncation (~500 tokens ≈ 2000 chars) */
const TRUNCATION_CHUNK_SIZE = 2000;

export interface ProjectContext {
  /** Formatted project context string for the bundle */
  formatted: string;
  /** Project summary (raw) */
  summary: string | null;
  /** Related sources included */
  relatedSources: Array<{
    sourceId: string;
    sourceType: string;
    similarity: number;
    contentLength: number;
  }>;
}

/**
 * Fetch project context for enriching a context bundle.
 *
 * Steps:
 * 1. Fetch project summary
 * 2. Get active sources for the project (excluding triggering source)
 * 3. Vector search source embeddings against event content
 * 4. Take top-8, fetch full content, truncate if needed
 * 5. Format into structured context string
 *
 * @param projectId - Internal project ID
 * @param triggeringSourceId - Source ID to exclude from related sources
 * @param eventContent - Event content text (used for embedding if needed)
 * @returns Formatted project context or null if project not found / no enrichment possible
 */
export async function fetchProjectContext(
  projectId: string,
  triggeringSourceId: string,
  eventContent: string
): Promise<ProjectContext | null> {
  const childLogger = logger.child({ module: "project-context", projectId });

  // 1. Fetch project summary
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      summary: true,
      tenantId: true,
    },
  });

  if (!project) {
    childLogger.warn("Project not found for enrichment");
    return null;
  }

  // 2. Get active sources for this project (excluding triggering source)
  const activeSources = await db.projectSource.findMany({
    where: {
      projectId,
      isArchived: false,
      unlinkedAt: null,
      sourceId: { not: triggeringSourceId },
    },
    select: {
      sourceId: true,
      sourceType: true,
    },
  });

  if (activeSources.length === 0 && !project.summary) {
    childLogger.info("No sources or summary available for enrichment");
    return null;
  }

  // 3. Embed event content for similarity search
  let eventEmbedding: number[];
  try {
    eventEmbedding = await generateQueryEmbedding(eventContent);
  } catch (err) {
    childLogger.warn("Failed to generate event embedding for project context, using summary only");
    // Return just the summary if embedding fails
    return formatProjectContext(project.name, project.summary, []);
  }

  // 4. Vector search source embeddings against event embedding
  const sourceIds = activeSources.map((s) => s.sourceId);
  let rankedSources: Array<{ sourceId: string; sourceType: string; similarity: number; content: string }> = [];

  if (sourceIds.length > 0) {
    const vectorStr = `[${eventEmbedding.join(",")}]`;

    // Query embeddings for active sources, ordered by similarity to event
    const similarChunks = await db.$queryRaw<
      Array<{ document_id: string; similarity: number }>
    >`
      SELECT DISTINCT ON (document_id)
        document_id,
        1 - (vector <=> ${vectorStr}::vector) as similarity
      FROM embeddings
      WHERE tenant_id = ${project.tenantId}
        AND document_id = ANY(${sourceIds})
      ORDER BY document_id, vector <=> ${vectorStr}::vector ASC
    `;

    // Sort by similarity descending, take top 8
    similarChunks.sort((a, b) => b.similarity - a.similarity);
    const topSourceIds = similarChunks.slice(0, MAX_RELATED_SOURCES);

    // Build a type lookup map
    const sourceTypeMap = new Map(activeSources.map((s) => [s.sourceId, s.sourceType]));

    // 5. Fetch full content for top sources (single batched query)
    const topDocIds = topSourceIds.map((s) => s.document_id);
    const allChunks = await db.embedding.findMany({
      where: {
        tenantId: project.tenantId,
        documentId: { in: topDocIds },
      },
      orderBy: [{ documentId: "asc" }, { chunk: "asc" }],
      select: { documentId: true, content: true },
    });

    // Group chunks by documentId
    const chunksByDoc = new Map<string, string[]>();
    for (const chunk of allChunks) {
      const existing = chunksByDoc.get(chunk.documentId);
      if (existing) {
        existing.push(chunk.content);
      } else {
        chunksByDoc.set(chunk.documentId, [chunk.content]);
      }
    }

    // Build ranked sources in similarity order
    for (const source of topSourceIds) {
      const docChunks = chunksByDoc.get(source.document_id) ?? [];
      let fullContent = docChunks.join("\n\n");

      // 6. Truncate if exceeds budget
      if (fullContent.length > MAX_CHARS_PER_SOURCE) {
        fullContent = truncateToRelevantChunks(fullContent);
      }

      rankedSources.push({
        sourceId: source.document_id,
        sourceType: sourceTypeMap.get(source.document_id) ?? "UNKNOWN",
        similarity: source.similarity,
        content: fullContent,
      });
    }
  }

  childLogger.info(
    { sourcesIncluded: rankedSources.length, hasSummary: !!project.summary },
    "Project context assembled"
  );

  return formatProjectContext(project.name, project.summary, rankedSources);
}

/**
 * Truncate large source content to a representative subset.
 * Takes the first 3 chunks (beginning typically contains key architectural
 * decisions) + last chunk (often has conclusions/risks).
 */
function truncateToRelevantChunks(content: string): string {
  const chunks: string[] = [];
  for (let i = 0; i < content.length; i += TRUNCATION_CHUNK_SIZE) {
    chunks.push(content.slice(i, i + TRUNCATION_CHUNK_SIZE));
  }

  if (chunks.length <= 1) return content;

  const selectedChunks = [
    ...chunks.slice(0, 3),
    ...(chunks.length > 3 ? [chunks[chunks.length - 1]] : []),
  ];

  return selectedChunks.join("\n\n... (truncated) ...\n\n");
}

/**
 * Format project context into the structured string for the bundle.
 */
function formatProjectContext(
  projectName: string,
  summary: string | null,
  rankedSources: Array<{ sourceId: string; sourceType: string; similarity: number; content: string }>
): ProjectContext {
  const parts: string[] = [];

  parts.push("--- PROJECT CONTEXT ---");
  parts.push(`# Project: ${projectName}\n`);

  // Summary section
  if (summary) {
    parts.push("## Project Summary");
    parts.push(summary);
    parts.push("");
  } else {
    parts.push("## Project Summary");
    parts.push("_No project summary generated yet._");
    parts.push("");
  }

  // Related sources section
  if (rankedSources.length > 0) {
    parts.push("## Related Sources\n");
    for (let i = 0; i < rankedSources.length; i++) {
      const source = rankedSources[i];
      const typeLabel = source.sourceType === "NOTION_PAGE" ? "Notion Page" : "Linear Issue";
      parts.push(`### Source ${i + 1}: ${source.sourceId} (${typeLabel})`);
      parts.push(source.content);
      parts.push("");
    }
  }

  parts.push("--- END PROJECT CONTEXT ---");

  return {
    formatted: parts.join("\n"),
    summary,
    relatedSources: rankedSources.map((s) => ({
      sourceId: s.sourceId,
      sourceType: s.sourceType,
      similarity: s.similarity,
      contentLength: s.content.length,
    })),
  };
}
