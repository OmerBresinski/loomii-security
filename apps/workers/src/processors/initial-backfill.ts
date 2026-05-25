/**
 * Phase 1: Initial Backfill Processor
 *
 * Orchestrates the full backfill pipeline:
 * 1. Look up tenant monitoring scope
 * 2. Fetch Linear issues (paginated, 90-day filter)
 * 3. Fetch Notion pages (paginated, 90-day filter) + page content
 * 4. Upsert Event records (deduplicated)
 * 5. Batch embed all items + persist to pgvector
 * 6. Group by Linear project vs orphans
 * 7. Cluster orphans via clusterByCosineSimilarity
 * 8. Create projects via createProjectsFromBackfill
 * 9. Fan out N risk-classification jobs
 *
 * Updates Redis progress hash throughout execution.
 */
import type { Job } from "bullmq";
import { LinearClient } from "@linear/sdk";
import { Client } from "@notionhq/client";
import { db, insertEmbedding } from "@loomii/db";
import { decrypt } from "@loomii/shared";
import {
  createRedisConnection,
  contextAssemblyQueue,
  type InitialBackfillPayload,
} from "@loomii/queue";
import type { Redis } from "ioredis";
import { generateEmbeddings } from "../lib/embeddings";
import { clusterByCosineSimilarity, cosineSimilarity } from "../lib/clustering";
import { getSiblingSummaries } from "../lib/sibling-context";
import {
  createProjectsFromBackfill,
  type LinearProjectMapping,
  type OrphanCluster,
  type ClusterItemRef,
} from "../lib/project-creation";
import { acquireToken } from "../lib/notion-rate-limiter";
import { logger } from "../lib/logger";

// ─── Constants ───────────────────────────────────────────────────────────────

const BACKFILL_KEY_PREFIX = "backfill:status:";
const BACKFILL_KEY_TTL = 3600; // 1 hour
const LINEAR_PAGE_SIZE = 50;
const NOTION_PAGE_SIZE = 100;
const CLUSTERING_THRESHOLD = 0.78;
const CLUSTERING_MIN_SIZE = 3;
const DB_BATCH_SIZE = 50;

// ─── Redis Singleton ─────────────────────────────────────────────────────────

let _redis: Redis | null = null;

function getRedis(): Redis {
  if (!_redis) {
    _redis = createRedisConnection();
  }
  return _redis;
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface BackfillItem {
  id: string; // Event ID (after upsert)
  externalId: string;
  source: "LINEAR" | "NOTION";
  title: string;
  content: string; // for embedding
  linearProjectId: string | null;
  linearProjectName: string | null;
  url: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Process an array in parallel batches of `size` */
async function batchParallel<T, R>(
  items: T[],
  size: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

// ─── Linear Fetching ─────────────────────────────────────────────────────────

async function fetchLinearIssues(
  accessToken: string,
  lookbackDays: number,
  scope: { projectIds?: string[]; teamIds?: string[] } | null
): Promise<BackfillItem[]> {
  const client = new LinearClient({ accessToken });
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  const items: BackfillItem[] = [];

  let hasMore = true;
  let endCursor: string | undefined;

  while (hasMore) {
    const filter: Record<string, unknown> = {
      createdAt: { gte: since.toISOString() },
    };

    // Apply scope filtering
    if (scope?.teamIds?.length) {
      filter.team = { id: { in: scope.teamIds } };
    }
    if (scope?.projectIds?.length) {
      filter.project = { id: { in: scope.projectIds } };
    }

    const result = await client.issues({
      first: LINEAR_PAGE_SIZE,
      after: endCursor,
      filter,
    });

    // Resolve all projects in parallel to avoid N+1
    const projects = await Promise.all(
      result.nodes.map((issue) => issue.project)
    );

    for (let i = 0; i < result.nodes.length; i++) {
      const issue = result.nodes[i];
      const project = projects[i];
      items.push({
        id: "", // will be set after event upsert
        externalId: issue.id,
        source: "LINEAR",
        title: issue.title,
        content: `${issue.title}\n\n${issue.description ?? ""}`.trim(),
        linearProjectId: project?.id ?? null,
        linearProjectName: project?.name ?? null,
        url: issue.url,
      });
    }

    hasMore = result.pageInfo.hasNextPage;
    endCursor = result.pageInfo.endCursor ?? undefined;
  }

  return items;
}

// ─── Notion Fetching ─────────────────────────────────────────────────────────

async function fetchNotionPages(
  accessToken: string,
  integrationId: string,
  lookbackDays: number,
  scope: { pageIds?: string[] } | null
): Promise<BackfillItem[]> {
  const client = new Client({ auth: accessToken });
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  const items: BackfillItem[] = [];

  let hasMore = true;
  let startCursor: string | undefined;

  while (hasMore) {
    await acquireToken(integrationId);

    const response = await client.search({
      filter: { property: "object", value: "page" },
      sort: { direction: "descending", timestamp: "last_edited_time" },
      page_size: NOTION_PAGE_SIZE,
      start_cursor: startCursor,
    });

    for (const result of response.results) {
      if (result.object !== "page") continue;
      const page = result as any;
      const lastEditedTime = new Date(page.last_edited_time);

      // Stop if beyond lookback window
      if (lastEditedTime < since) {
        hasMore = false;
        break;
      }

      // Apply scope filtering if configured
      if (scope?.pageIds?.length && !scope.pageIds.includes(page.id)) {
        continue;
      }

      // Extract title
      const titleProperty = page.properties?.title || page.properties?.Name;
      let title = "Untitled";
      if (titleProperty?.title?.[0]?.plain_text) {
        title = titleProperty.title[0].plain_text;
      }

      // Fetch page content (blocks) for embedding
      let content = title;
      try {
        await acquireToken(integrationId);
        const blocks = await client.blocks.children.list({
          block_id: page.id,
          page_size: 100,
        });
        const textBlocks = blocks.results
          .map((block: any) => {
            const richText =
              block.paragraph?.rich_text ||
              block.heading_1?.rich_text ||
              block.heading_2?.rich_text ||
              block.heading_3?.rich_text ||
              block.bulleted_list_item?.rich_text ||
              block.numbered_list_item?.rich_text ||
              block.toggle?.rich_text;
            if (!richText) return "";
            return richText.map((t: any) => t.plain_text).join("");
          })
          .filter(Boolean);
        if (textBlocks.length > 0) {
          content = `${title}\n\n${textBlocks.join("\n")}`;
        }
      } catch {
        // Non-fatal: use title only for embedding
      }

      const url = page.url ?? `https://notion.so/${page.id.replace(/-/g, "")}`;
      items.push({
        id: "",
        externalId: page.id,
        source: "NOTION",
        title,
        content: content.slice(0, 8000), // cap for embedding input
        linearProjectId: null,
        linearProjectName: null,
        url,
      });
    }

    if (hasMore && response.has_more && response.next_cursor) {
      startCursor = response.next_cursor;
    } else {
      hasMore = false;
    }
  }

  return items;
}

// ─── Unclustered Item Assignment ─────────────────────────────────────────────

const MIN_ASSIGNMENT_SIMILARITY = 0.3; // Low threshold since these are cross-domain matches

/**
 * Assigns unclustered orphan items to the nearest existing project
 * by comparing their embedding against each project's summaryEmbedding.
 * Creates ProjectSource records for assigned items.
 */
async function assignUnclusteredToProjects(
  tenantId: string,
  unclusteredIds: string[],
  orphanMap: Map<string, { item: BackfillItem; embedding: number[] }>,
  childLogger: typeof logger
): Promise<number> {
  let assignedCount = 0;

  // Fetch project summary embeddings
  const projectEmbeddings = await db.$queryRaw<Array<{ id: string; embedding: string }>>`
    SELECT id, summary_embedding::text as embedding
    FROM projects
    WHERE tenant_id = ${tenantId}
      AND summary_embedding IS NOT NULL
  `;

  // Parse embedding strings back to number arrays
  const projects = projectEmbeddings.map((p) => ({
    id: p.id,
    embedding: JSON.parse(`[${p.embedding.slice(1, -1)}]`) as number[],
  }));

  if (projects.length === 0) return 0;

  for (const itemId of unclusteredIds) {
    const orphan = orphanMap.get(itemId);
    if (!orphan) continue;

    // Find most similar project
    let bestProjectId: string | null = null;
    let bestSimilarity = -Infinity;

    for (const project of projects) {
      const similarity = cosineSimilarity(orphan.embedding, project.embedding);
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestProjectId = project.id;
      }
    }

    if (!bestProjectId || bestSimilarity < MIN_ASSIGNMENT_SIMILARITY) continue;

    // Create ProjectSource link
    try {
      await db.projectSource.create({
        data: {
          projectId: bestProjectId,
          sourceType: orphan.item.source === "LINEAR" ? "LINEAR_ISSUE" : "NOTION_PAGE",
          sourceId: orphan.item.externalId,
          linkedBy: "AUTO",
          linkReason: {
            method: "embedding_nearest_project",
            similarity: Math.round(bestSimilarity * 100) / 100,
          },
        },
      });
      assignedCount++;
    } catch (err: any) {
      if (err?.code === "P2002") continue;
      childLogger.warn({ itemId, error: err.message }, "Failed to assign unclustered item");
    }
  }

  return assignedCount;
}

// ─── Main Processor ──────────────────────────────────────────────────────────

export async function processInitialBackfill(job: Job<InitialBackfillPayload>): Promise<void> {
  const { tenantId, linearIntegrationId, notionIntegrationId, lookbackDays } = job.data;
  const redis = getRedis();
  const redisKey = `${BACKFILL_KEY_PREFIX}${tenantId}`;

  const childLogger = logger.child({
    queue: "initial-backfill",
    jobId: job.id,
    jobName: job.name,
    tenantId,
  });

  childLogger.info({ lookbackDays }, "Starting initial backfill");

  try {
    // ─── Step 1: Look up monitoring scope + decrypt tokens ─────────────────

    let linearAccessToken: string | null = null;
    let linearScope: { projectIds?: string[]; teamIds?: string[] } | null = null;

    if (linearIntegrationId) {
      const integration = await db.integration.findUnique({
        where: { id: linearIntegrationId },
        select: { accessToken: true, metadata: true },
      });
      if (integration?.accessToken) {
        linearAccessToken = decrypt(integration.accessToken);
        const meta = (integration.metadata ?? {}) as Record<string, any>;
        linearScope = meta.monitoringScope ?? null;
      }
    }

    let notionAccessToken: string | null = null;
    let notionScope: { pageIds?: string[] } | null = null;

    if (notionIntegrationId) {
      const integration = await db.integration.findUnique({
        where: { id: notionIntegrationId },
        select: { accessToken: true, metadata: true },
      });
      if (integration?.accessToken) {
        notionAccessToken = decrypt(integration.accessToken);
        const meta = (integration.metadata ?? {}) as Record<string, any>;
        notionScope = meta.monitoringScope ?? null;
      }
    }

    await job.updateProgress(5);

    // ─── Step 2+3: Fetch items (parallel, partial-failure tolerant) ────────

    const [linearResult, notionResult] = await Promise.allSettled([
      linearAccessToken
        ? fetchLinearIssues(linearAccessToken, lookbackDays, linearScope)
        : Promise.resolve([]),
      notionAccessToken && notionIntegrationId
        ? fetchNotionPages(notionAccessToken, notionIntegrationId, lookbackDays, notionScope)
        : Promise.resolve([]),
    ]);

    const linearItems = linearResult.status === "fulfilled" ? linearResult.value : [];
    const notionItems = notionResult.status === "fulfilled" ? notionResult.value : [];

    if (linearResult.status === "rejected") {
      childLogger.error({ error: linearResult.reason }, "Linear fetch failed (continuing)");
    }
    if (notionResult.status === "rejected") {
      childLogger.error({ error: notionResult.reason }, "Notion fetch failed (continuing)");
    }

    const allItems = [...linearItems, ...notionItems];

    childLogger.info(
      { linearCount: linearItems.length, notionCount: notionItems.length, total: allItems.length },
      "Items fetched"
    );

    await job.updateProgress(20);

    // ─── Early exit: no items found ───────────────────────────────────────

    if (allItems.length === 0) {
      await redis.hset(redisKey, {
        status: "triage_complete",
        total: "0",
        projects: "0",
        classified: "0",
        highRisk: "0",
        message: "No items found in workspace.",
      });
      await redis.expire(redisKey, BACKFILL_KEY_TTL);
      childLogger.info("No items found, marking as complete");
      return;
    }

    // ─── Step 4: Update Redis with total ──────────────────────────────────

    await redis.hset(redisKey, {
      status: "scanning",
      total: String(allItems.length),
      message: `Scanning & organizing ${allItems.length} items...`,
    });

    // ─── Step 5: Upsert Event records (batched in parallel) ───────────────

    await batchParallel(allItems, DB_BATCH_SIZE, async (item) => {
      const eventType = item.source === "LINEAR" ? "issue.discovered" : "page.discovered";
      const integrationId = item.source === "LINEAR" ? linearIntegrationId! : notionIntegrationId!;

      const event = await db.event.upsert({
        where: {
          tenantId_source_externalId_type: {
            tenantId,
            source: item.source,
            externalId: item.externalId,
            type: eventType,
          },
        },
        update: {
          payload: { title: item.title, url: item.url },
          status: "PENDING",
          updatedAt: new Date(),
        },
        create: {
          tenantId,
          integrationId,
          source: item.source,
          externalId: item.externalId,
          type: eventType,
          status: "PENDING",
          payload: { title: item.title, url: item.url },
        },
      });

      item.id = event.id;
      return event;
    });

    childLogger.info("Event records upserted");
    await job.updateProgress(40);

    // ─── Step 6: Batch embed + persist to pgvector ────────────────────────

    const chunks = allItems.map((item, index) => ({
      index,
      content: item.content,
    }));

    const embeddingResults = await generateEmbeddings(chunks);

    // Persist embeddings in parallel batches
    await batchParallel(embeddingResults, DB_BATCH_SIZE, async (result) => {
      const item = allItems[result.index];
      await insertEmbedding(db, {
        id: `backfill-${item.id}`,
        tenantId,
        documentId: item.externalId,
        chunk: 0,
        content: result.content.slice(0, 2000),
        vector: result.vector,
        metadata: { source: item.source, backfill: true },
      });
    });

    childLogger.info({ count: embeddingResults.length }, "Embeddings generated and persisted");
    await job.updateProgress(60);

    // ─── Step 7: Group by Linear project vs orphans ───────────────────────

    const linearProjectMap = new Map<string, LinearProjectMapping>();
    const orphanItems: Array<{ item: BackfillItem; embedding: number[] }> = [];

    for (let i = 0; i < allItems.length; i++) {
      const item = allItems[i];
      const embedding = embeddingResults[i].vector;

      if (item.linearProjectId && item.linearProjectName) {
        const existing = linearProjectMap.get(item.linearProjectId);
        if (existing) {
          existing.itemIds.push(item.externalId);
        } else {
          linearProjectMap.set(item.linearProjectId, {
            linearProjectId: item.linearProjectId,
            linearProjectName: item.linearProjectName,
            itemIds: [item.externalId],
          });
        }
      } else {
        orphanItems.push({ item, embedding });
      }
    }

    const linearProjects = Array.from(linearProjectMap.values());

    childLogger.info(
      { linearProjects: linearProjects.length, orphans: orphanItems.length },
      "Items grouped"
    );

    // ─── Step 8: Cluster orphans ──────────────────────────────────────────

    const clusterInput = orphanItems.map(({ item, embedding }) => ({
      id: item.externalId,
      embedding,
    }));

    const clusterResult = clusterByCosineSimilarity(clusterInput, {
      similarityThreshold: CLUSTERING_THRESHOLD,
      minClusterSize: CLUSTERING_MIN_SIZE,
    });

    // Build OrphanCluster[] for project creation using a Map for O(1) lookups
    const orphanMap = new Map(orphanItems.map((o) => [o.item.externalId, o]));

    const orphanClusters: OrphanCluster[] = clusterResult.clusters.map((cluster) => {
      const clusterItems = cluster.items.map((itemId) => orphanMap.get(itemId)!.item);

      return {
        items: clusterItems.map((item): ClusterItemRef => ({
          id: item.externalId,
          sourceType: item.source === "LINEAR" ? "LINEAR_ISSUE" : "NOTION_PAGE",
        })),
        centroid: cluster.centroid,
        titles: clusterItems.map((item) => item.title),
        contentSnippets: clusterItems.map((item) => item.content.slice(0, 200)),
      };
    });

    childLogger.info(
      { clusters: orphanClusters.length, unclustered: clusterResult.unclustered.length },
      "Orphans clustered"
    );

    await job.updateProgress(70);

    // ─── Step 9: Create projects ──────────────────────────────────────────

    const projectResult = await createProjectsFromBackfill(
      tenantId,
      linearProjects,
      orphanClusters,
      db,
      { similarityThreshold: CLUSTERING_THRESHOLD }
    );

    childLogger.info(
      { created: projectResult.created.length, skipped: projectResult.skipped.length },
      "Projects created"
    );

    // ─── Step 9b: Assign unclustered items to nearest project ─────────────
    // Items that didn't cluster get matched to the most similar existing project
    // by comparing their embedding against project summaryEmbeddings.

    if (clusterResult.unclustered.length > 0 && projectResult.created.length > 0) {
      const unclusteredAssigned = await assignUnclusteredToProjects(
        tenantId,
        clusterResult.unclustered,
        orphanMap,
        childLogger
      );
      childLogger.info(
        { assigned: unclusteredAssigned },
        "Unclustered items assigned to nearest projects"
      );
    }

    await job.updateProgress(85);

    // ─── Step 10: Enqueue per-source context-assembly jobs ────────────────
    // Each source event gets its own review via the standard pipeline.
    // Sibling context is injected for cross-document awareness.

    const itemMap = new Map(allItems.map((item) => [item.externalId, item]));

    // Build a lookup: projectId -> items in that project
    const projectItemsMap = new Map<string, typeof allItems>();
    for (const created of projectResult.created) {
      const projectItems = created.itemIds
        .map((id) => itemMap.get(id))
        .filter((item): item is BackfillItem => item !== undefined);
      projectItemsMap.set(created.projectId, projectItems);
    }

    // Enqueue one context-assembly job per source event
    let reviewsEnqueued = 0;
    for (const created of projectResult.created) {
      const projectItems = projectItemsMap.get(created.projectId) ?? [];

      for (const item of projectItems) {
        // Find the event record for this item
        const event = await db.event.findFirst({
          where: { tenantId, externalId: item.externalId },
          select: { id: true, source: true },
        });

        if (!event) continue;

        // Generate sibling context for cross-document awareness
        const siblingContext = getSiblingSummaries(
          projectItems.map((i) => ({
            id: i.externalId,
            title: i.title,
            content: i.content,
            projectId: created.projectId,
          })),
          item.externalId,
          created.projectId
        );

        // Enqueue through standard pipeline (context-assembly -> risk-classification -> review-generation)
        await contextAssemblyQueue.add("backfill-source", {
          eventId: event.id,
          tenantId,
          sourceType: event.source.toLowerCase() as "linear" | "notion",
          sourceId: item.externalId,
          projectId: created.projectId,
        });

        reviewsEnqueued++;
      }
    }

    childLogger.info(
      { reviewsEnqueued },
      "Per-source reviews enqueued via context-assembly pipeline"
    );

    await job.updateProgress(90);

    // ─── Step 11: Mark as triage_complete ─────────────────────────────────

    await redis.hset(redisKey, {
      status: "triage_complete",
      projects: String(projectResult.created.length),
      classified: String(allItems.length),
      highRisk: String(projectResult.created.length),
      message: `Scan complete! ${projectResult.created.length} projects discovered, ${reviewsEnqueued} source reviews generating.`,
    });

    childLogger.info(
      { total: allItems.length, projects: projectResult.created.length, reviewsEnqueued },
      "Backfill Phase 1 complete - per-source reviews enqueued"
    );
    await job.updateProgress(100);
  } catch (err) {
    childLogger.error({ error: err }, "Initial backfill failed");

    // Update Redis with error status
    await redis.hset(redisKey, {
      status: "error",
      message: "Initial backfill failed. Please retry.",
    });
    await redis.expire(redisKey, BACKFILL_KEY_TTL);

    throw err; // Let BullMQ handle the failure
  }
}
