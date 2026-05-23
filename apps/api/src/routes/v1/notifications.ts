/**
 * Notifications API
 *
 * GET    /api/v1/notifications              — Paginated notification list
 * GET    /api/v1/notifications/unread-count  — Unread count with type breakdown
 * POST   /api/v1/notifications/read-all     — Mark all unread as read
 * PATCH  /api/v1/notifications/:id/read     — Mark single notification as read
 * GET    /api/v1/notifications/preferences  — Returns all preferences for current user
 * PATCH  /api/v1/notifications/preferences  — Toggles a single preference type
 *
 * Preferences are seeded on first access (all enabled by default).
 * Labels and descriptions are static metadata merged at read time.
 */
import { Hono } from "hono";
import { z } from "zod";
import { db } from "@loomii/db";
import type { AppEnv } from "../../lib/types";

export const notificationRoutes = new Hono<AppEnv>();

/** Static notification type metadata (not stored in DB) */
const DEFAULT_NOTIFICATION_TYPES = [
  {
    type: "review_completed",
    label: "Review completed",
    description: "When a security review finishes processing",
  },
  {
    type: "high_risk_detected",
    label: "High risk detected",
    description: "When a critical or high severity issue is found",
  },
  {
    type: "source_linked",
    label: "Source linked",
    description: "When a new source is linked to a project",
  },
  {
    type: "source_archived",
    label: "Source archived",
    description: "When a source is archived from a project",
  },
  {
    type: "summary_updated",
    label: "Summary updated",
    description: "When a project summary is regenerated",
  },
] as const;

const VALID_TYPES = DEFAULT_NOTIFICATION_TYPES.map((t) => t.type);

/** Metadata lookup by type */
const TYPE_METADATA = Object.fromEntries(
  DEFAULT_NOTIFICATION_TYPES.map((t) => [
    t.type,
    { label: t.label, description: t.description },
  ])
);

/** PATCH request body schema */
const patchSchema = z.object({
  type: z.enum(VALID_TYPES as [string, ...string[]]),
  enabled: z.boolean(),
});

// ===========================================
// Notification List + Actions
// ===========================================

/**
 * GET /
 *
 * Cursor-paginated list of notifications for the current user.
 * Supports optional filters: unread, type, projectId.
 */
notificationRoutes.get("/", async (c) => {
  const userId = c.get("userId");

  const unread = c.req.query("unread") === "true";
  const type = c.req.query("type");
  const projectId = c.req.query("projectId");
  const limit = Math.min(parseInt(c.req.query("limit") ?? "20", 10) || 20, 50);
  const cursor = c.req.query("cursor");

  const where: any = { userId };
  if (unread) where.readAt = null;
  if (type) where.type = type;
  if (projectId) where.projectId = projectId;

  const notifications = await db.notification.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      type: true,
      title: true,
      body: true,
      linkUrl: true,
      readAt: true,
      createdAt: true,
    },
  });

  const hasMore = notifications.length > limit;
  const items = hasMore ? notifications.slice(0, limit) : notifications;
  const nextCursor = hasMore ? items[items.length - 1]?.id ?? null : null;

  return c.json({
    notifications: items.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      linkUrl: n.linkUrl,
      read: n.readAt !== null,
      createdAt: n.createdAt.toISOString(),
    })),
    nextCursor,
  });
});

/**
 * GET /unread-count
 *
 * Returns total unread count and breakdown by notification type.
 * Used by the frontend badge for polling.
 */
notificationRoutes.get("/unread-count", async (c) => {
  const userId = c.get("userId");

  const groups = await db.notification.groupBy({
    by: ["type"],
    where: { userId, readAt: null },
    _count: true,
  });

  const byType: Record<string, number> = {
    review_completed: 0,
    high_risk_detected: 0,
    source_linked: 0,
    source_archived: 0,
    summary_updated: 0,
  };
  let count = 0;
  for (const g of groups) {
    byType[g.type] = g._count;
    count += g._count;
  }

  return c.json({ count, byType });
});

/**
 * POST /read-all
 *
 * Mark all unread notifications as read for the current user.
 * Idempotent — safe to call multiple times.
 */
notificationRoutes.post("/read-all", async (c) => {
  const userId = c.get("userId");

  await db.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });

  return c.json({ success: true });
});

/**
 * PATCH /:id/read
 *
 * Mark a single notification as read. Sets readAt to current timestamp.
 * Returns 404 if the notification doesn't belong to the current user.
 * Idempotent — calling twice is safe.
 */
notificationRoutes.patch("/:id/read", async (c) => {
  const userId = c.get("userId");
  const requestId = c.get("requestId");
  const notificationId = c.req.param("id");

  const notification = await db.notification.findFirst({
    where: { id: notificationId, userId },
    select: { id: true },
  });

  if (!notification) {
    return c.json(
      {
        error: {
          code: "NOT_FOUND",
          message: "Notification not found",
          requestId,
        },
      },
      404
    );
  }

  await db.notification.update({
    where: { id: notificationId },
    data: { readAt: new Date() },
  });

  return c.json({ id: notificationId, read: true });
});

// ===========================================
// Notification Preferences
// ===========================================

/**
 * GET /preferences
 *
 * Returns the user's notification preferences. If the user has no
 * preferences yet, seeds all 5 types with enabled: true.
 */
notificationRoutes.get("/preferences", async (c) => {
  const userId = c.get("userId");
  const tenantId = c.get("tenantId");

  let preferences = await db.notificationPreference.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });

  // Seed on first access
  if (preferences.length === 0) {
    await db.notificationPreference.createMany({
      data: DEFAULT_NOTIFICATION_TYPES.map((t) => ({
        userId,
        tenantId,
        type: t.type,
        enabled: true,
      })),
    });

    preferences = await db.notificationPreference.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });
  }

  // Merge static metadata into response
  const response = preferences.map((pref) => ({
    type: pref.type,
    label: TYPE_METADATA[pref.type]?.label ?? pref.type,
    description: TYPE_METADATA[pref.type]?.description ?? "",
    enabled: pref.enabled,
  }));

  return c.json({ preferences: response });
});

/**
 * PATCH /preferences
 *
 * Toggles a single notification preference.
 * Body: { type: string, enabled: boolean }
 */
notificationRoutes.patch("/preferences", async (c) => {
  const userId = c.get("userId");
  const tenantId = c.get("tenantId");
  const requestId = c.get("requestId");

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      {
        error: {
          code: "INVALID_BODY",
          message: "Request body must be valid JSON",
          requestId,
        },
      },
      400
    );
  }

  const result = patchSchema.safeParse(body);
  if (!result.success) {
    return c.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: result.error.issues[0]?.message ?? "Invalid request body",
          requestId,
        },
      },
      400
    );
  }

  const { type, enabled } = result.data;

  // Upsert: if the user has never accessed preferences, create the row
  const preference = await db.notificationPreference.upsert({
    where: { userId_type: { userId, type } },
    update: { enabled },
    create: { userId, tenantId, type, enabled },
  });

  return c.json({ type: preference.type, enabled: preference.enabled });
});
