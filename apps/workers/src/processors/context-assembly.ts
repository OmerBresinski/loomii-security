/**
 * Context Assembly Processor
 *
 * Processes context-assembly queue jobs. When a change is detected (webhook/poll),
 * this worker fetches ALL related context so downstream consumers (risk classifier,
 * review agent) have full context without making additional API calls.
 *
 * Flow:
 * 1. Look up event + integration token (decrypt)
 * 2. Determine source (LINEAR / NOTION)
 * 3. Parallel fetch all related context (Promise.allSettled, 30s per-fetch timeout)
 * 4. Resolve cross-references (Notion URLs in Linear, Linear URLs in Notion)
 * 5. Save ContextBundle with assembled content
 * 6. Enqueue risk-classification and embedding-generation jobs
 *
 * Overall assembly timeout: 2 minutes.
 */
import type { Job } from "bullmq";
import { db } from "@loomii/db";
import {
  riskClassificationQueue,
  embeddingQueue,
  incrementalReviewQueue,
  type ContextAssemblyPayload,
} from "@loomii/queue";
import { decrypt } from "@loomii/shared";
import { fetchLinearContext } from "../lib/linear-fetcher";
import { fetchNotionContext } from "../lib/notion-fetcher";
import { resolveCrossReferences } from "../lib/cross-reference";
import { fetchProjectContext } from "../lib/project-context";
import { logger } from "../lib/logger";

const OVERALL_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

export async function processContextAssembly(
  job: Job<ContextAssemblyPayload>
): Promise<void> {
  const { eventId, tenantId, sourceType, sourceId, projectId, siblingContext } = job.data;

  const childLogger = logger.child({
    queue: "context-assembly",
    jobId: job.id,
    jobName: job.name,
    tenantId,
    eventId,
    sourceType,
    sourceId,
    projectId: projectId ?? null,
  });

  childLogger.info("Starting context assembly");

  // Overall 2-minute timeout
  const assemblyResult = await Promise.race([
    assembleContext({ eventId, tenantId, sourceType, sourceId, projectId: projectId ?? null, siblingContext, childLogger }),
    createOverallTimeout(OVERALL_TIMEOUT_MS),
  ]);

  if (assemblyResult === "TIMEOUT") {
    childLogger.warn("Context assembly hit 2-minute overall timeout");
    // Save whatever we have (partial bundle)
    await savePartialBundle(eventId, tenantId, childLogger);
    return;
  }

  childLogger.info(
    { durationMs: Date.now() - (job.processedOn ?? Date.now()) },
    "Context assembly completed"
  );
}

function createOverallTimeout(
  ms: number
): Promise<"TIMEOUT"> {
  return new Promise((resolve) => setTimeout(() => resolve("TIMEOUT"), ms));
}

interface AssembleParams {
  eventId: string;
  tenantId: string;
  sourceType: "linear" | "notion";
  sourceId: string;
  projectId: string | null;
  siblingContext?: string;
  childLogger: typeof logger;
}

async function assembleContext(params: AssembleParams): Promise<"DONE"> {
  const { eventId, tenantId, sourceType, sourceId, projectId, siblingContext, childLogger } = params;

  // 1. Look up the event
  const event = await db.event.findUnique({
    where: { id: eventId },
    include: { integration: true },
  });

  if (!event) {
    childLogger.error("Event not found, skipping assembly");
    return "DONE";
  }

  if (!event.integration) {
    childLogger.error("Integration not found for event, skipping assembly");
    return "DONE";
  }

  if (!event.integration.accessToken) {
    childLogger.error("No access token for integration, skipping assembly");
    return "DONE";
  }

  // Mark event as processing
  await db.event.update({
    where: { id: eventId },
    data: { status: "PROCESSING" },
  });

  // Decrypt the access token
  const accessToken = decrypt(event.integration.accessToken);
  const integrationId = event.integration.id;

  // 2. Look up the other integration for cross-referencing
  const otherProvider = sourceType === "linear" ? "NOTION" : "LINEAR";
  const otherIntegration = await db.integration.findFirst({
    where: {
      tenantId,
      provider: otherProvider,
      status: "ACTIVE",
    },
  });

  const otherAccessToken = otherIntegration?.accessToken
    ? decrypt(otherIntegration.accessToken)
    : null;
  const otherIntegrationId = otherIntegration?.id ?? null;

  // 3. Fetch primary context based on source type
  let content: Record<string, unknown>;
  let missingItems: Array<{ item: string; reason: string }> = [];
  let title: string | null = null;

  if (sourceType === "linear") {
    childLogger.info("Fetching Linear context");
    const linearResult = await fetchLinearContext(accessToken, sourceId);
    missingItems.push(...linearResult.missingItems);

    // 4. Resolve cross-references (Notion docs linked in Linear content)
    const crossRefResult = await resolveCrossReferences({
      notionUrls: linearResult.context.linkedNotionUrls,
      linearUrls: [], // No Linear URLs to resolve when source is Linear
      notionAccessToken: otherAccessToken,
      notionIntegrationId: otherIntegrationId,
      linearAccessToken: null,
    });
    missingItems.push(...crossRefResult.missingItems);

    title =
      (linearResult.context.ticket?.title as string) ??
      (event.payload as any)?.title ??
      null;

    content = {
      source: "linear",
      sourceId,
      assembledAt: new Date().toISOString(),
      primary: linearResult.context,
      crossReferences: {
        notionDocs: crossRefResult.notionDocs,
        linearIssues: crossRefResult.linearIssues,
      },
    };
  } else {
    childLogger.info("Fetching Notion context");
    const notionResult = await fetchNotionContext(
      accessToken,
      integrationId,
      sourceId
    );
    missingItems.push(...notionResult.missingItems);

    // 4. Resolve cross-references (Linear issues linked in Notion content)
    const crossRefResult = await resolveCrossReferences({
      notionUrls: [], // No Notion URLs to resolve when source is Notion
      linearUrls: notionResult.context.linkedLinearUrls,
      notionAccessToken: null,
      notionIntegrationId: null,
      linearAccessToken: otherAccessToken,
    });
    missingItems.push(...crossRefResult.missingItems);

    title = (event.payload as any)?.title ?? null;

    content = {
      source: "notion",
      sourceId,
      assembledAt: new Date().toISOString(),
      primary: notionResult.context,
      crossReferences: {
        notionDocs: crossRefResult.notionDocs,
        linearIssues: crossRefResult.linearIssues,
      },
    };
  }

  // 5. Enrich with project context (if projectId provided)
  let projectContextData: Awaited<ReturnType<typeof fetchProjectContext>> = null;

  if (projectId) {
    try {
      const eventText = title ?? JSON.stringify(content).slice(0, 5000);
      projectContextData = await fetchProjectContext(projectId, sourceId, eventText);

      if (projectContextData) {
        childLogger.info(
          { relatedSourceCount: projectContextData.relatedSources.length },
          "Project context enrichment completed"
        );
      }
    } catch (err) {
      // Project enrichment failure should not block assembly
      const error = err instanceof Error ? err : new Error(String(err));
      childLogger.warn(
        { error: error.message },
        "Project context enrichment failed, proceeding without"
      );
    }
  }

  // 6. Save ContextBundle
  childLogger.info(
    { missingCount: missingItems.length, missingItems: missingItems.length > 0 ? missingItems : undefined },
    "Saving context bundle"
  );

  // Check for existing bundle + review for same source (incremental review branching)
  // Each source change creates a new Event, so we look up by externalId (sourceId)
  // to find any previous ContextBundle that already has a completed review.
  const existingBundle = await db.contextBundle.findFirst({
    where: {
      tenantId,
      event: {
        externalId: sourceId,
        source: sourceType === "linear" ? "LINEAR" : "NOTION",
      },
      review: {
        status: { in: ["READY", "PUBLISHED"] },
      },
    },
    select: {
      id: true,
      content: true,
      review: {
        select: { id: true, status: true },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const hasExistingReview = existingBundle?.review != null;
  const previousContent = hasExistingReview ? existingBundle.content : null;

  const bundle = await db.contextBundle.upsert({
    where: { eventId },
    update: {
      status: "READY",
      title,
      content: {
        ...content,
        missingItems,
        ...(projectContextData ? { projectContext: projectContextData.formatted } : {}),
        ...(siblingContext ? { siblingContext } : {}),
      },
      projectId: projectId ?? null,
      updatedAt: new Date(),
    },
    create: {
      tenantId,
      eventId,
      status: "READY",
      title,
      content: {
        ...content,
        missingItems,
        ...(projectContextData ? { projectContext: projectContextData.formatted } : {}),
        ...(siblingContext ? { siblingContext } : {}),
      },
      projectId: projectId ?? null,
    },
  });

  // Mark event as completed
  await db.event.update({
    where: { id: eventId },
    data: { status: "COMPLETED", processedAt: new Date() },
  });

  // 6. Enqueue downstream jobs (branch: incremental vs full pipeline)
  childLogger.info("Enqueueing downstream jobs");

  if (hasExistingReview && previousContent && existingBundle) {
    // Source already has a completed review — run incremental update
    childLogger.info(
      { reviewId: existingBundle.review!.id, previousBundleId: existingBundle.id },
      "Existing review detected, enqueueing incremental-review"
    );

    await Promise.allSettled([
      incrementalReviewQueue.add(
        "incremental",
        {
          tenantId,
          contextBundleId: bundle.id,
          reviewId: existingBundle.review!.id,
          previousContent: previousContent as Record<string, unknown>,
          newContent: content as Record<string, unknown>,
        },
        {
          attempts: 3,
          backoff: { type: "exponential", delay: 5000 },
        }
      ),
      // Embedding generation still runs (search index stays fresh)
      embeddingQueue.add("generate", {
        tenantId,
        documentId: bundle.id,
        content: JSON.stringify(content),
      }),
    ]);
  } else {
    // No existing review (or ERROR/GENERATING) — full pipeline
    await Promise.allSettled([
      riskClassificationQueue.add("classify", {
        tenantId,
        contextId: bundle.id,
        designDocId: sourceId,
      }),
      embeddingQueue.add("generate", {
        tenantId,
        documentId: bundle.id,
        content: JSON.stringify(content),
      }),
    ]);
  }

  childLogger.info(
    { bundleId: bundle.id, missingItems: missingItems.length },
    "Context assembly and downstream enqueueing complete"
  );

  return "DONE";
}

/**
 * Saves a partial bundle when overall timeout is hit.
 */
async function savePartialBundle(
  eventId: string,
  tenantId: string,
  childLogger: typeof logger
): Promise<void> {
  try {
    const bundle = await db.contextBundle.upsert({
      where: { eventId },
      update: {
        status: "READY",
        content: {
          source: "unknown",
          assembledAt: new Date().toISOString(),
          error: "Assembly timed out after 2 minutes",
          missingItems: [{ item: "all", reason: "Overall assembly timeout" }],
        },
        updatedAt: new Date(),
      },
      create: {
        tenantId,
        eventId,
        status: "READY",
        content: {
          source: "unknown",
          assembledAt: new Date().toISOString(),
          error: "Assembly timed out after 2 minutes",
          missingItems: [{ item: "all", reason: "Overall assembly timeout" }],
        },
      },
    });

    // Still enqueue downstream even for partial bundles
    await Promise.allSettled([
      riskClassificationQueue.add("classify", {
        tenantId,
        contextId: bundle.id,
        designDocId: eventId,
      }),
      embeddingQueue.add("generate", {
        tenantId,
        documentId: bundle.id,
        content: JSON.stringify(bundle.content),
      }),
    ]);

    await db.event.update({
      where: { id: eventId },
      data: { status: "COMPLETED", processedAt: new Date() },
    });
  } catch (err) {
    childLogger.error({ err }, "Failed to save partial bundle after timeout");
  }
}
