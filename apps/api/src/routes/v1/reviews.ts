import { Hono } from "hono";
import { db } from "@loomii/db";
import { summaryGenerationQueue } from "@loomii/queue";
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
 *   - projectId: filter by project ID, or "unassigned" for null-project reviews
 *   - search: keyword match on title/summary (case-insensitive)
 *   - limit: number 1-100 (default 20)
 *   - cursor: opaque pagination cursor (ISO timestamp of last item)
 */
reviewRoutes.get("/", async (c) => {
  const tenantId = c.get("tenantId");
  const statusParam = c.req.query("status");
  const riskParam = c.req.query("riskLevel");
  const projectIdParam = c.req.query("projectId");
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

  // Project filter
  if (projectIdParam === "unassigned") {
    where.projectId = null;
  } else if (projectIdParam) {
    where.projectId = projectIdParam;
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
      project: {
        select: {
          id: true,
          name: true,
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
    project: bundle.project ? { id: bundle.project.id, name: bundle.project.name } : null,
    createdAt: bundle.createdAt.toISOString(),
    updatedAt: bundle.updatedAt.toISOString(),
  }));

  return c.json({
    data,
    nextCursor,
    hasMore,
  });
});

// ─── GET /:id — Fetch single review with findings ──────────────────────────

reviewRoutes.get("/:id", async (c) => {
  const tenantId = c.get("tenantId");
  const requestId = c.get("requestId");
  const id = c.req.param("id");

  const bundle = await db.contextBundle.findUnique({
    where: { id },
    include: {
      event: {
        select: { source: true, externalId: true },
      },
      review: {
        include: {
          findings: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              type: true,
              title: true,
              description: true,
              severity: true,
              strideCategory: true,
              effortEstimate: true,
              status: true,
            },
          },
        },
      },
    },
  });

  if (!bundle || bundle.tenantId !== tenantId) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Review not found", requestId } },
      404
    );
  }

  return c.json({
    id: bundle.id,
    status: bundle.status,
    riskLevel: bundle.riskLevel,
    title: bundle.title,
    summary: bundle.summary,
    confidence: bundle.review?.confidence ?? null,
    source: bundle.event.source,
    externalId: bundle.event.externalId,
    reviewId: bundle.review?.id ?? null,
    reviewStatus: bundle.review?.status ?? null,
    createdAt: bundle.createdAt.toISOString(),
    findings: bundle.review?.findings ?? [],
  });
});

// ─── PATCH /:id — Update review status (approve/reject) ────────────────────

const VALID_REVIEW_STATUSES = [
  "PENDING", "GENERATING", "DRAFT", "IN_REVIEW", "APPROVED", "REJECTED", "PUBLISHED", "ERROR"
] as const;
type ReviewStatus = (typeof VALID_REVIEW_STATUSES)[number];

reviewRoutes.patch("/:id", async (c) => {
  const tenantId = c.get("tenantId");
  const requestId = c.get("requestId");
  const reviewId = c.req.param("id");

  const body = await c.req.json().catch(() => null);
  if (!body || !body.status) {
    return c.json(
      { error: { code: "INVALID_BODY", message: "Request body must include 'status'", requestId } },
      400
    );
  }

  const newStatus = body.status as string;
  if (!VALID_REVIEW_STATUSES.includes(newStatus as ReviewStatus)) {
    return c.json(
      { error: { code: "INVALID_STATUS", message: `Invalid status: ${newStatus}`, requestId } },
      400
    );
  }

  // Find review (tenant-scoped via the review's tenant relation)
  const review = await db.review.findFirst({
    where: { id: reviewId, tenantId },
    select: {
      id: true,
      status: true,
      contextBundleId: true,
    },
  });

  if (!review) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Review not found", requestId } },
      404
    );
  }

  // Update status
  const updated = await db.review.update({
    where: { id: reviewId },
    data: { status: newStatus as any },
    select: {
      id: true,
      status: true,
      contextBundle: {
        select: { projectId: true },
      },
    },
  });

  // Trigger immediate summary regeneration on approval
  if (newStatus === "APPROVED" || newStatus === "PUBLISHED") {
    const projectId = updated.contextBundle?.projectId;
    if (projectId) {
      // No jobId and no delay — immediate, non-debounced regeneration
      await summaryGenerationQueue.add(
        "regenerate",
        { projectId, trigger: "review_approved" },
        { removeOnComplete: true }
      );
    }
  }

  return c.json({
    id: updated.id,
    status: updated.status,
  });
});
