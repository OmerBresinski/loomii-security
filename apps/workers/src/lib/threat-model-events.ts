/**
 * Threat Model Event Publishing
 *
 * Publishes lifecycle events for threat model changes to the events queue.
 * The Dashboard consumes these events for notifications and status updates.
 *
 * Events:
 * - "threat-model.generated" - after initial generation completes
 * - "threat-model.updated" - after incremental update applies
 */
import { eventsQueue } from "@loomii/queue";
import { logger } from "./logger";

// ─── Event Types ──────────────────────────────────────────────────────────────

export interface ThreatModelGeneratedEvent {
  tenantId: string;
  modelId: string;
  version: number;
  summary: {
    components: number;
    dataFlows: number;
    trustBoundaries: number;
    entryPoints: number;
    assets: number;
    threats: number;
    gaps: number;
  };
}

export interface ThreatModelUpdatedEvent {
  tenantId: string;
  modelId: string;
  version: number;
  changeType: string;
  summary: {
    added: number;
    modified: number;
    deprecated: number;
    threatsAdded: number;
    threatsModified: number;
    gapsCreated: number;
    gapsResolved: number;
  };
}

// ─── Publishing Functions ─────────────────────────────────────────────────────

/**
 * Publish "threat-model.generated" event after initial generation.
 */
export async function publishThreatModelGenerated(
  event: ThreatModelGeneratedEvent
): Promise<void> {
  const childLogger = logger.child({
    module: "threat-model-events",
    tenantId: event.tenantId,
    modelId: event.modelId,
  });

  await eventsQueue.add("threat-model.generated", {
    tenantId: event.tenantId,
    eventType: "threat-model.generated",
    data: {
      modelId: event.modelId,
      version: event.version,
      summary: event.summary,
    },
    timestamp: new Date().toISOString(),
  });

  childLogger.info(
    { version: event.version, threats: event.summary.threats },
    "Published threat-model.generated event"
  );
}

/**
 * Publish "threat-model.updated" event after incremental update.
 */
export async function publishThreatModelUpdated(
  event: ThreatModelUpdatedEvent
): Promise<void> {
  const childLogger = logger.child({
    module: "threat-model-events",
    tenantId: event.tenantId,
    modelId: event.modelId,
  });

  await eventsQueue.add("threat-model.updated", {
    tenantId: event.tenantId,
    eventType: "threat-model.updated",
    data: {
      modelId: event.modelId,
      version: event.version,
      changeType: event.changeType,
      summary: event.summary,
    },
    timestamp: new Date().toISOString(),
  });

  childLogger.info(
    { version: event.version, changeType: event.changeType },
    "Published threat-model.updated event"
  );
}
