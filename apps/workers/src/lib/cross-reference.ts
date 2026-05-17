/**
 * Cross-Reference Resolver - Resolves Notion URLs found in Linear content
 * and Linear URLs found in Notion content.
 *
 * When a Linear issue references a Notion doc (URL), fetch that doc.
 * When a Notion page references a Linear issue (URL), fetch that issue.
 *
 * Cross-refs require the OTHER integration to be active (skip if not connected).
 */
import { LinearClient } from "@linear/sdk";
import { Client as NotionClient } from "@notionhq/client";
import { fetchWithTimeout } from "./fetch-timeout";
import { acquireToken } from "./notion-rate-limiter";

const FETCH_TIMEOUT = 30_000;

export interface CrossReferenceResult {
  notionDocs: Array<Record<string, unknown>>;
  linearIssues: Array<Record<string, unknown>>;
  missingItems: Array<{ item: string; reason: string }>;
}

/**
 * Extracts the Notion page ID from a Notion URL.
 * Notion URLs: https://notion.so/workspace/Page-Title-<32-char-hex-id>
 * or: https://www.notion.so/<32-char-hex-id>
 */
export function extractNotionPageId(url: string): string | null {
  // Try matching the 32-char hex ID at the end of the URL (with or without dashes)
  const match = url.match(/([a-f0-9]{32})(?:\?|$|#)/i) ??
    url.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})(?:\?|$|#)/i) ??
    url.match(/-([a-f0-9]{32})$/i) ??
    url.match(/\/([a-f0-9]{32})$/i);

  if (match) return match[1]!;

  // Last segment might be the ID without dashes
  const segments = url.split("/").filter(Boolean);
  const last = segments[segments.length - 1]?.split("?")[0]?.split("#")[0];
  if (last) {
    // Check if the last 32 chars are hex
    const hexMatch = last.match(/([a-f0-9]{32})$/i);
    if (hexMatch) return hexMatch[1]!;
  }

  return null;
}

/**
 * Extracts the Linear issue identifier from a Linear URL.
 * Linear URLs: https://linear.app/<workspace>/issue/<IDENTIFIER>/...
 */
export function extractLinearIssueId(url: string): string | null {
  const match = url.match(
    /linear\.app\/[a-zA-Z0-9-]+\/issue\/([a-zA-Z]+-\d+)/
  );
  return match ? match[1]! : null;
}

/**
 * Fetches Notion pages referenced in Linear content.
 * Requires an active Notion integration.
 */
async function fetchReferencedNotionDocs(
  notionAccessToken: string,
  notionIntegrationId: string,
  notionUrls: string[]
): Promise<{
  docs: Array<Record<string, unknown>>;
  missingItems: Array<{ item: string; reason: string }>;
}> {
  const docs: Array<Record<string, unknown>> = [];
  const missingItems: Array<{ item: string; reason: string }> = [];
  const client = new NotionClient({ auth: notionAccessToken });

  const fetchPromises = notionUrls.map(async (url) => {
    const pageId = extractNotionPageId(url);
    if (!pageId) {
      missingItems.push({
        item: `notion-doc:${url}`,
        reason: "Could not extract page ID from URL",
      });
      return null;
    }

    try {
      await acquireToken(notionIntegrationId);
      const page = await fetchWithTimeout(async () => {
        return client.pages.retrieve({ page_id: pageId });
      }, FETCH_TIMEOUT);

      // Also fetch blocks for the page content
      await acquireToken(notionIntegrationId);
      const blocks = await fetchWithTimeout(async () => {
        const response = await client.blocks.children.list({
          block_id: pageId,
          page_size: 100,
        });
        return response.results;
      }, FETCH_TIMEOUT);

      return { page, blocks, sourceUrl: url };
    } catch (err: any) {
      missingItems.push({
        item: `notion-doc:${pageId}`,
        reason: err.message ?? "fetch failed",
      });
      return null;
    }
  });

  const results = await Promise.allSettled(fetchPromises);

  for (const result of results) {
    if (result.status === "fulfilled" && result.value) {
      docs.push(result.value as unknown as Record<string, unknown>);
    } else if (result.status === "rejected") {
      missingItems.push({
        item: "notion-doc",
        reason: result.reason?.message ?? "fetch failed",
      });
    }
  }

  return { docs, missingItems };
}

/**
 * Fetches Linear issues referenced in Notion content.
 * Requires an active Linear integration.
 */
async function fetchReferencedLinearIssues(
  linearAccessToken: string,
  linearUrls: string[]
): Promise<{
  issues: Array<Record<string, unknown>>;
  missingItems: Array<{ item: string; reason: string }>;
}> {
  const issues: Array<Record<string, unknown>> = [];
  const missingItems: Array<{ item: string; reason: string }> = [];
  const client = new LinearClient({ accessToken: linearAccessToken });

  const fetchPromises = linearUrls.map(async (url) => {
    const identifier = extractLinearIssueId(url);
    if (!identifier) {
      missingItems.push({
        item: `linear-issue:${url}`,
        reason: "Could not extract issue identifier from URL",
      });
      return null;
    }

    try {
      const issue = await client.issue(identifier);
      if (!issue) {
        missingItems.push({
          item: `linear-issue:${identifier}`,
          reason: "Issue not found",
        });
        return null;
      }

      return {
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        description: issue.description ?? null,
        url: issue.url,
        priority: issue.priority,
        sourceUrl: url,
      };
    } catch (err: any) {
      missingItems.push({
        item: `linear-issue:${identifier}`,
        reason: err.message ?? "fetch failed",
      });
      return null;
    }
  });

  const results = await Promise.allSettled(fetchPromises);

  for (const result of results) {
    if (result.status === "fulfilled" && result.value) {
      issues.push(result.value as unknown as Record<string, unknown>);
    } else if (result.status === "rejected") {
      missingItems.push({
        item: "linear-issue",
        reason: result.reason?.message ?? "fetch failed",
      });
    }
  }

  return { issues, missingItems };
}

/**
 * Resolves cross-references bidirectionally.
 *
 * @param notionUrls - Notion URLs found in Linear content
 * @param linearUrls - Linear URLs found in Notion content
 * @param notionAccessToken - Notion token (null if integration not active)
 * @param notionIntegrationId - Notion integration ID for rate limiting
 * @param linearAccessToken - Linear token (null if integration not active)
 */
export async function resolveCrossReferences(params: {
  notionUrls: string[];
  linearUrls: string[];
  notionAccessToken: string | null;
  notionIntegrationId: string | null;
  linearAccessToken: string | null;
}): Promise<CrossReferenceResult> {
  const {
    notionUrls,
    linearUrls,
    notionAccessToken,
    notionIntegrationId,
    linearAccessToken,
  } = params;

  const missingItems: Array<{ item: string; reason: string }> = [];
  let notionDocs: Array<Record<string, unknown>> = [];
  let linearIssues: Array<Record<string, unknown>> = [];

  const fetchTasks: Promise<void>[] = [];

  // Fetch referenced Notion docs (requires active Notion integration)
  if (notionUrls.length > 0 && notionAccessToken && notionIntegrationId) {
    fetchTasks.push(
      fetchReferencedNotionDocs(notionAccessToken, notionIntegrationId, notionUrls).then(
        (result) => {
          notionDocs = result.docs;
          missingItems.push(...result.missingItems);
        }
      )
    );
  } else if (notionUrls.length > 0 && !notionAccessToken) {
    missingItems.push({
      item: "cross-ref:notion-docs",
      reason: "Notion integration not active - cannot fetch referenced docs",
    });
  }

  // Fetch referenced Linear issues (requires active Linear integration)
  if (linearUrls.length > 0 && linearAccessToken) {
    fetchTasks.push(
      fetchReferencedLinearIssues(linearAccessToken, linearUrls).then(
        (result) => {
          linearIssues = result.issues;
          missingItems.push(...result.missingItems);
        }
      )
    );
  } else if (linearUrls.length > 0 && !linearAccessToken) {
    missingItems.push({
      item: "cross-ref:linear-issues",
      reason: "Linear integration not active - cannot fetch referenced issues",
    });
  }

  await Promise.allSettled(fetchTasks);

  return { notionDocs, linearIssues, missingItems };
}
