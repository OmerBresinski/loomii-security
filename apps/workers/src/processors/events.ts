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
 * 5. Apply per-project cooldown (suppress duplicates within time window)
 * 6. Build notification content from templates
 * 7. Build deduplication key
 * 8. Batch insert notifications with skipDuplicates
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
 * Cooldown period per notification type + project + user.
 * If a user already received this notification type for this project
 * within this window, the new notification is suppressed.
 */
const NOTIFICATION_COOLDOWN_MS: Record<string, number> = {
  high_risk_detected: 5 * 60 * 1000, // 5 minutes
  summary_updated: 5 * 60 * 1000, // 5 minutes
};

/** Default cooldown (0 = no cooldown) for types not explicitly listed */
const DEFAULT_COOLDOWN_MS = 0;

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

    // 5. Apply per-project cooldown to suppress notification floods
    const cooldownMs =
      NOTIFICATION_COOLDOWN_MS[notificationType] ?? DEFAULT_COOLDOWN_MS;
    let finalRecipients = eligibleRecipients;

    if (cooldownMs > 0 && projectId) {
      const cooldownThreshold = new Date(Date.now() - cooldownMs);
      const recentNotifications = await db.notification.findMany({
        where: {
          userId: { in: eligibleRecipients },
          type: notificationType,
          projectId,
          createdAt: { gte: cooldownThreshold },
        },
        select: { userId: true },
      });
      const recentlyNotifiedUsers = new Set(
        recentNotifications.map((n) => n.userId)
      );
      finalRecipients = eligibleRecipients.filter(
        (id) => !recentlyNotifiedUsers.has(id)
      );

      if (finalRecipients.length < eligibleRecipients.length) {
        childLogger.info(
          {
            suppressed: eligibleRecipients.length - finalRecipients.length,
            cooldownMs,
            projectId,
          },
          "Suppressed notifications due to cooldown"
        );
      }
    }

    if (finalRecipients.length === 0) {
      childLogger.info(
        { notificationType, projectId },
        "All recipients suppressed by cooldown"
      );
      return;
    }

    // 6. Build notification content from template
    const content = buildNotificationContent(notificationType, enrichedData);

    // 7. Build deduplication key
    const baseSourceEventId = buildSourceEventId(
      eventType,
      enrichedData,
      timestamp
    );

    // 8. Batch insert (skipDuplicates handles retries)
    await db.notification.createMany({
      data: finalRecipients.map((userId) => ({
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
        deliveredTo: finalRecipients.length,
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
