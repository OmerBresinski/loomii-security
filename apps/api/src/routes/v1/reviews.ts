import { Hono } from "hono";
import { db } from "@loomii/db";
import type { AppEnv } from "../../lib/types";

export const reviewRoutes = new Hono<AppEnv>();

// Valid enum values (matches Prisma schema)
const VALID_STATUSES = ["ASSEMBLING", "READY", "REVIEWING", "COMPLETED", "FAILED"] as const;
const VALID_RISK_LEVELS = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"] as const;

type BundleStatus = (typeof VALID_STATUSES)[number];
type RiskLevel = (typeof VALID_RISK_LEVELS)[number];

// ─── Route Handler ──────────────────────────────────────────────────────────

/**
 * GET /api/v1/reviews
 *
 * Query params:
 *   - status: comma-separated BundleStatus values
 *   - riskLevel: comma-separated RiskLevel values
 *   - search: keyword match on title/summary (case-insensitive)
 *   - limit: number 1-100 (default 20)
 *   - cursor: opaque pagination cursor (ISO timestamp of last item)
 */
reviewRoutes.get("/", async (c) => {
  const tenantId = c.get("tenantId");
  const statusParam = c.req.query("status");
  const riskParam = c.req.query("riskLevel");
  const search = c.req.query("search");
  const limitParam = c.req.query("limit");
  const cursor = c.req.query("cursor");

  const limit = Math.min(Math.max(parseInt(limitParam || "20", 10) || 20, 1), 100);

  // Parse comma-separated filter values
  const statusFilter = statusParam
    ? statusParam.split(",").filter((s): s is BundleStatus =>
        (VALID_STATUSES as readonly string[]).includes(s)
      )
    : undefined;

  const riskFilter = riskParam
    ? riskParam.split(",").filter((r): r is RiskLevel =>
        (VALID_RISK_LEVELS as readonly string[]).includes(r)
      )
    : undefined;

  // Build Prisma where clause
  const where: any = {
    tenantId,
  };

  if (statusFilter && statusFilter.length > 0) {
    where.status = { in: statusFilter };
  }

  if (riskFilter && riskFilter.length > 0) {
    where.riskLevel = { in: riskFilter };
  }

  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { summary: { contains: search, mode: "insensitive" } },
    ];
  }

  if (cursor) {
    where.createdAt = { lt: new Date(cursor) };
  }

  // Query context bundles (the API-facing "review" maps to ContextBundle)
  const bundles = await db.contextBundle.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit + 1, // Fetch one extra to determine hasMore
    include: {
      event: {
        select: {
          source: true,
          externalId: true,
        },
      },
      review: {
        include: {
          _count: {
            select: { findings: true },
          },
        },
      },
    },
  });

  const hasMore = bundles.length > limit;
  const page = hasMore ? bundles.slice(0, limit) : bundles;
  const nextCursor = hasMore ? page[page.length - 1].createdAt.toISOString() : null;

  const data = page.map((bundle) => ({
    id: bundle.id,
    eventId: bundle.eventId,
    status: bundle.status,
    riskLevel: bundle.riskLevel,
    title: bundle.title,
    summary: bundle.summary,
    findingCount: bundle.review?._count?.findings ?? 0,
    source: bundle.event.source,
    externalId: bundle.event.externalId,
    createdAt: bundle.createdAt.toISOString(),
    updatedAt: bundle.updatedAt.toISOString(),
  }));

  return c.json({
    data,
    nextCursor,
    hasMore,
  });
});
