import { Worker } from "bullmq";
import { createRedisConnection, ALL_QUEUE_NAMES, type QueueName } from "@loomii/queue";
import { logger } from "./lib/logger";
import { processors, concurrency } from "./processors/index";

const workers: Worker[] = [];
let isShuttingDown = false;

async function startWorkers(): Promise<void> {
  const connection = createRedisConnection();

  for (const queueName of ALL_QUEUE_NAMES) {
    const worker = new Worker(queueName, processors[queueName], {
      connection,
      concurrency: concurrency[queueName],
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
