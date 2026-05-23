/**
 * Notification Delivery Utilities
 *
 * Provides preference-aware notification delivery. Before creating a notification
 * for a user, the system checks their NotificationPreference record. If the
 * preference is explicitly disabled, the notification is skipped silently.
 *
 * If no preference record exists (user hasn't visited settings yet), the
 * notification is treated as enabled (default behavior).
 */
import { db } from "@loomii/db";
import { logger } from "./logger";

// ─── Notification Types ───────────────────────────────────────────────────────

/** All supported notification types */
export const NOTIFICATION_TYPES = [
  "review_completed",
  "high_risk_detected",
  "source_linked",
  "source_archived",
  "summary_updated",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

// ─── Event-to-Notification Type Mapping ───────────────────────────────────────

/**
 * Maps event types (from the events queue) to notification types.
 * Events not in this map do not produce user notifications.
 */
const EVENT_TO_NOTIFICATION_TYPE: Record<string, NotificationType> = {
  // Review lifecycle
  "review.published": "review_completed",
  "review.completed": "review_completed",

  // Risk detection
  "risk.critical": "high_risk_detected",

  // Source management
  "source.linked": "source_linked",
  "source.archived": "source_archived",

  // Summary updates
  "summary.updated": "summary_updated",
};

/**
 * Resolve the notification type for a given event type.
 * Returns null if the event does not map to a user notification.
 */
export function getNotificationType(
  eventType: string
): NotificationType | null {
  return EVENT_TO_NOTIFICATION_TYPE[eventType] ?? null;
}

// ─── Preference Check ─────────────────────────────────────────────────────────

/**
 * Check whether a notification should be delivered to a specific user.
 *
 * Logic:
 * - If a preference record exists and `enabled === false`, skip delivery.
 * - If no preference record exists (user hasn't configured settings), deliver (default enabled).
 * - If a preference record exists and `enabled === true`, deliver.
 *
 * Uses the unique index on (userId, type) for O(1) lookup.
 */
export async function shouldDeliverNotification(
  userId: string,
  type: string
): Promise<boolean> {
  const preference = await db.notificationPreference.findUnique({
    where: { userId_type: { userId, type } },
    select: { enabled: true },
  });

  // No record = default enabled; explicit false = skip
  return preference?.enabled !== false;
}

/**
 * Filter a list of user IDs to only those who should receive a notification
 * of the given type. Useful for batch delivery to all tenant members.
 *
 * Optimized: single query fetches all disabled preferences for the given
 * users + type, then excludes them from the recipient list.
 */
export async function filterNotificationRecipients(
  userIds: string[],
  type: string
): Promise<string[]> {
  if (userIds.length === 0) return [];

  // Find users who have explicitly disabled this notification type
  const disabledPreferences = await db.notificationPreference.findMany({
    where: {
      userId: { in: userIds },
      type,
      enabled: false,
    },
    select: { userId: true },
  });

  const disabledUserIds = new Set(disabledPreferences.map((p) => p.userId));

  // Return users who haven't explicitly disabled (includes those with no record)
  return userIds.filter((id) => !disabledUserIds.has(id));
}

// ─── Delivery Orchestration ───────────────────────────────────────────────────

export interface NotificationDeliveryResult {
  /** Event type from the queue */
  eventType: string;
  /** Resolved notification type (null if event doesn't map to a notification) */
  notificationType: NotificationType | null;
  /** Total users in the tenant */
  totalUsers: number;
  /** Users who passed the preference check */
  eligibleUsers: number;
  /** Whether any delivery was attempted */
  delivered: boolean;
}

/**
 * Orchestrates preference-aware notification delivery for an event.
 *
 * 1. Maps the event type to a notification type
 * 2. Fetches all users in the tenant
 * 3. Filters by preferences
 * 4. Delivers notifications to eligible users
 *
 * Currently logs delivery intent. Actual notification record creation
 * will be added when the Notification model is implemented.
 */
export async function deliverNotification(
  tenantId: string,
  eventType: string,
  data: Record<string, unknown>
): Promise<NotificationDeliveryResult> {
  const childLogger = logger.child({
    module: "notification-delivery",
    tenantId,
    eventType,
  });

  // 1. Map event to notification type
  const notificationType = getNotificationType(eventType);

  if (!notificationType) {
    childLogger.debug("Event does not map to a notification type, skipping");
    return {
      eventType,
      notificationType: null,
      totalUsers: 0,
      eligibleUsers: 0,
      delivered: false,
    };
  }

  // 2. Get all users in the tenant
  const users = await db.user.findMany({
    where: { tenantId },
    select: { id: true },
  });

  const userIds = users.map((u) => u.id);

  // 3. Filter by preferences (single batch query)
  const eligibleUserIds = await filterNotificationRecipients(
    userIds,
    notificationType
  );

  childLogger.info(
    {
      notificationType,
      totalUsers: userIds.length,
      eligibleUsers: eligibleUserIds.length,
      filteredOut: userIds.length - eligibleUserIds.length,
    },
    "Notification delivery: preference check complete"
  );

  // 4. Deliver to eligible users
  // TODO: Create notification records when Notification model is implemented.
  // For now, this is the integration point — eligible users are determined
  // and downstream delivery (in-app, email, push) would happen here.
  if (eligibleUserIds.length > 0) {
    childLogger.info(
      {
        notificationType,
        recipientCount: eligibleUserIds.length,
        data,
      },
      "Would deliver notification to eligible users"
    );
  }

  return {
    eventType,
    notificationType,
    totalUsers: userIds.length,
    eligibleUsers: eligibleUserIds.length,
    delivered: eligibleUserIds.length > 0,
  };
}
