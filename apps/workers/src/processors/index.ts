import type { Job, Processor } from "bullmq";
import { QUEUE_NAMES, type QueueName } from "@loomii/queue";
import { logger } from "../lib/logger";
import { processNotionPolling } from "./notion-polling";
import { processContextAssembly } from "./context-assembly";
import { processRiskClassification } from "./risk-classification";

/**
 * Processor registry - maps queue names to their job processor functions.
 * Replace placeholder processors with actual implementations in later tasks.
 */

const createPlaceholderProcessor = (queueName: string): Processor => {
  return async (job: Job) => {
    const start = Date.now();
    const childLogger = logger.child({
      queue: queueName,
      jobId: job.id,
      jobName: job.name,
      tenantId: job.data?.tenantId ?? "unknown",
    });

    childLogger.info({ data: job.data }, `Processing job: ${job.name}`);

    // Placeholder: actual processing logic will be added in later tasks
    await new Promise((resolve) => setTimeout(resolve, 10));

    const durationMs = Date.now() - start;
    childLogger.info({ durationMs, success: true }, `Job completed: ${job.name}`);
  };
};

export const processors: Record<QueueName, Processor> = {
  [QUEUE_NAMES.CONTEXT_ASSEMBLY]: processContextAssembly as Processor,
  [QUEUE_NAMES.RISK_CLASSIFICATION]: processRiskClassification as Processor,
  [QUEUE_NAMES.EMBEDDING_GENERATION]: createPlaceholderProcessor(
    QUEUE_NAMES.EMBEDDING_GENERATION
  ),
  [QUEUE_NAMES.NOTION_POLLING]: processNotionPolling as Processor,
  [QUEUE_NAMES.INTEGRATION_HEALTH]: createPlaceholderProcessor(
    QUEUE_NAMES.INTEGRATION_HEALTH
  ),
  [QUEUE_NAMES.REVIEW_GENERATION]: createPlaceholderProcessor(
    QUEUE_NAMES.REVIEW_GENERATION
  ),
  [QUEUE_NAMES.THREAT_MODEL_UPDATE]: createPlaceholderProcessor(
    QUEUE_NAMES.THREAT_MODEL_UPDATE
  ),
  [QUEUE_NAMES.EVENTS]: createPlaceholderProcessor(QUEUE_NAMES.EVENTS),
};

/**
 * Concurrency configuration per queue.
 * Higher concurrency for lightweight jobs, lower for compute-heavy ones.
 */
export const concurrency: Record<QueueName, number> = {
  [QUEUE_NAMES.CONTEXT_ASSEMBLY]: 10,
  [QUEUE_NAMES.RISK_CLASSIFICATION]: 5,
  [QUEUE_NAMES.EMBEDDING_GENERATION]: 10,
  [QUEUE_NAMES.NOTION_POLLING]: 10,
  [QUEUE_NAMES.INTEGRATION_HEALTH]: 10,
  [QUEUE_NAMES.REVIEW_GENERATION]: 3,
  [QUEUE_NAMES.THREAT_MODEL_UPDATE]: 10,
  [QUEUE_NAMES.EVENTS]: 10,
};
