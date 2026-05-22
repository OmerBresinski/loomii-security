/**
 * Source Search API
 *
 * GET /api/v1/sources/search?q=...&type=all|notion|linear&cursor=...&limit=20
 *
 * Searches the local index of Notion pages and Linear issues using pgvector
 * semantic search + keyword fallback. Used by the project creation wizard.
 *
 * All results are tenant-scoped. Returns sources with their existing
 * project associations for the UI to display.
 */
import { Hono } from "hono";
import { db } from "@loomii/db";
import type { AppEnv } from "../../lib/types";
import { semanticSearch } from "../../lib/semantic-search";

export const sourceRoutes = new Hono<AppEnv>();

/** Minimum query length for search */
const MIN_QUERY_LENGTH = 2;

/** Default results per page */
const DEFAULT_LIMIT = 20;

/** Maximum results per page */
const MAX_LIMIT = 50;

/** Minimum semantic results before keyword fallback kicks in */
const KEYWORD_FALLBACK_THRESHOLD = 5;

interface SourceSearchResult {
  sourceType: "NOTION_PAGE" | "LINEAR_ISSUE";
  sourceId: string;
  sourceUrl: string | null;
  title: string;
  snippet: string;
  similarity: number;
  projects: Array<{ id: string; name: string }>;
}

/**
 * GET /search
 *
 * Query params:
 * - q: search query (required, min 2 chars)
 * - type: "all" | "notion" | "linear" (default: "all")
 * - limit: results per page (default: 20, max: 50)
 * - cursor: pagination cursor (base64-encoded offset)
 */
sourceRoutes.get("/search", async (c) => {
  const tenantId = c.get("tenantId");
  const logger = c.get("logger");
  const requestId = c.get("requestId");

  // Parse query params
  const query = c.req.query("q")?.trim() ?? "";
  const type = c.req.query("type") ?? "all";
  const cursor = c.req.query("cursor") ?? null;
  const limitParam = parseInt(c.req.query("limit") ?? String(DEFAULT_LIMIT), 10);

  // Validate type
  if (!["all", "notion", "linear"].includes(type)) {
    return c.json(
      { error: { code: "INVALID_TYPE", message: "type must be 'all', 'notion', or 'linear'", requestId } },
      400
    );
  }

  // Short query → empty results
  if (query.length < MIN_QUERY_LENGTH) {
    return c.json({ results: [], nextCursor: null });
  }

  const limit = Math.min(Math.max(1, limitParam), MAX_LIMIT);
  const offset = cursor ? decodeCursor(cursor) : 0;

  const startTime = Date.now();

  try {
    // 1. Semantic search via pgvector
    const semanticResults = await semanticSearch({
      query,
      tenantId,
      limit: limit + offset + 10, // Fetch extra to account for filtering and pagination
      threshold: 0.3,
    });

    // 2. Filter by source type
    // The documentId in embeddings maps to the sourceId stored during context assembly.
    // We need to resolve which are Notion vs Linear by looking up Event records.
    const documentIds = [...new Set(semanticResults.map((r) => r.documentId))];

    const events = await db.event.findMany({
      where: {
        tenantId,
        externalId: { in: documentIds },
      },
      select: {
        externalId: true,
        source: true,
        type: true,
        payload: true,
      },
      distinct: ["externalId"],
    });

    // Build lookup maps
    const eventBySourceId = new Map(events.map((e) => [e.externalId, e]));

    // Deduplicate by documentId (multiple chunks from same source)
    const seenSourceIds = new Set<string>();
    let filteredResults: Array<{
      sourceId: string;
      sourceType: "NOTION_PAGE" | "LINEAR_ISSUE";
      sourceUrl: string | null;
      title: string;
      snippet: string;
      similarity: number;
    }> = [];

    for (const result of semanticResults) {
      if (seenSourceIds.has(result.documentId)) continue;
      seenSourceIds.add(result.documentId);

      const event = eventBySourceId.get(result.documentId);
      if (!event) continue;

      const sourceType: "NOTION_PAGE" | "LINEAR_ISSUE" =
        event.source === "NOTION" ? "NOTION_PAGE" : "LINEAR_ISSUE";

      // Apply type filter
      if (type === "notion" && sourceType !== "NOTION_PAGE") continue;
      if (type === "linear" && sourceType !== "LINEAR_ISSUE") continue;

      const title = (event.payload as any)?.title ?? result.documentId;
      const sourceUrl = (event.payload as any)?.url ?? null;
      const snippet = result.content.slice(0, 200);

      filteredResults.push({
        sourceId: result.documentId,
        sourceType,
        sourceUrl,
        title,
        snippet,
        similarity: result.similarity,
      });
    }

    // 3. Keyword fallback if semantic results are sparse
    if (filteredResults.length < KEYWORD_FALLBACK_THRESHOLD) {
      const keywordResults = await keywordSearch(tenantId, query, type, limit);
      // Add keyword results that aren't already in semantic results
      for (const kr of keywordResults) {
        if (!seenSourceIds.has(kr.sourceId)) {
          seenSourceIds.add(kr.sourceId);
          filteredResults.push(kr);
        }
      }
    }

    // 4. Paginate
    const paginatedResults = filteredResults.slice(offset, offset + limit);

    // 5. Fetch project associations for the results
    const resultSourceIds = paginatedResults.map((r) => r.sourceId);
    const projectAssociations = await db.projectSource.findMany({
      where: {
        sourceId: { in: resultSourceIds },
        isArchived: false,
        unlinkedAt: null,
        project: { tenantId },
      },
      select: {
        sourceId: true,
        project: {
          select: { id: true, name: true },
        },
      },
    });

    // Group projects by sourceId
    const projectsBySource = new Map<string, Array<{ id: string; name: string }>>();
    for (const assoc of projectAssociations) {
      const existing = projectsBySource.get(assoc.sourceId);
      if (existing) {
        existing.push(assoc.project);
      } else {
        projectsBySource.set(assoc.sourceId, [assoc.project]);
      }
    }

    // 6. Build response
    const results: SourceSearchResult[] = paginatedResults.map((r) => ({
      sourceType: r.sourceType,
      sourceId: r.sourceId,
      sourceUrl: r.sourceUrl,
      title: r.title,
      snippet: r.snippet,
      similarity: r.similarity,
      projects: projectsBySource.get(r.sourceId) ?? [],
    }));

    const hasMore = offset + limit < filteredResults.length;
    const nextCursor = hasMore ? encodeCursor(offset + limit) : null;

    const durationMs = Date.now() - startTime;
    logger.info({ query, type, resultCount: results.length, durationMs }, "Source search completed");

    return c.json({ results, nextCursor });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error({ error: error.message, stack: error.stack }, "Source search failed");
    return c.json(
      { error: { code: "SEARCH_FAILED", message: "Search failed", requestId } },
      500
    );
  }
});

/**
 * Keyword-based fallback search using ILIKE on event payload titles.
 * Pushes filtering to the database for efficiency.
 */
async function keywordSearch(
  tenantId: string,
  query: string,
  type: string,
  limit: number
): Promise<Array<{
  sourceId: string;
  sourceType: "NOTION_PAGE" | "LINEAR_ISSUE";
  sourceUrl: string | null;
  title: string;
  snippet: string;
  similarity: number;
}>> {
  const pattern = `%${query}%`;
  const sourceFilter = type === "notion" ? "NOTION" : type === "linear" ? "LINEAR" : null;

  const results = await db.$queryRaw<
    Array<{ external_id: string; source: string; title: string; description: string; url: string | null }>
  >`
    SELECT DISTINCT ON (e.external_id)
      e.external_id,
      e.source,
      COALESCE(e.payload->>'title', e.external_id) as title,
      COALESCE(e.payload->>'description', '') as description,
      e.payload->>'url' as url
    FROM events e
    WHERE e.tenant_id = ${tenantId}
      AND (
        e.payload->>'title' ILIKE ${pattern}
        OR e.payload->>'description' ILIKE ${pattern}
      )
      AND (${sourceFilter}::text IS NULL OR e.source = ${sourceFilter})
    ORDER BY e.external_id, e.created_at DESC
    LIMIT ${limit}
  `;

  return results.map((row) => ({
    sourceId: row.external_id,
    sourceType: row.source === "NOTION" ? "NOTION_PAGE" as const : "LINEAR_ISSUE" as const,
    sourceUrl: row.url,
    title: row.title || row.external_id,
    snippet: (row.description || row.title).slice(0, 200),
    similarity: 0,
  }));
}

function encodeCursor(offset: number): string {
  return Buffer.from(String(offset)).toString("base64");
}

function decodeCursor(cursor: string): number {
  try {
    const decoded = Buffer.from(cursor, "base64").toString("utf-8");
    const num = parseInt(decoded, 10);
    return isNaN(num) ? 0 : num;
  } catch {
    return 0;
  }
}
