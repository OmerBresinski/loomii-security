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
  { connection: getConnection() }
);
