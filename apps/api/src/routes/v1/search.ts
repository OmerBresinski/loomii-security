/**
 * Semantic Search Route
 *
 * GET /api/v1/search?query=<text>&limit=<n>
 *
 * Accepts a text query, generates an embedding via Titan Embed v2,
 * and returns the most relevant content chunks via pgvector cosine similarity.
 * All results are scoped to the authenticated tenant.
 *
 * Query params:
 *   - query (required): Search text, 3-500 characters
 *   - limit (optional): Number of results, 1-50, default 10
 *   - threshold (optional): Minimum similarity score, 0-1, default 0.3
 *
 * Response:
 *   200: { results: SearchResult[], query, count }
 *   400: Validation error (query too short/long, invalid params)
 */
import { Hono } from "hono";
import type { AppEnv } from "../../lib/types";
import { semanticSearch } from "../../lib/semantic-search";

export const searchRoutes = new Hono<AppEnv>();

/** Minimum query length (characters) */
const MIN_QUERY_LENGTH = 3;
/** Maximum query length (characters) */
const MAX_QUERY_LENGTH = 500;
/** Default result limit */
const DEFAULT_LIMIT = 10;
/** Maximum result limit */
const MAX_LIMIT = 50;

/**
 * GET /api/v1/search
 *
 * Performs semantic search against the tenant's embedded content.
 * Auth middleware ensures tenantId is available.
 */
searchRoutes.get("/", async (c) => {
  const tenantId = c.get("tenantId");
  const logger = c.get("logger");

  // Parse and validate query params
  const query = c.req.query("query");
  const limitParam = c.req.query("limit");
  const thresholdParam = c.req.query("threshold");

  // Validate query
  if (!query) {
    return c.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Query parameter 'query' is required",
          requestId: c.get("requestId"),
        },
      },
      400
    );
  }

  if (query.length < MIN_QUERY_LENGTH) {
    return c.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: `Query must be at least ${MIN_QUERY_LENGTH} characters`,
          requestId: c.get("requestId"),
        },
      },
      400
    );
  }

  if (query.length > MAX_QUERY_LENGTH) {
    return c.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: `Query must be at most ${MAX_QUERY_LENGTH} characters`,
          requestId: c.get("requestId"),
        },
      },
      400
    );
  }

  // Parse limit
  let limit = DEFAULT_LIMIT;
  if (limitParam) {
    const parsed = parseInt(limitParam, 10);
    if (isNaN(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: `Limit must be between 1 and ${MAX_LIMIT}`,
            requestId: c.get("requestId"),
          },
        },
        400
      );
    }
    limit = parsed;
  }

  // Parse threshold
  let threshold = 0.3;
  if (thresholdParam) {
    const parsed = parseFloat(thresholdParam);
    if (isNaN(parsed) || parsed < 0 || parsed > 1) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Threshold must be between 0 and 1",
            requestId: c.get("requestId"),
          },
        },
        400
      );
    }
    threshold = parsed;
  }

  // Perform semantic search
  logger.info({ query: query.slice(0, 50), limit, threshold }, "Semantic search request");

  const startTime = Date.now();

  try {
    const results = await semanticSearch({
      query,
      tenantId,
      limit,
      threshold,
    });

    const durationMs = Date.now() - startTime;
    logger.info(
      { resultCount: results.length, durationMs },
      "Semantic search completed"
    );

    return c.json(
      {
        results,
        query,
        count: results.length,
        durationMs,
      },
      200
    );
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    logger.error(
      { error: err.message, durationMs },
      "Semantic search failed"
    );

    return c.json(
      {
        error: {
          code: "SEARCH_ERROR",
          message: "Search failed. Please try again.",
          requestId: c.get("requestId"),
        },
      },
      503
    );
  }
});
