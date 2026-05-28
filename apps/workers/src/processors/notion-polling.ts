/**
 * Notion Polling Processor
 *
 * Processes notion-polling queue jobs (triggered every 2 min per tenant).
 * Workflow:
 * 1. Load integration record and decrypt access token
 * 2. Call Notion search API for pages modified since lastPollAt
 * 3. Handle pagination (Notion returns max 100 results per page)
 * 4. Create Event record for each changed page (deduplicated via upsert)
 * 5. Enqueue context-assembly job for non-duplicate events
 * 6. Update integration.lastPollAt after successful poll
 *
 * Rate limiting: max 3 req/s per integration (token bucket).
 * First poll (lastPollAt = null): use 5 minutes ago as starting point.
 */
import type { Job } from "bullmq";
import { Client } from "@notionhq/client";
import { db } from "@loomii/db";
import { decrypt } from "@loomii/shared";
import type { NotionPollingPayload } from "@loomii/queue";
import { acquireToken } from "../lib/notion-rate-limiter";
import { enqueueWithDebounce } from "../lib/debounce";
import { logger } from "../lib/logger";

/** Default lookback window for first poll (5 minutes ago) */
const FIRST_POLL_LOOKBACK_MS = 5 * 60 * 1000;

/**
 * Create a Notion client from a decrypted access token.
 */
function createNotionClient(accessToken: string): Client {
  return new Client({ auth: accessToken });
}

/**
 * Determine the "since" timestamp for filtering changed pages.
 * If lastPollAt is null (first poll), use 5 minutes ago.
 */
function getLastPollTimestamp(lastPollAt: Date | null): string {
  if (lastPollAt) {
    return lastPollAt.toISOString();
  }
  // First poll: look back 5 minutes
  return new Date(Date.now() - FIRST_POLL_LOOKBACK_MS).toISOString();
}

/**
 * Search Notion for pages modified since the given timestamp.
 * Handles pagination (max 100 results per page from Notion).
 * Respects rate limits via token bucket.
 */
async function fetchChangedPages(
  client: Client,
  integrationId: string,
  since: string
): Promise<Array<{ id: string; lastEditedTime: string; title: string; url: string }>> {
  const changedPages: Array<{
    id: string;
    lastEditedTime: string;
    title: string;
    url: string;
  }> = [];

  let hasMore = true;
  let startCursor: string | undefined;

  while (hasMore) {
    // Respect rate limit before each API call
    await acquireToken(integrationId);

    const response = await client.search({
      filter: {
        property: "object",
        value: "page",
      },
      sort: {
        direction: "descending",
        timestamp: "last_edited_time",
      },
      page_size: 100,
      start_cursor: startCursor,
    });

    // Process results - only include pages modified since lastPollAt
    for (const result of response.results) {
      if (result.object !== "page") continue;

      const page = result as any;
      const lastEditedTime = page.last_edited_time;

      // Stop if we've gone past our time window.
      // Notion rounds last_edited_time to the nearest minute (e.g., "2026-05-28T20:58:00.000Z")
      // but our `since` has millisecond precision. To avoid missing edits within the same
      // minute window, we truncate both to minute-level before comparing.
      const editMinute = lastEditedTime.slice(0, 16); // "2026-05-28T20:58"
      const sinceMinute = since.slice(0, 16);
      if (editMinute < sinceMinute) {
        hasMore = false;
        break;
      }

      // Extract page title
      const titleProperty = page.properties?.title || page.properties?.Name;
      let title = "Untitled";
      if (titleProperty?.title?.[0]?.plain_text) {
        title = titleProperty.title[0].plain_text;
      } else if (titleProperty?.type === "title" && titleProperty.title?.[0]) {
        title = titleProperty.title[0].plain_text ?? "Untitled";
      }

      changedPages.push({
        id: page.id,
        lastEditedTime,
        title,
        url: page.url ?? `https://notion.so/${page.id.replace(/-/g, "")}`,
      });
    }

    // Handle pagination
    if (hasMore && response.has_more && response.next_cursor) {
      startCursor = response.next_cursor;
    } else {
      hasMore = false;
    }
  }

  return changedPages;
}

/**
 * Main processor function for the notion-polling queue.
 */
export async function processNotionPolling(
  job: Job<NotionPollingPayload>
): Promise<void> {
  const { tenantId, integrationId } = job.data;

  const childLogger = logger.child({
    queue: "notion-polling",
    jobId: job.id,
    jobName: job.name,
    tenantId,
    integrationId,
  });

  childLogger.info("Starting Notion poll");

  // 1. Load integration and decrypt token
  const integration = await db.integration.findUnique({
    where: { id: integrationId },
  });

  if (!integration) {
    childLogger.error("Integration not found, skipping poll");
    return;
  }

  if (integration.status !== "ACTIVE") {
    childLogger.warn(
      { status: integration.status },
      "Integration not active, skipping poll"
    );
    return;
  }

  if (!integration.accessToken) {
    childLogger.error("No access token found, skipping poll");
    return;
  }

  const accessToken = decrypt(integration.accessToken);
  const client = createNotionClient(accessToken);

  // 2. Determine time window
  const since = getLastPollTimestamp(integration.lastSyncAt);
  childLogger.info({ since }, "Polling for changes since");

  // 3. Fetch changed pages with pagination and rate limiting
  const changedPages = await fetchChangedPages(client, integrationId, since);

  childLogger.info(
    { changedCount: changedPages.length },
    "Found changed pages"
  );

  // 4. Create events and enqueue context assembly for each changed page
  let newEventCount = 0;

  for (const page of changedPages) {
    // Determine event type based on whether we've seen this page before
    const eventType = "page.updated";

    // Upsert event (deduplicate by tenantId + source + externalId + type)
    const event = await db.event.upsert({
      where: {
        tenantId_source_externalId_type: {
          tenantId,
          source: "NOTION",
          externalId: page.id,
          type: eventType,
        },
      },
      update: {
        payload: {
          pageId: page.id,
          title: page.title,
          url: page.url,
          lastEditedTime: page.lastEditedTime,
          detectedAt: new Date().toISOString(),
        },
        status: "PENDING",
        updatedAt: new Date(),
      },
      create: {
        tenantId,
        integrationId,
        source: "NOTION",
        externalId: page.id,
        type: eventType,
        status: "PENDING",
        payload: {
          pageId: page.id,
          title: page.title,
          url: page.url,
          lastEditedTime: page.lastEditedTime,
          detectedAt: new Date().toISOString(),
        },
      },
    });

    // Only enqueue project matching if the event was newly created
    // (createdAt === updatedAt indicates a new record, not an update)
    const isNew =
      event.createdAt.getTime() === event.updatedAt.getTime() ||
      Math.abs(event.createdAt.getTime() - event.updatedAt.getTime()) < 1000;

    if (isNew) {
      await enqueueWithDebounce({
        eventId: event.id,
        tenantId,
        sourceType: "notion",
        sourceId: page.id,
        content: page.title ?? "",
      });
      newEventCount++;
    } else {
      // Source was updated — re-process with a longer debounce (5 min)
      // to allow the user to finish editing before triggering a re-review
      await enqueueWithDebounce(
        {
          eventId: event.id,
          tenantId,
          sourceType: "notion",
          sourceId: page.id,
          content: page.title ?? "",
        },
        { delayMs: 5 * 60_000 }
      );
      newEventCount++;
    }
  }

  // 5. Update lastPollAt
  await db.integration.update({
    where: { id: integrationId },
    data: { lastSyncAt: new Date() },
  });

  childLogger.info(
    {
      totalChanged: changedPages.length,
      newEvents: newEventCount,
      durationMs: Date.now() - (job.processedOn ?? Date.now()),
    },
    "Notion poll completed"
  );
}
