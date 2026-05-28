import { Queue } from "bullmq";
import { createRedisConnection } from "./connection";
import type { QueuePayloadMap } from "./types";

/**
 * All named queues in the Loomii system.
 * Each queue name maps to a specific job processing domain.
 */
export const QUEUE_NAMES = {
  CONTEXT_ASSEMBLY: "context-assembly",
  RISK_CLASSIFICATION: "risk-classification",
  EMBEDDING_GENERATION: "embedding-generation",
  NOTION_POLLING: "notion-polling",
  INTEGRATION_HEALTH: "integration-health",
  REVIEW_GENERATION: "review-generation",
  THREAT_MODEL_UPDATE: "threat-model-update",
  SUMMARY_GENERATION: "summary-generation",
  PROJECT_MATCHING: "project-matching",
  INITIAL_BACKFILL: "initial-backfill",
  INCREMENTAL_REVIEW: "incremental-review",
  EVENTS: "events",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const ALL_QUEUE_NAMES: QueueName[] = Object.values(QUEUE_NAMES);

/**
 * Lazy-initialized shared Redis connection for all queues.
 * Only created when the first queue is accessed.
 */
let _connection: ReturnType<typeof createRedisConnection> | null = null;

function getConnection() {
  if (!_connection) {
    _connection = createRedisConnection();
  }
  return _connection;
}

/**
 * Typed Queue instances for enqueueing jobs from the API.
 * All queues share a single Redis connection.
 */
export const contextAssemblyQueue = new Queue<QueuePayloadMap["context-assembly"]>(
  QUEUE_NAMES.CONTEXT_ASSEMBLY,
  { connection: getConnection() }
);

export const riskClassificationQueue = new Queue<QueuePayloadMap["risk-classification"]>(
  QUEUE_NAMES.RISK_CLASSIFICATION,
  { connection: getConnection() }
);

export const embeddingQueue = new Queue<QueuePayloadMap["embedding-generation"]>(
  QUEUE_NAMES.EMBEDDING_GENERATION,
  { connection: getConnection() }
);

export const notionPollingQueue = new Queue<QueuePayloadMap["notion-polling"]>(
  QUEUE_NAMES.NOTION_POLLING,
  { connection: getConnection() }
);

export const integrationHealthQueue = new Queue<QueuePayloadMap["integration-health"]>(
  QUEUE_NAMES.INTEGRATION_HEALTH,
  { connection: getConnection() }
);

export const reviewQueue = new Queue<QueuePayloadMap["review-generation"]>(
  QUEUE_NAMES.REVIEW_GENERATION,
  { connection: getConnection() }
);

export const threatModelQueue = new Queue<QueuePayloadMap["threat-model-update"]>(
  QUEUE_NAMES.THREAT_MODEL_UPDATE,
  { connection: getConnection() }
);

export const eventsQueue = new Queue<QueuePayloadMap["events"]>(
  QUEUE_NAMES.EVENTS,
  {
    connection: getConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 1000,
      },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  }
);

export const summaryGenerationQueue = new Queue<QueuePayloadMap["summary-generation"]>(
  QUEUE_NAMES.SUMMARY_GENERATION,
  { connection: getConnection() }
);

export const projectMatchingQueue = new Queue<QueuePayloadMap["project-matching"]>(
  QUEUE_NAMES.PROJECT_MATCHING,
  { connection: getConnection() }
);

export const incrementalReviewQueue = new Queue<QueuePayloadMap["incremental-review"]>(
  QUEUE_NAMES.INCREMENTAL_REVIEW,
  { connection: getConnection() }
);

/**
 * Initial backfill queue for post-onboarding historical data ingestion.
 * Worker should enforce a 5-minute lockDuration for timeout behavior.
 */
export const initialBackfillQueue = new Queue<QueuePayloadMap["initial-backfill"]>(
  QUEUE_NAMES.INITIAL_BACKFILL,
  {
    connection: getConnection(),
    defaultJobOptions: {
      attempts: 1, // No retry - Phase 1 is idempotent
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  }
);
