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
