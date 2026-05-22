import { Hono } from "hono";
import { db } from "@loomii/db";
import type { AppEnv } from "../../lib/types";

export const findingRoutes = new Hono<AppEnv>();

// Valid finding statuses (matches Prisma FindingStatus enum)
const VALID_FINDING_STATUSES = ["OPEN", "ACCEPTED", "REJECTED", "RESOLVED", "DEFERRED"] as const;
type FindingStatus = (typeof VALID_FINDING_STATUSES)[number];

// ─── PATCH /:id — Update finding status ─────────────────────────────────────

findingRoutes.patch("/:id", async (c) => {
  const tenantId = c.get("tenantId");
  const requestId = c.get("requestId");
  const findingId = c.req.param("id");

  const body = await c.req.json().catch(() => null);
  if (!body || !body.status) {
    return c.json(
      { error: { code: "INVALID_BODY", message: "Request body must include 'status'", requestId } },
      400
    );
  }

  const newStatus = body.status as string;
  if (!VALID_FINDING_STATUSES.includes(newStatus as FindingStatus)) {
    return c.json(
      { error: { code: "INVALID_STATUS", message: `Invalid status: ${newStatus}. Valid: ${VALID_FINDING_STATUSES.join(", ")}`, requestId } },
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

  // Update finding status
  const updated = await db.finding.update({
    where: { id: findingId },
    data: {
      status: newStatus as any,
      ...(newStatus === "RESOLVED"
        ? { resolvedBy: c.get("userId"), resolvedAt: new Date() }
        : {}),
    },
    select: { id: true, status: true },
  });

  return c.json({
    id: updated.id,
    status: updated.status,
  });
});
