import type { Job, Processor } from "bullmq";
import { QUEUE_NAMES, type QueueName } from "@loomii/queue";
import { logger } from "../lib/logger";
import { processNotionPolling } from "./notion-polling";
import { processContextAssembly } from "./context-assembly";
import { processRiskClassification } from "./risk-classification";
import { processEmbeddingGeneration } from "./embedding-generation";
import { processIntegrationHealth } from "./integration-health";
import { processThreatModelGeneration } from "./threat-model-generation";
import { processThreatModelUpdate } from "./threat-model-update";
import { processReviewGeneration } from "./review-generation";
import { processSummaryGeneration } from "./summary-generation";
import { processProjectMatching } from "./project-matching";
import { processEvents } from "./events";
import { processInitialBackfill } from "./initial-backfill";
import { processIncrementalReview } from "./incremental-review";

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
  [QUEUE_NAMES.EMBEDDING_GENERATION]: processEmbeddingGeneration as Processor,
  [QUEUE_NAMES.NOTION_POLLING]: processNotionPolling as Processor,
  [QUEUE_NAMES.INTEGRATION_HEALTH]: processIntegrationHealth as Processor,
  [QUEUE_NAMES.REVIEW_GENERATION]: processReviewGeneration as Processor,
  [QUEUE_NAMES.THREAT_MODEL_UPDATE]: ((job: Job) => {
    // Dispatch between initial generation and incremental update
    const changeType = job.data?.changeType;
    if (changeType === "initial_generation") {
      return processThreatModelGeneration(job);
    }
    return processThreatModelUpdate(job);
  }) as Processor,
  [QUEUE_NAMES.SUMMARY_GENERATION]: processSummaryGeneration as Processor,
  [QUEUE_NAMES.PROJECT_MATCHING]: processProjectMatching as Processor,
  [QUEUE_NAMES.INITIAL_BACKFILL]: processInitialBackfill as Processor,
  [QUEUE_NAMES.INCREMENTAL_REVIEW]: processIncrementalReview as Processor,
  [QUEUE_NAMES.EVENTS]: processEvents as Processor,
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
  [QUEUE_NAMES.REVIEW_GENERATION]: 2,
  [QUEUE_NAMES.THREAT_MODEL_UPDATE]: 2,
  [QUEUE_NAMES.SUMMARY_GENERATION]: 2,
  [QUEUE_NAMES.PROJECT_MATCHING]: 5,
  [QUEUE_NAMES.INITIAL_BACKFILL]: 5,
  [QUEUE_NAMES.INCREMENTAL_REVIEW]: 2,
  [QUEUE_NAMES.EVENTS]: 10,
};
