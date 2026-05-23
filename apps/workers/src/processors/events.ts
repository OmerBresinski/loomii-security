/**
 * Events Queue Processor
 *
 * Processes events from the events queue (published by review-events,
 * event-publisher, and threat-model-events). Responsible for:
 *
 * 1. Mapping event types to notification types
 * 2. Checking user notification preferences
 * 3. Delivering notifications to eligible users
 *
 * Events that don't map to a notification type are logged and skipped.
 */
import type { Job } from "bullmq";
import type { EventsPayload } from "@loomii/queue";
import { logger } from "../lib/logger";
import { deliverNotification } from "../lib/notifications";

/**
 * Main processor for the events queue.
 * Each job represents a system event that may trigger user notifications.
 */
export async function processEvents(job: Job<EventsPayload>): Promise<void> {
  const { tenantId, eventType, data, timestamp } = job.data;

  const childLogger = logger.child({
    queue: "events",
    jobId: job.id,
    jobName: job.name,
    tenantId,
    eventType,
  });

  childLogger.info({ timestamp }, `Processing event: ${eventType}`);

  const start = Date.now();

  try {
    const result = await deliverNotification(tenantId, eventType, data);

    const durationMs = Date.now() - start;
    childLogger.info(
      {
        durationMs,
        notificationType: result.notificationType,
        totalUsers: result.totalUsers,
        eligibleUsers: result.eligibleUsers,
        delivered: result.delivered,
      },
      `Event processed: ${eventType}`
    );
  } catch (error) {
    const durationMs = Date.now() - start;
    childLogger.error(
      {
        durationMs,
        error: error instanceof Error ? error.message : String(error),
      },
      `Event processing failed: ${eventType}`
    );
    throw error; // Re-throw for BullMQ retry logic
  }
}
