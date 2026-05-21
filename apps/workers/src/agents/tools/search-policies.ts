/**
 * searchPolicies Tool
 *
 * Mastra tool that retrieves the most relevant security policies for a given context.
 * Uses two retrieval strategies:
 * 1. Semantic search: embed context summary, cosine similarity against policy embeddings (top 5)
 * 2. Keyword rules: force inclusion of policies when specific topics are detected in context
 *
 * Results are merged and deduplicated. Returns full policy content for matched policies.
 * Scoped: returns built-in policies (tenantId=null) + tenant's custom policies.
 * Only returns enabled policies (isEnabled=true).
 *
 * SLA: Retrieval completes within 2 seconds.
 */
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { db, vectorSearch } from "@loomii/db";
import { BUILT_IN_TENANT_ID } from "@loomii/shared/constants";
import { generateQueryEmbedding } from "../../lib/embeddings";
import { extractKeywords } from "../../lib/keyword-extractor";

/** Maximum policies to return (semantic + keyword combined) */
const MAX_RESULTS = 10;

/** Number of semantic search results to fetch */
const SEMANTIC_LIMIT = 5;

export const searchPoliciesTool = createTool({
  id: "search-policies",
  description:
    "Retrieve the most relevant security policies for a given context. Uses semantic search and keyword rules to find applicable OWASP and custom policies. Always call this before generating findings to ground your review in specific policies.",
  inputSchema: z.object({
    contextSummary: z
      .string()
      .describe(
        "Summary of the code change or design being reviewed. Include key technical details like authentication methods, data flows, APIs, etc."
      ),
  }),
  outputSchema: z.object({
    policies: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        framework: z.string(),
        identifier: z.string(),
        content: z.string(),
        relevanceReason: z.string(),
      })
    ),
    totalRetrieved: z.number(),
  }),
  execute: async (inputData, context) => {
    const tenantId = context?.requestContext?.get("tenantId") as
      | string
      | undefined;

    const { contextSummary } = inputData;

    // Run both retrieval strategies in parallel (graceful degradation on failure)
    const [semanticResults, keywordResults, disabledPolicyIds] = await Promise.all([
      retrieveSemantic(contextSummary, tenantId).catch(() => [] as PolicyResult[]),
      retrieveByKeywords(contextSummary, tenantId).catch(() => [] as PolicyResult[]),
      getDisabledPolicyIds(tenantId),
    ]);

    // Merge and deduplicate (semantic results take priority for relevanceReason)
    const merged = mergeAndDeduplicate(semanticResults, keywordResults);

    // Filter out policies disabled by tenant-specific overrides
    const filtered = merged.filter((p) => !disabledPolicyIds.has(p.id));

    // Cap at MAX_RESULTS
    const policies = filtered.slice(0, MAX_RESULTS);

    return {
      policies,
      totalRetrieved: policies.length,
    };
  },
});

// ─── Types ────────────────────────────────────────────────────────────────────

interface PolicyResult {
  id: string;
  name: string;
  framework: string;
  identifier: string;
  content: string;
  relevanceReason: string;
}

// ─── Semantic Retrieval ───────────────────────────────────────────────────────

/**
 * Retrieve policies via semantic search (pgvector cosine similarity).
 * Searches embeddings with sourceType='policy', then fetches full policy records.
 */
async function retrieveSemantic(
  contextSummary: string,
  tenantId: string | undefined
): Promise<PolicyResult[]> {
  // Generate query embedding
  const queryVector = await generateQueryEmbedding(contextSummary);

  // Search policy embeddings for this tenant (built-in + custom)
  // Built-in policies use BUILT_IN_TENANT_ID for their embeddings
  const results = await vectorSearch(db, {
    tenantId: BUILT_IN_TENANT_ID,
    vector: queryVector,
    limit: SEMANTIC_LIMIT,
    threshold: 0.5,
  });

  // Also search tenant-specific embeddings if tenantId is provided
  let tenantResults: typeof results = [];
  if (tenantId) {
    tenantResults = await vectorSearch(db, {
      tenantId,
      vector: queryVector,
      limit: SEMANTIC_LIMIT,
      threshold: 0.5,
    });
  }

  // Combine and filter to policy-sourced embeddings only
  const allResults = [...results, ...tenantResults]
    .filter((r) => (r.metadata as any)?.sourceType === "policy")
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, SEMANTIC_LIMIT);

  if (allResults.length === 0) return [];

  // Fetch full policy records
  const policyIds = allResults
    .map((r) => (r.metadata as any)?.policyId)
    .filter(Boolean) as string[];

  if (policyIds.length === 0) return [];

  const policies = await db.policy.findMany({
    where: {
      id: { in: policyIds },
      isEnabled: true,
    },
    select: {
      id: true,
      name: true,
      framework: true,
      identifier: true,
      content: true,
    },
  });

  const policyMap = new Map(policies.map((p) => [p.id, p]));

  return allResults
    .map((r) => {
      const policyId = (r.metadata as any)?.policyId;
      const policy = policyMap.get(policyId);
      if (!policy) return null;
      return {
        ...policy,
        relevanceReason: `Semantic match (similarity: ${r.similarity.toFixed(2)})`,
      };
    })
    .filter(Boolean) as PolicyResult[];
}

// ─── Keyword Retrieval ────────────────────────────────────────────────────────

/**
 * Retrieve policies via keyword rules.
 * Extracts keywords from context, then finds policies whose keywords array
 * overlaps with the extracted keywords.
 */
async function retrieveByKeywords(
  contextSummary: string,
  tenantId: string | undefined
): Promise<PolicyResult[]> {
  const extractedKeywords = extractKeywords(contextSummary);

  if (extractedKeywords.length === 0) return [];

  // Find policies where keywords array overlaps with extracted keywords
  // Prisma's array `hasSome` operator checks for overlap
  const policies = await db.policy.findMany({
    where: {
      isEnabled: true,
      keywords: { hasSome: extractedKeywords },
      OR: [
        { tenantId: null }, // Built-in policies
        ...(tenantId ? [{ tenantId }] : []), // Tenant's custom policies
      ],
    },
    select: {
      id: true,
      name: true,
      framework: true,
      identifier: true,
      content: true,
      keywords: true,
    },
  });

  // Determine which keywords matched for the relevance reason
  return policies.map((policy) => {
    const matchedKeywords = policy.keywords.filter((kw) =>
      extractedKeywords.includes(kw)
    );
    return {
      id: policy.id,
      name: policy.name,
      framework: policy.framework,
      identifier: policy.identifier,
      content: policy.content,
      relevanceReason: `Keyword match: ${matchedKeywords.join(", ")}`,
    };
  });
}

// ─── Merge & Deduplicate ──────────────────────────────────────────────────────

/**
 * Merge semantic and keyword results, deduplicating by policy ID.
 * Semantic results take priority (listed first), keyword results fill remaining slots.
 */
function mergeAndDeduplicate(
  semanticResults: PolicyResult[],
  keywordResults: PolicyResult[]
): PolicyResult[] {
  const seen = new Set<string>();
  const merged: PolicyResult[] = [];

  // Add semantic results first (higher confidence)
  for (const result of semanticResults) {
    if (!seen.has(result.id)) {
      seen.add(result.id);
      merged.push(result);
    }
  }

  // Add keyword results (for policies not already included)
  for (const result of keywordResults) {
    if (!seen.has(result.id)) {
      seen.add(result.id);
      merged.push(result);
    }
  }

  return merged;
}

// ─── Override Filtering ───────────────────────────────────────────────────────

/**
 * Get the set of policy IDs that have been disabled by a tenant-specific override.
 * Returns an empty set if no tenant is specified or no overrides exist.
 */
async function getDisabledPolicyIds(
  tenantId: string | undefined
): Promise<Set<string>> {
  if (!tenantId) return new Set();

  try {
    const overrides = await db.policyOverride.findMany({
      where: { tenantId, isEnabled: false },
      select: { policyId: true },
    });
    return new Set(overrides.map((o) => o.policyId));
  } catch {
    // Graceful degradation: if override table doesn't exist yet, return empty
    return new Set();
  }
}
