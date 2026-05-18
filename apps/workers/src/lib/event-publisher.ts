/**
 * Event Publishing Module (Risk-Based Routing)
 *
 * Routes classified bundles to the correct downstream consumers based on risk level.
 * Also handles integration lifecycle events and assembly failure notifications.
 *
 * Routing rules:
 * - CRITICAL → review-generation queue (priority 1) + events queue (critical-alert)
 * - HIGH     → review-generation queue (priority 2)
 * - MEDIUM   → review-generation queue (priority 3)
 * - LOW      → events queue (classified-low) only (no review triggered)
 *
 * Priority in BullMQ: lower number = higher priority (1 = most urgent).
 *
 * This is a utility module called by other processors (risk-classification,
 * context-assembly, integration-health, etc.) - not a queue processor itself.
 */
import { reviewQueue, eventsQueue } from "@loomii/queue";

/**
 * Risk levels as defined by the classification system.
 */
export type RiskLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

/**
 * Priority mapping for BullMQ (lower = higher priority).
 */
const RISK_PRIORITY: Record<RiskLevel, number> = {
  CRITICAL: 1,
  HIGH: 2,
  MEDIUM: 3,
  LOW: 4, // Not used for review queue, but defined for completeness
};

// =========================================
// Risk Event Publishing
// =========================================

export interface RiskEventPayload {
  /** The context bundle ID */
  bundleId: string;
  /** The risk classification level */
  riskLevel: RiskLevel;
  /** The tenant this event belongs to */
  tenantId: string;
  /** The classification reasoning */
  reasoning?: string;
  /** The source entity that triggered this */
  sourceId?: string;
  /** The source type (linear_ticket, notion_page, etc.) */
  sourceType?: string;
}

export interface PublishResult {
  /** Jobs that were successfully enqueued */
  published: string[];
  /** Jobs that failed to enqueue (with error) */
  failed: Array<{ queue: string; error: string }>;
}

/**
 * Publish events based on risk classification level.
 *
 * Routes the classified bundle to the correct downstream queues:
 * - CRITICAL: review-generation (priority 1) + critical-alert event
 * - HIGH: review-generation (priority 2)
 * - MEDIUM: review-generation (priority 3)
 * - LOW: classified-low event only (no review)
 *
 * @param payload - The risk event data
 * @returns Result indicating which jobs were published
 */
export async function publishRiskEvents(
  payload: RiskEventPayload
): Promise<PublishResult> {
  const { bundleId, riskLevel, tenantId, reasoning, sourceId, sourceType } = payload;
  const timestamp = new Date().toISOString();

  const published: string[] = [];
  const failed: Array<{ queue: string; error: string }> = [];

  if (riskLevel === "CRITICAL") {
    // CRITICAL: review-generation + critical-alert
    const results = await Promise.allSettled([
      reviewQueue.add(
        "review",
        {
          tenantId,
          contextId: bundleId,
          reviewType: "design-review" as const,
        },
        { priority: RISK_PRIORITY.CRITICAL }
      ),
      eventsQueue.add("critical-alert", {
        tenantId,
        eventType: "risk.critical",
        data: {
          bundleId,
          riskLevel,
          reasoning: reasoning ?? null,
          sourceId: sourceId ?? null,
          sourceType: sourceType ?? null,
        },
        timestamp,
      }),
    ]);

    if (results[0].status === "fulfilled") published.push("review-generation");
    else failed.push({ queue: "review-generation", error: (results[0] as PromiseRejectedResult).reason?.message });

    if (results[1].status === "fulfilled") published.push("events:critical-alert");
    else failed.push({ queue: "events:critical-alert", error: (results[1] as PromiseRejectedResult).reason?.message });
  } else if (riskLevel === "HIGH" || riskLevel === "MEDIUM") {
    // HIGH/MEDIUM: review-generation only (with appropriate priority)
    try {
      await reviewQueue.add(
        "review",
        {
          tenantId,
          contextId: bundleId,
          reviewType: "design-review" as const,
        },
        { priority: RISK_PRIORITY[riskLevel] }
      );
      published.push("review-generation");
    } catch (err: any) {
      failed.push({ queue: "review-generation", error: err.message });
    }
  } else {
    // LOW: dashboard event only (no review triggered)
    try {
      await eventsQueue.add("classified-low", {
        tenantId,
        eventType: "risk.low",
        data: {
          bundleId,
          riskLevel,
          reasoning: reasoning ?? null,
          sourceId: sourceId ?? null,
          sourceType: sourceType ?? null,
        },
        timestamp,
      });
      published.push("events:classified-low");
    } catch (err: any) {
      failed.push({ queue: "events:classified-low", error: err.message });
    }
  }

  return { published, failed };
}

// =========================================
// Integration Lifecycle Events
// =========================================

export type IntegrationEventType =
  | "integration.connected"
  | "integration.disconnected"
  | "integration.error"
  | "integration.reconnected";

export interface IntegrationEventData {
  tenantId: string;
  integrationId: string;
  provider: "LINEAR" | "NOTION";
  reason?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Publish an integration lifecycle event.
 *
 * Used when integrations are connected, disconnected, error, or reconnected.
 * These events power the dashboard's integration status indicators.
 */
export async function publishIntegrationEvent(
  type: IntegrationEventType,
  data: IntegrationEventData
): Promise<void> {
  await eventsQueue.add(type, {
    tenantId: data.tenantId,
    eventType: type,
    data: {
      integrationId: data.integrationId,
      provider: data.provider,
      reason: data.reason ?? null,
      ...(data.metadata ?? {}),
    },
    timestamp: new Date().toISOString(),
  });
}

// =========================================
// Assembly Failure Events
// =========================================

export interface AssemblyFailedData {
  eventId: string;
  tenantId: string;
  error: string;
  sourceType?: string;
  sourceId?: string;
}

/**
 * Publish an assembly failure event.
 *
 * Used when context assembly fails (timeout, API error, etc.).
 * These events are surfaced in the dashboard for visibility.
 */
export async function publishAssemblyFailed(
  data: AssemblyFailedData
): Promise<void> {
  await eventsQueue.add("assembly-failed", {
    tenantId: data.tenantId,
    eventType: "assembly.failed",
    data: {
      eventId: data.eventId,
      error: data.error,
      sourceType: data.sourceType ?? null,
      sourceId: data.sourceId ?? null,
    },
    timestamp: new Date().toISOString(),
  });
}

/** Exported for testing */
export { RISK_PRIORITY };
