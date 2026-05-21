import { Hono } from "hono";
import { db, BundleStatus, RiskLevel } from "@loomii/db";
import type { AppEnv } from "../../lib/types";

export const reviewRoutes = new Hono<AppEnv>();

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

  // Parse comma-separated filter values against Prisma enums
  const statusFilter = statusParam
    ? statusParam.split(",").filter((s): s is BundleStatus =>
        Object.values(BundleStatus).includes(s as BundleStatus)
      )
    : undefined;

  const riskFilter = riskParam
    ? riskParam.split(",").filter((r): r is RiskLevel =>
        Object.values(RiskLevel).includes(r as RiskLevel)
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
    createdAt: bundle.createdAt.toISOString(),
    updatedAt: bundle.updatedAt.toISOString(),
  }));

  return c.json({
    data,
    nextCursor,
    hasMore,
  });
});
