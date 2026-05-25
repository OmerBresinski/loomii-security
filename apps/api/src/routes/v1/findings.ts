import { Hono } from "hono";
import { db } from "@loomii/db";
import { z } from "zod";
import type { AppEnv } from "../../lib/types";

export const findingRoutes = new Hono<AppEnv>();

// Valid dismissal reasons (matches Prisma DismissalReason enum)
const dismissalReasonSchema = z.enum([
  "FALSE_POSITIVE",
  "NOT_APPLICABLE",
  "DUPLICATE",
  "ALREADY_MITIGATED",
]);

// ─── PATCH /:id/dismiss — Dismiss a finding as false positive ────────────────

findingRoutes.patch("/:id/dismiss", async (c) => {
  const tenantId = c.get("tenantId");
  const userId = c.get("userId");
  const requestId = c.get("requestId");
  const findingId = c.req.param("id");

  // Validate body
  const body = await c.req.json().catch(() => null);
  if (!body || !body.reason) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: "Request body must include 'reason'", requestId } },
      400
    );
  }

  const parsed = dismissalReasonSchema.safeParse(body.reason);
  if (!parsed.success) {
    return c.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: `Invalid dismissal reason: ${body.reason}. Valid: ${dismissalReasonSchema.options.join(", ")}`,
          requestId,
        },
      },
      400
    );
  }

  // Tenant-scoped: verify finding belongs to a review in the user's tenant
  const finding = await db.finding.findFirst({
    where: {
      id: findingId,
      review: { tenantId },
    },
    select: { id: true, status: true },
  });

  if (!finding) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Finding not found", requestId } },
      404
    );
  }

  // Cannot dismiss a confirmed finding (review already published)
  if (finding.status === "CONFIRMED") {
    return c.json(
      { error: { code: "INVALID_STATE", message: "Cannot dismiss a confirmed finding", requestId } },
      400
    );
  }

  // Update finding to DISMISSED
  const updated = await db.finding.update({
    where: { id: findingId },
    data: {
      status: "DISMISSED",
      dismissalReason: parsed.data,
      dismissedBy: userId,
      dismissedAt: new Date(),
    },
    select: {
      id: true,
      status: true,
      dismissalReason: true,
      dismissedAt: true,
    },
  });

  return c.json({
    id: updated.id,
    status: updated.status,
    dismissalReason: updated.dismissalReason,
    dismissedAt: updated.dismissedAt?.toISOString() ?? null,
  });
});

// ─── PATCH /:id/restore — Restore a dismissed finding ────────────────────────

findingRoutes.patch("/:id/restore", async (c) => {
  const tenantId = c.get("tenantId");
  const requestId = c.get("requestId");
  const findingId = c.req.param("id");

  // Tenant-scoped: verify finding belongs to a review in the user's tenant
  const finding = await db.finding.findFirst({
    where: {
      id: findingId,
      review: { tenantId },
    },
    select: { id: true, status: true },
  });

  if (!finding) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Finding not found", requestId } },
      404
    );
  }

  // Cannot restore a confirmed finding (review already published)
  if (finding.status === "CONFIRMED") {
    return c.json(
      { error: { code: "INVALID_STATE", message: "Cannot restore a confirmed finding", requestId } },
      400
    );
  }

  // Restore: set status to null, clear dismissal metadata
  const updated = await db.finding.update({
    where: { id: findingId },
    data: {
      status: null,
      dismissalReason: null,
      dismissedBy: null,
      dismissedAt: null,
    },
    select: { id: true, status: true },
  });

  return c.json({
    id: updated.id,
    status: updated.status,
  });
});
