import { Worker, type WorkerOptions } from "bullmq";
import { createRedisConnection, ALL_QUEUE_NAMES, QUEUE_NAMES, type QueueName, integrationHealthQueue } from "@loomii/queue";
import { logger } from "./lib/logger";
import { processors, concurrency } from "./processors/index";

const workers: Worker[] = [];
let isShuttingDown = false;

/**
 * Per-queue worker options overrides.
 * Only queues that need non-default settings are listed here.
 */
const workerOptions: Partial<Record<QueueName, Partial<WorkerOptions>>> = {
  [QUEUE_NAMES.EVENTS]: { lockDuration: 30000 },
  [QUEUE_NAMES.INITIAL_BACKFILL]: { lockDuration: 300000 }, // 5 minutes
};

async function startWorkers(): Promise<void> {
  const connection = createRedisConnection();

  for (const queueName of ALL_QUEUE_NAMES) {
    const worker = new Worker(queueName, processors[queueName], {
      connection,
      concurrency: concurrency[queueName],
      ...workerOptions[queueName],
    });

    // Error handling per worker
    worker.on("failed", (job, err) => {
      logger.error(
        {
          queue: queueName,
          jobId: job?.id,
          jobName: job?.name,
          tenantId: job?.data?.tenantId ?? "unknown",
          error: err.message,
          stack: err.stack,
        },
        `Job failed: ${job?.name ?? "unknown"}`
      );
    });

    worker.on("error", (err) => {
      logger.error(
        { queue: queueName, error: err.message },
        `Worker error on queue: ${queueName}`
      );
    });

    workers.push(worker);
  }

  logger.info(
    { queues: ALL_QUEUE_NAMES },
    `Workers started: ${ALL_QUEUE_NAMES.join(", ")}`
  );

  // Register repeatable jobs for token refresh and health checks
  await registerRepeatableJobs();
}

/**
 * Register repeatable jobs that run on a schedule.
 * BullMQ deduplicates these by jobId - safe to call on every startup.
 */
async function registerRepeatableJobs(): Promise<void> {
  // Token refresh: every 15 minutes - finds and refreshes expiring Linear tokens
  await integrationHealthQueue.add(
    "refresh",
    {} as any,
    {
      repeat: { every: 15 * 60 * 1000 }, // 15 min
      jobId: "repeatable:token-refresh",
    }
  );

  // Health check: every 30 minutes - verifies all active integrations
  await integrationHealthQueue.add(
    "check",
    {} as any,
    {
      repeat: { every: 30 * 60 * 1000 }, // 30 min
      jobId: "repeatable:health-check",
    }
  );

  logger.info("Repeatable jobs registered: token-refresh (15m), health-check (30m)");
}

async function shutdown(): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info("Shutting down workers...");

  const shutdownTimeout = setTimeout(() => {
    logger.error("Graceful shutdown timed out after 10s, forcing exit");
    process.exit(1);
  }, 10_000);

  try {
    await Promise.all(workers.map((w) => w.close()));
    logger.info("Workers stopped gracefully");
  } catch (err) {
    logger.error({ err }, "Error during worker shutdown");
  } finally {
    clearTimeout(shutdownTimeout);
    process.exit(0);
  }
}

// Graceful shutdown handlers
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Start
startWorkers().catch((err) => {
  logger.fatal({ err }, "Failed to start workers");
  process.exit(1);
});
