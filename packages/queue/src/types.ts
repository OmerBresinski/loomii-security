/**
 * Typed job payloads for all Loomii queues.
 * These types are shared between the API (producer) and Workers (consumer).
 */

export interface ContextAssemblyPayload {
  eventId: string;
  tenantId: string;
  sourceType: "linear" | "notion";
  sourceId: string;
}

export interface RiskClassificationPayload {
  tenantId: string;
  contextId: string;
  designDocId: string;
}

export interface EmbeddingGenerationPayload {
  tenantId: string;
  documentId: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface NotionPollingPayload {
  tenantId: string;
  integrationId: string;
  lastSyncCursor?: string;
}

export interface IntegrationHealthPayload {
  tenantId: string;
  integrationId: string;
  provider: "linear" | "notion";
}

export interface ReviewGenerationPayload {
  tenantId: string;
  contextId: string;
  reviewType: "design-review" | "threat-model";
}

export interface ThreatModelUpdatePayload {
  tenantId: string;
  /** Document ID that triggered the update (optional for initial generation) */
  designDocId?: string;
  changeType: "created" | "updated" | "deleted" | "initial_generation";
  /** Number of context bundles at time of trigger (for initial generation) */
  bundleCount?: number;
}

export interface EventsPayload {
  tenantId: string;
  eventType: string;
  data: Record<string, unknown>;
  timestamp: string;
}

/**
 * Map of queue names to their job payload types.
 */
export interface QueuePayloadMap {
  "context-assembly": ContextAssemblyPayload;
  "risk-classification": RiskClassificationPayload;
  "embedding-generation": EmbeddingGenerationPayload;
  "notion-polling": NotionPollingPayload;
  "integration-health": IntegrationHealthPayload;
  "review-generation": ReviewGenerationPayload;
  "threat-model-update": ThreatModelUpdatePayload;
  events: EventsPayload;
}
