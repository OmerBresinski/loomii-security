/**
 * searchContext Tool
 *
 * Semantic search across ALL historical context bundles for a tenant.
 * Used by the Threat Model Agent to gather system information from
 * previously processed context bundles (Linear tickets, Notion docs, etc.)
 *
 * Uses pgvector cosine similarity search against the embeddings table.
 */
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { db, vectorSearch } from "@loomii/db";
import { generateQueryEmbedding } from "../../lib/embeddings";

export const searchContextTool = createTool({
  id: "search-context",
  description:
    "Search ALL historical context bundles for relevant information about the tenant's system architecture, integrations, APIs, data flows, and security posture. Use this to gather comprehensive system context before generating threat models.",
  inputSchema: z.object({
    query: z
      .string()
      .describe(
        "What to search for in historical context (e.g., 'authentication flow', 'database architecture', 'API endpoints')"
      ),
    limit: z
      .number()
      .min(1)
      .max(20)
      .optional()
      .describe("Maximum number of results to return (default 10)"),
  }),
  outputSchema: z.object({
    results: z.array(
      z.object({
        content: z.string(),
        documentId: z.string(),
        similarity: z.number(),
      })
    ),
    totalResults: z.number(),
  }),
  execute: async (inputData, context) => {
    const tenantId = context?.requestContext?.get("tenantId") as
      | string
      | undefined;

    if (!tenantId) {
      return { results: [], totalResults: 0 };
    }

    const { query, limit = 10 } = inputData;

    // Generate embedding for the query
    const queryVector = await generateQueryEmbedding(query);

    // Perform cosine similarity search across all tenant embeddings
    const searchResults = await vectorSearch(db, {
      tenantId,
      vector: queryVector,
      limit,
      threshold: 0.6, // Lower threshold for broader context gathering
    });

    return {
      results: searchResults.map((r) => ({
        content: r.content,
        documentId: r.documentId,
        similarity: r.similarity,
      })),
      totalResults: searchResults.length,
    };
  },
});
