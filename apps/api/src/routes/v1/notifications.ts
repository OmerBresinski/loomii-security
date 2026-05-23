/**
 * Notification Preferences API
 *
 * GET  /api/v1/notifications/preferences — Returns all preferences for current user
 * PATCH /api/v1/notifications/preferences — Toggles a single preference type
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
