/**
 * Typed job payloads for all Loomii queues.
 * These types are shared between the API (producer) and Workers (consumer).
 */

export interface ContextAssemblyPayload {
  eventId: string;
  tenantId: string;
  sourceType: "linear" | "notion";
  sourceId: string;
  /** Resolved project ID from project-matching worker (null if no match) */
  projectId?: string | null;
  /** Optional sibling source summaries for cross-document awareness (backfill) */
  siblingContext?: string;
}

export interface RiskClassificationPayload {
  tenantId: string;
  contextId: string;
  designDocId: string;
  /** Set to true when enqueued from initial backfill (enables progress tracking) */
  isBackfill?: boolean;
  /** Source type for backfill items (used for downstream routing) */
  sourceType?: "linear" | "notion";
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

export interface SummaryGenerationPayload {
  projectId: string;
  trigger?: string;
}

export interface ProjectMatchingPayload {
  eventId: string;
  tenantId: string;
  sourceType: "linear" | "notion";
  sourceId: string;
  /** Raw text content from the event for embedding similarity */
  content: string;
}

export interface EventsPayload {
  tenantId: string;
  eventType: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface IncrementalReviewPayload {
  tenantId: string;
  contextBundleId: string;
  reviewId: string;
  previousContent: Record<string, unknown>;
  newContent: Record<string, unknown>;
}

export interface InitialBackfillPayload {
  tenantId: string;
  linearIntegrationId: string | null;
  notionIntegrationId: string | null;
  /** Number of days to look back for historical data (default 90) */
  lookbackDays: number;
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
  "summary-generation": SummaryGenerationPayload;
  "project-matching": ProjectMatchingPayload;
  "initial-backfill": InitialBackfillPayload;
  "incremental-review": IncrementalReviewPayload;
  events: EventsPayload;
}
