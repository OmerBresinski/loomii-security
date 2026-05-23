/**
 * Events Queue Processor
 *
 * Processes events from the events queue (published by review-events,
 * event-publisher, and threat-model-events). Implements the full notification
 * delivery pipeline:
 *
 * 1. Map event type → notification type
 * 2. Resolve project context (fallback for missing fields)
 * 3. Resolve recipients (role-based + project-scoped)
 * 4. Filter by user notification preferences
 * 5. Build notification content from templates
 * 6. Build deduplication key
 * 7. Batch insert notifications with skipDuplicates
 *
 * Events that don't map to a notification type are skipped silently.
 */
import type { Job } from "bullmq";
import type { EventsPayload } from "@loomii/queue";
import { db } from "@loomii/db";
import { logger } from "../lib/logger";
import {
  getNotificationType,
  filterNotificationRecipients,
} from "../lib/notifications";
import { resolveRecipients } from "../lib/recipient-resolution";
import {
  buildNotificationContent,
  buildSourceEventId,
  resolveProjectContext,
} from "../lib/notification-templates";

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
    // 1. Map event to notification type (skip if unmapped)
    const notificationType = getNotificationType(eventType);
    if (!notificationType) {
      childLogger.debug("Event does not map to a notification type, skipping");
      return;
    }

    // 2. Resolve project context (fallback for missing fields)
    const projectContext = await resolveProjectContext(data);
    const enrichedData = { ...data, ...projectContext };
    const projectId = (enrichedData.projectId as string) ?? null;

    // 3. Resolve recipients (role-based + project-scoped)
    const allRecipients = await resolveRecipients(
      tenantId,
      notificationType,
      projectId
    );

    // 4. Filter by preferences (batch query)
    const eligibleRecipients = await filterNotificationRecipients(
      allRecipients,
      notificationType
    );

    if (eligibleRecipients.length === 0) {
      childLogger.info(
        { notificationType, totalRecipients: allRecipients.length },
        "No eligible recipients after preference filtering"
      );
      return;
    }

    // 5. Build notification content from template
    const content = buildNotificationContent(notificationType, enrichedData);

    // 6. Build deduplication key
    const baseSourceEventId = buildSourceEventId(
      eventType,
      enrichedData,
      timestamp
    );

    // 7. Batch insert (skipDuplicates handles retries)
    await db.notification.createMany({
      data: eligibleRecipients.map((userId) => ({
        userId,
        tenantId,
        type: notificationType,
        title: content.title,
        body: content.body,
        linkUrl: content.linkUrl,
        projectId,
        sourceEventId: baseSourceEventId
          ? `${baseSourceEventId}:${userId}`
          : null,
      })),
      skipDuplicates: true,
    });

    const durationMs = Date.now() - start;
    childLogger.info(
      {
        durationMs,
        notificationType,
        totalRecipients: allRecipients.length,
        eligibleRecipients: eligibleRecipients.length,
        projectId,
      },
      `Notifications delivered: ${eventType}`
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
