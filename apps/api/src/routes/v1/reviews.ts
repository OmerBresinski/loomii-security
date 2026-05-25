import { Hono } from "hono";
import { db } from "@loomii/db";
import { summaryGenerationQueue, threatModelQueue, eventsQueue } from "@loomii/queue";
import type { AppEnv } from "../../lib/types";
import { generateReviewComment } from "../../lib/comment-generator";
import { getCommentTargets, postCommentToSources } from "../../lib/comment-poster";

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
        select: {
          status: true,
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
    reviewStatus: bundle.review?.status ?? "GENERATING",
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
    reviewStatus: bundle.review?.status ?? "GENERATING",
    createdAt: bundle.createdAt.toISOString(),
    findings: bundle.review?.findings ?? [],
  });
});

// ─── POST /:id/publish — Generate comment preview ──────────────────────────

reviewRoutes.post("/:id/publish", async (c) => {
  const tenantId = c.get("tenantId");
  const requestId = c.get("requestId");
  const reviewId = c.req.param("id");

  // Find review (tenant-scoped)
  const review = await db.review.findFirst({
    where: { id: reviewId, tenantId },
    select: {
      id: true,
      status: true,
      contextBundleId: true,
      findings: {
        where: { status: { not: "DISMISSED" } },
        select: { title: true, severity: true },
        orderBy: { severity: "asc" },
      },
    },
  });

  if (!review) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Review not found", requestId } },
      404
    );
  }

  // Only READY reviews can be published
  if (review.status !== "READY") {
    return c.json(
      { error: { code: "INVALID_STATE", message: "Review must be in READY state to publish", requestId } },
      400
    );
  }

  // Get non-dismissed findings for comment
  const confirmedFindings = review.findings;
  if (confirmedFindings.length === 0) {
    return c.json(
      { error: { code: "INVALID_STATE", message: "No findings to publish (all dismissed)", requestId } },
      400
    );
  }

  // Generate comment text via LLM
  const commentText = await generateReviewComment(
    confirmedFindings.map((f) => ({ title: f.title, severity: f.severity })),
    review.id
  );

  // Get target sources
  const targets = await getCommentTargets(tenantId, review.contextBundleId);

  // Store generated comment on the review for the confirm step
  await db.review.update({
    where: { id: reviewId },
    data: { commentText },
  });

  return c.json({
    commentText,
    targets: targets.map((t) => ({
      sourceType: t.sourceType.toLowerCase(),
      sourceId: t.sourceId,
      sourceTitle: t.sourceTitle,
    })),
    findingsCount: confirmedFindings.length,
  });
});

// ─── POST /:id/confirm-publish — Post comment & finalize ───────────────────

reviewRoutes.post("/:id/confirm-publish", async (c) => {
  const tenantId = c.get("tenantId");
  const userId = c.get("userId");
  const requestId = c.get("requestId");
  const reviewId = c.req.param("id");

  // Find review with stored comment text
  const review = await db.review.findFirst({
    where: { id: reviewId, tenantId },
    select: {
      id: true,
      status: true,
      commentText: true,
      contextBundleId: true,
      contextBundle: { select: { projectId: true } },
    },
  });

  if (!review) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Review not found", requestId } },
      404
    );
  }

  // Must be in READY state with a generated comment (from /publish step)
  if (review.status !== "READY" || !review.commentText) {
    return c.json(
      { error: { code: "INVALID_STATE", message: "Must call /publish first to generate preview", requestId } },
      400
    );
  }

  // 1. Bulk confirm all non-dismissed findings
  const confirmResult = await db.finding.updateMany({
    where: { review: { id: reviewId }, status: null },
    data: { status: "CONFIRMED", confirmedAt: new Date() },
  });

  // 2. Post comment to external sources (graceful degradation)
  const targets = await getCommentTargets(tenantId, review.contextBundleId);
  const postResults = await postCommentToSources(tenantId, targets, review.commentText);
  const commentPostedTo = postResults.filter((r) => r.success).map((r) => r.sourceId);

  // 3. Mark review as PUBLISHED
  await db.review.update({
    where: { id: reviewId },
    data: {
      status: "PUBLISHED",
      publishedAt: new Date(),
      publishedBy: userId,
      commentPostedTo,
    },
  });

  // 4. Trigger downstream effects
  const projectId = review.contextBundle?.projectId;
  if (projectId) {
    await summaryGenerationQueue.add(
      "regenerate",
      { projectId, trigger: "review_published" },
      { removeOnComplete: true }
    );

    await threatModelQueue.add(
      "update",
      { tenantId, designDocId: review.contextBundleId, changeType: "updated" },
      { removeOnComplete: true }
    );
  }

  // 5. Emit review.published event
  await eventsQueue.add(
    "review.published",
    {
      tenantId,
      eventType: "review.published",
      data: { reviewId, publishedVia: "manual", projectId: projectId ?? null },
      timestamp: new Date().toISOString(),
    },
    { removeOnComplete: true }
  );

  return c.json({
    status: "PUBLISHED" as const,
    publishedAt: new Date().toISOString(),
    commentPostedTo,
    findingsConfirmed: confirmResult.count,
  });
});
