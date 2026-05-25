/**
 * AI Usage routes.
 *
 * GET /api/v1/usage         - Aggregated usage stats (totals + daily breakdown)
 * GET /api/v1/usage/daily   - Daily cost breakdown for charts
 */
import { Hono } from "hono";
import type { AppEnv } from "../../lib/types";
import { db } from "@loomii/db";

export const usageRoutes = new Hono<AppEnv>();

/**
 * GET /api/v1/usage
 *
 * Returns aggregated usage stats for the current tenant:
 * - Total cost (all time + last 30 days)
 * - Breakdown by model
 * - Breakdown by operation
 * - Daily cost for last 30 days (for chart)
 */
usageRoutes.get("/", async (c) => {
  const tenantId = c.get("tenantId");

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // All-time totals
  const allTimeAgg = await db.aiUsage.aggregate({
    where: { tenantId },
    _sum: { costCents: true, promptTokens: true, completionTokens: true, totalTokens: true },
    _count: true,
  });

  // Last 30 days totals
  const last30Agg = await db.aiUsage.aggregate({
    where: { tenantId, createdAt: { gte: thirtyDaysAgo } },
    _sum: { costCents: true, promptTokens: true, completionTokens: true, totalTokens: true },
    _count: true,
  });

  // Breakdown by model (last 30 days)
  const byModel = await db.aiUsage.groupBy({
    by: ["model"],
    where: { tenantId, createdAt: { gte: thirtyDaysAgo } },
    _sum: { costCents: true, totalTokens: true },
    _count: true,
    orderBy: { _sum: { costCents: "desc" } },
  });

  // Breakdown by operation (last 30 days)
  const byOperation = await db.aiUsage.groupBy({
    by: ["operation"],
    where: { tenantId, createdAt: { gte: thirtyDaysAgo } },
    _sum: { costCents: true, totalTokens: true },
    _count: true,
    orderBy: { _sum: { costCents: "desc" } },
  });

  return c.json({
    allTime: {
      costCents: allTimeAgg._sum.costCents ?? 0,
      promptTokens: allTimeAgg._sum.promptTokens ?? 0,
      completionTokens: allTimeAgg._sum.completionTokens ?? 0,
      totalTokens: allTimeAgg._sum.totalTokens ?? 0,
      requests: allTimeAgg._count,
    },
    last30Days: {
      costCents: last30Agg._sum.costCents ?? 0,
      promptTokens: last30Agg._sum.promptTokens ?? 0,
      completionTokens: last30Agg._sum.completionTokens ?? 0,
      totalTokens: last30Agg._sum.totalTokens ?? 0,
      requests: last30Agg._count,
    },
    byModel: byModel.map((m) => ({
      model: m.model,
      costCents: m._sum.costCents ?? 0,
      totalTokens: m._sum.totalTokens ?? 0,
      requests: m._count,
    })),
    byOperation: byOperation.map((o) => ({
      operation: o.operation,
      costCents: o._sum.costCents ?? 0,
      totalTokens: o._sum.totalTokens ?? 0,
      requests: o._count,
    })),
  });
});

/**
 * GET /api/v1/usage/daily
 *
 * Returns daily cost totals for the last 30 days (for line/bar chart).
 */
usageRoutes.get("/daily", async (c) => {
  const tenantId = c.get("tenantId");

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Raw records grouped by day using Prisma's raw query
  const dailyRecords = await db.$queryRaw<
    Array<{ day: Date; cost_cents: number; total_tokens: bigint; requests: bigint }>
  >`
    SELECT
      DATE_TRUNC('day', created_at) AS day,
      SUM(cost_cents) AS cost_cents,
      SUM(total_tokens) AS total_tokens,
      COUNT(*) AS requests
    FROM ai_usage
    WHERE tenant_id = ${tenantId}
      AND created_at >= ${thirtyDaysAgo}
    GROUP BY DATE_TRUNC('day', created_at)
    ORDER BY day ASC
  `;

  const daily = dailyRecords.map((r) => ({
    date: r.day.toISOString().split("T")[0],
    costCents: Number(r.cost_cents) || 0,
    totalTokens: Number(r.total_tokens) || 0,
    requests: Number(r.requests) || 0,
  }));

  return c.json({ daily });
});
