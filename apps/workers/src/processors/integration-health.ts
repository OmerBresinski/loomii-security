/**
 * Integration Health Check Processor
 *
 * Main processor for the `integration-health` queue.
 * Handles two job types by name:
 * - "refresh": Token refresh sweep (every 15 min)
 * - "check": Health check sweep (every 30 min)
 *
 * Health Check Flow:
 * 1. Query all ACTIVE integrations
 * 2. For Linear: call viewer query to verify token works
 * 3. For Notion: call search to verify token works (only every 6 hours)
 * 4. If verification fails: mark integration as ERROR, publish event
 *
 * Token Refresh Flow: Delegated to token-refresh.ts
 */
import type { Job } from "bullmq";
import { db } from "@loomii/db";
import { eventsQueue, type IntegrationHealthPayload } from "@loomii/queue";
import { decrypt } from "@loomii/shared";
import { LinearClient } from "@linear/sdk";
import { Client as NotionClient } from "@notionhq/client";
import { refreshExpiringTokens } from "./token-refresh";
import { logger } from "../lib/logger";

/** Notion is only health-checked every 6 hours */
const NOTION_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Main processor for the integration-health queue.
 * Dispatches based on job name.
 */
export async function processIntegrationHealth(
  job: Job<IntegrationHealthPayload>
): Promise<void> {
  const childLogger = logger.child({
    queue: "integration-health",
    jobId: job.id,
    jobName: job.name,
  });

  switch (job.name) {
    case "refresh":
      childLogger.info("Starting token refresh sweep");
      const refreshResults = await refreshExpiringTokens();
      childLogger.info(
        {
          total: refreshResults.length,
          succeeded: refreshResults.filter((r) => r.success).length,
          failed: refreshResults.filter((r) => !r.success).length,
        },
        "Token refresh sweep completed"
      );
      break;

    case "check":
      childLogger.info("Starting integration health check sweep");
      await runHealthCheckSweep(childLogger);
      break;

    default:
      // Individual integration check (from payload)
      if (job.data?.integrationId) {
        await checkSingleIntegration(job.data, childLogger);
      } else {
        childLogger.warn({ jobName: job.name }, "Unknown job name, skipping");
      }
  }
}

/**
 * Run health check sweep: find all active integrations and verify them.
 */
async function runHealthCheckSweep(childLogger: typeof logger): Promise<void> {
  const integrations = await db.integration.findMany({
    where: { status: "ACTIVE" },
  });

  if (integrations.length === 0) {
    childLogger.info("No active integrations to check");
    return;
  }

  childLogger.info({ count: integrations.length }, "Checking active integrations");

  let healthy = 0;
  let unhealthy = 0;
  let skipped = 0;

  for (const integration of integrations) {
    // For Notion: only check every 6 hours
    if (integration.provider === "NOTION") {
      const metadata = (integration.metadata as Record<string, unknown>) ?? {};
      const lastHealthCheck = metadata.lastHealthCheckAt as string | undefined;

      if (lastHealthCheck) {
        const elapsed = Date.now() - new Date(lastHealthCheck).getTime();
        if (elapsed < NOTION_CHECK_INTERVAL_MS) {
          skipped++;
          continue;
        }
      }
    }

    const isHealthy = await verifyIntegration(integration, childLogger);
    if (isHealthy) {
      healthy++;
    } else {
      unhealthy++;
    }
  }

  childLogger.info(
    { healthy, unhealthy, skipped },
    "Health check sweep completed"
  );
}

/**
 * Check a single integration by payload.
 */
async function checkSingleIntegration(
  payload: IntegrationHealthPayload,
  childLogger: typeof logger
): Promise<void> {
  const integration = await db.integration.findUnique({
    where: { id: payload.integrationId },
  });

  if (!integration) {
    childLogger.warn({ integrationId: payload.integrationId }, "Integration not found");
    return;
  }

  await verifyIntegration(integration, childLogger);
}

/**
 * Verify a single integration's token by calling its provider API.
 * Returns true if healthy, false if unhealthy (and marks as ERROR).
 */
async function verifyIntegration(
  integration: {
    id: string;
    tenantId: string;
    provider: string;
    accessToken: string | null;
    metadata: unknown;
  },
  childLogger: typeof logger
): Promise<boolean> {
  const integrationLogger = childLogger.child({
    integrationId: integration.id,
    provider: integration.provider,
    tenantId: integration.tenantId,
  });

  if (!integration.accessToken) {
    integrationLogger.warn("No access token, skipping health check");
    return false;
  }

  try {
    const accessToken = decrypt(integration.accessToken);

    if (integration.provider === "LINEAR") {
      await verifyLinearToken(accessToken);
    } else if (integration.provider === "NOTION") {
      await verifyNotionToken(accessToken);
    }

    // Update last health check timestamp
    const metadata = (integration.metadata as Record<string, unknown>) ?? {};
    await db.integration.update({
      where: { id: integration.id },
      data: {
        metadata: { ...metadata, lastHealthCheckAt: new Date().toISOString() },
        updatedAt: new Date(),
      },
    });

    integrationLogger.info("Integration healthy");
    return true;
  } catch (err: any) {
    integrationLogger.error(
      { error: err.message },
      "Integration health check failed - marking as ERROR"
    );

    // Mark integration as ERROR
    const metadata = (integration.metadata as Record<string, unknown>) ?? {};
    await db.integration.update({
      where: { id: integration.id },
      data: {
        status: "ERROR",
        metadata: {
          ...metadata,
          lastHealthCheckAt: new Date().toISOString(),
          errorReason: "health_check_failed",
          lastError: err.message,
        },
        updatedAt: new Date(),
      },
    });

    // Publish error event
    await eventsQueue.add("integration-error", {
      tenantId: integration.tenantId,
      eventType: "integration.error",
      data: {
        integrationId: integration.id,
        provider: integration.provider,
        reason: "health_check_failed",
        message: `Health check failed: ${err.message}`,
      },
      timestamp: new Date().toISOString(),
    });

    return false;
  }
}

/**
 * Verify a Linear token by calling the viewer query.
 * Throws if the token is invalid/revoked.
 */
async function verifyLinearToken(accessToken: string): Promise<void> {
  const client = new LinearClient({ accessToken });
  // The viewer query is lightweight and confirms token validity
  await client.viewer;
}

/**
 * Verify a Notion token by calling the search API.
 * Throws if the token is invalid/revoked.
 */
async function verifyNotionToken(accessToken: string): Promise<void> {
  const client = new NotionClient({ auth: accessToken });
  // Search with page_size=1 is the lightest-weight check
  await client.search({ page_size: 1 });
}

/** Exported for testing */
export {
  verifyLinearToken,
  verifyNotionToken,
  NOTION_CHECK_INTERVAL_MS,
  runHealthCheckSweep,
};
