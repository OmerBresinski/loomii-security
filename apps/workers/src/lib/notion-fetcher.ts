/**
 * Notion Fetcher - Parallel fetch of all context related to a Notion page.
 *
 * Fetches: full page blocks, properties, parent page/DB,
 * linked Linear tickets (via cross-reference), and sibling pages (up to 10).
 */
import { Client } from "@notionhq/client";
import { fetchWithTimeout } from "./fetch-timeout";
import { acquireToken } from "./notion-rate-limiter";

const FETCH_TIMEOUT = 30_000; // 30s per individual fetch
const MAX_SIBLINGS = 10;

export interface NotionPageContext {
  page: Record<string, unknown> | null;
  blocks: Array<Record<string, unknown>>;
  parentPage: Record<string, unknown> | null;
  parentDatabase: Record<string, unknown> | null;
  siblingPages: Array<Record<string, unknown>>;
  linkedLinearUrls: string[];
}

export function createNotionClient(accessToken: string): Client {
  return new Client({ auth: accessToken });
}

/**
 * Fetches the full page with its properties.
 */
async function fetchPage(
  client: Client,
  integrationId: string,
  pageId: string
): Promise<Record<string, unknown>> {
  await acquireToken(integrationId);
  const page = await client.pages.retrieve({ page_id: pageId });
  return page as unknown as Record<string, unknown>;
}

/**
 * Fetches all blocks (content) of the page recursively.
 */
async function fetchBlocks(
  client: Client,
  integrationId: string,
  pageId: string
): Promise<Array<Record<string, unknown>>> {
  const blocks: Array<Record<string, unknown>> = [];
  let hasMore = true;
  let startCursor: string | undefined;

  while (hasMore) {
    await acquireToken(integrationId);
    const response = await client.blocks.children.list({
      block_id: pageId,
      page_size: 100,
      start_cursor: startCursor,
    });

    for (const block of response.results) {
      blocks.push(block as unknown as Record<string, unknown>);
    }

    hasMore = response.has_more;
    startCursor = response.next_cursor ?? undefined;
  }

  return blocks;
}

/**
 * Fetches the parent page if the page has a page_id parent.
 */
async function fetchParentPage(
  client: Client,
  integrationId: string,
  page: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  const parent = page.parent as Record<string, unknown> | undefined;
  if (!parent || parent.type !== "page_id") return null;

  const parentPageId = parent.page_id as string;
  await acquireToken(integrationId);
  const parentPage = await client.pages.retrieve({ page_id: parentPageId });
  return parentPage as unknown as Record<string, unknown>;
}

/**
 * Fetches the parent database if the page belongs to a database.
 */
async function fetchParentDatabase(
  client: Client,
  integrationId: string,
  page: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  const parent = page.parent as Record<string, unknown> | undefined;
  if (!parent || parent.type !== "database_id") return null;

  const databaseId = parent.database_id as string;
  await acquireToken(integrationId);
  const database = await client.databases.retrieve({ database_id: databaseId });
  return database as unknown as Record<string, unknown>;
}

/**
 * Fetches sibling pages (from same parent database, up to MAX_SIBLINGS).
 * Uses search API since databases.query is not available in this SDK version.
 */
async function fetchSiblingPages(
  client: Client,
  integrationId: string,
  page: Record<string, unknown>,
  currentPageId: string
): Promise<Array<Record<string, unknown>>> {
  const parent = page.parent as Record<string, unknown> | undefined;
  if (!parent || parent.type !== "database_id") return [];

  await acquireToken(integrationId);
  const response = await client.search({
    filter: { property: "object", value: "page" },
    sort: { direction: "descending", timestamp: "last_edited_time" },
    page_size: MAX_SIBLINGS + 1,
  });

  return response.results
    .filter((p: any) => p.id !== currentPageId && p.parent?.database_id === parent.database_id)
    .slice(0, MAX_SIBLINGS)
    .map((p) => p as unknown as Record<string, unknown>);
}

/**
 * Extracts Linear URLs from Notion page blocks content.
 */
function extractLinearUrls(blocks: Array<Record<string, unknown>>): string[] {
  const linearUrlRegex =
    /https?:\/\/linear\.app\/[a-zA-Z0-9-]+\/issue\/[a-zA-Z0-9-]+/g;
  const urls = new Set<string>();

  for (const block of blocks) {
    const blockStr = JSON.stringify(block);
    const matches = blockStr.match(linearUrlRegex);
    if (matches) matches.forEach((url) => urls.add(url));
  }

  return Array.from(urls);
}

export interface NotionFetchResult {
  context: NotionPageContext;
  missingItems: Array<{ item: string; reason: string }>;
}

/**
 * Fetches all Notion context in parallel using Promise.allSettled.
 * Each fetch has a 30s timeout. Failed fetches are noted but don't block others.
 */
export async function fetchNotionContext(
  accessToken: string,
  integrationId: string,
  pageId: string
): Promise<NotionFetchResult> {
  const client = createNotionClient(accessToken);
  const missingItems: Array<{ item: string; reason: string }> = [];

  // First, fetch the page itself (needed for parent resolution)
  const pageResult = await fetchWithTimeout(
    () => fetchPage(client, integrationId, pageId),
    FETCH_TIMEOUT
  ).catch((err) => {
    missingItems.push({ item: "page", reason: err.message ?? "fetch failed" });
    return null;
  });

  // If we couldn't get the page, we still try to fetch blocks independently
  const [blocksResult, parentPageResult, parentDbResult, siblingsResult] =
    await Promise.allSettled([
      fetchWithTimeout(
        () => fetchBlocks(client, integrationId, pageId),
        FETCH_TIMEOUT
      ),
      pageResult
        ? fetchWithTimeout(
            () => fetchParentPage(client, integrationId, pageResult),
            FETCH_TIMEOUT
          )
        : Promise.resolve(null),
      pageResult
        ? fetchWithTimeout(
            () => fetchParentDatabase(client, integrationId, pageResult),
            FETCH_TIMEOUT
          )
        : Promise.resolve(null),
      pageResult
        ? fetchWithTimeout(
            () => fetchSiblingPages(client, integrationId, pageResult, pageId),
            FETCH_TIMEOUT
          )
        : Promise.resolve([]),
    ]);

  const blocks =
    blocksResult.status === "fulfilled" ? blocksResult.value : [];
  if (blocksResult.status === "rejected") {
    missingItems.push({ item: "blocks", reason: blocksResult.reason?.message ?? "fetch failed" });
  }

  const parentPage =
    parentPageResult.status === "fulfilled" ? parentPageResult.value : null;
  if (parentPageResult.status === "rejected") {
    missingItems.push({ item: "parentPage", reason: parentPageResult.reason?.message ?? "fetch failed" });
  }

  const parentDatabase =
    parentDbResult.status === "fulfilled" ? parentDbResult.value : null;
  if (parentDbResult.status === "rejected") {
    missingItems.push({ item: "parentDatabase", reason: parentDbResult.reason?.message ?? "fetch failed" });
  }

  const siblingPages =
    siblingsResult.status === "fulfilled" ? siblingsResult.value : [];
  if (siblingsResult.status === "rejected") {
    missingItems.push({ item: "siblingPages", reason: siblingsResult.reason?.message ?? "fetch failed" });
  }

  // Extract Linear URLs for cross-referencing
  const linkedLinearUrls = extractLinearUrls(blocks);

  return {
    context: {
      page: pageResult,
      blocks,
      parentPage,
      parentDatabase,
      siblingPages,
      linkedLinearUrls,
    },
    missingItems,
  };
}
