/**
 * Projects CRUD API
 *
 * POST   /api/v1/projects       — Create a project (with optional sources)
 * GET    /api/v1/projects       — List all projects for tenant
 * GET    /api/v1/projects/:id   — Get project detail with aggregates
 * PATCH  /api/v1/projects/:id   — Update project name
 * DELETE /api/v1/projects/:id   — Soft-delete project
 */
import { Hono } from "hono";
import { db } from "@loomii/db";
import { summaryGenerationQueue, eventsQueue } from "@loomii/queue";
import type { AppEnv } from "../../lib/types";
import {
  CreateProjectRequestSchema,
  UpdateProjectRequestSchema,
  LinkSourcesRequestSchema,
  ArchiveSourceRequestSchema,
  RelinkSourceRequestSchema,
} from "@loomii/shared/schemas";

export const projectRoutes = new Hono<AppEnv>();

// ===========================================
// Helpers
// ===========================================

interface ProjectWithIncludes {
  sources: Array<{ id: string }>;
  contextBundles: Array<{
    id: string;
    updatedAt: Date;
    review: { id: string; severity: string | null } | null;
  }>;
}

function computeAggregates(project: ProjectWithIncludes) {
  const sourceCount = project.sources.length;
  const reviews = project.contextBundles.filter((cb) => cb.review).map((cb) => cb.review!);
  const reviewCount = reviews.length;

  const riskOrder = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
  const highestRisk = reviews.reduce<string | null>((highest, r) => {
    if (!r.severity) return highest;
    if (!highest) return r.severity;
    return riskOrder.indexOf(r.severity) < riskOrder.indexOf(highest) ? r.severity : highest;
  }, null);

  const highRiskCount = reviews.filter(
    (r) => r.severity === "CRITICAL" || r.severity === "HIGH"
  ).length;

  const lastActivity = project.contextBundles.length > 0
    ? project.contextBundles.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0].updatedAt.toISOString()
    : null;

  return { sourceCount, reviewCount, highRiskCount, highestRisk, lastActivity };
}

// ===========================================
// POST / — Create a new project
// ===========================================
projectRoutes.post("/", async (c) => {
  const tenantId = c.get("tenantId");
  const userId = c.get("userId");
  const requestId = c.get("requestId");

  const body = await c.req.json().catch(() => null);
  if (!body) {
    return c.json(
      { error: { code: "INVALID_BODY", message: "Request body must be valid JSON", requestId } },
      400
    );
  }

  const parsed = CreateProjectRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid request body", details: parsed.error.issues, requestId } },
      400
    );
  }

  const { name, icon, color, sources } = parsed.data;

  // Create project + sources in a transaction
  const project = await db.$transaction(async (tx) => {
    const newProject = await tx.project.create({
      data: {
        tenantId,
        name,
        icon: icon ?? "Shield01Icon",
        color: color ?? "#67E8F9",
        createdById: userId,
      },
    });

    // Link initial sources if provided
    if (sources && sources.length > 0) {
      await tx.projectSource.createMany({
        data: sources.map((s) => ({
          projectId: newProject.id,
          sourceType: s.sourceType as any,
          sourceId: s.sourceId,
          sourceUrl: s.sourceUrl ?? null,
          linkedBy: "MANUAL" as any,
          linkedByUserId: userId,
        })),
        skipDuplicates: true,
      });
    }

    return newProject;
  });

  // Trigger summary generation if sources were linked at creation time
  if (sources && sources.length > 0) {
    await triggerSummaryRegeneration(project.id);
  }

  return c.json(
    {
      id: project.id,
      name: project.name,
      icon: project.icon,
      color: project.color,
      createdAt: project.createdAt.toISOString(),
    },
    201
  );
});

// ===========================================
// GET / — List all projects for tenant
// ===========================================
projectRoutes.get("/", async (c) => {
  const tenantId = c.get("tenantId");

  const projects = await db.project.findMany({
    where: { tenantId },
    orderBy: { updatedAt: "desc" },
    include: {
      sources: {
        where: { isArchived: false, unlinkedAt: null },
        select: { id: true },
      },
      contextBundles: {
        select: {
          id: true,
          updatedAt: true,
          review: {
            select: { id: true, severity: true },
          },
        },
      },
    },
  });

  const results = projects.map((p) => {
    const { sourceCount, reviewCount, highRiskCount, highestRisk, lastActivity } = computeAggregates(p);

    return {
      id: p.id,
      name: p.name,
      icon: p.icon,
      color: p.color,
      sourceCount,
      reviewCount,
      highRiskCount,
      highestRisk,
      lastActivity,
      createdAt: p.createdAt.toISOString(),
    };
  });

  // Sort by severity (highest risk first), then alphabetically
  const riskOrder: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
  results.sort((a, b) => {
    const aRisk = a.highestRisk ? (riskOrder[a.highestRisk] ?? 5) : 5;
    const bRisk = b.highestRisk ? (riskOrder[b.highestRisk] ?? 5) : 5;
    if (aRisk !== bRisk) return aRisk - bRisk;
    return a.name.localeCompare(b.name);
  });

  return c.json({ projects: results });
});

// ===========================================
// GET /:id — Get project detail
// ===========================================
projectRoutes.get("/:id", async (c) => {
  const tenantId = c.get("tenantId");
  const requestId = c.get("requestId");
  const projectId = c.req.param("id");

  const project = await db.project.findFirst({
    where: { id: projectId, tenantId },
    include: {
      sources: {
        where: { isArchived: false, unlinkedAt: null },
        select: { id: true },
      },
      contextBundles: {
        select: {
          id: true,
          updatedAt: true,
          review: {
            select: { id: true, severity: true },
          },
        },
      },
      assignedTo: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  });

  if (!project) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Project not found", requestId } },
      404
    );
  }

  const { sourceCount, reviewCount, highRiskCount, highestRisk, lastActivity } = computeAggregates(project);

  // Aggregate findings by severity (exclude dismissed)
  const findingsAggregation = await db.finding.groupBy({
    by: ["severity"],
    where: {
      review: {
        contextBundle: {
          projectId: projectId,
        },
      },
      OR: [
        { status: null },
        { status: "CONFIRMED" },
      ],
    },
    _count: { id: true },
  });

  const findingsBySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const row of findingsAggregation) {
    const key = row.severity.toLowerCase() as keyof typeof findingsBySeverity;
    if (key in findingsBySeverity) {
      findingsBySeverity[key] = row._count.id;
    }
  }

  return c.json({
    id: project.id,
    name: project.name,
    icon: project.icon,
    color: project.color,
    summary: project.summary ?? null,
    summaryUpdatedAt: project.summaryUpdatedAt?.toISOString() ?? null,
    sourceCount,
    reviewCount,
    highRiskCount,
    highestRisk,
    lastActivity,
    assignedTo: project.assignedTo ? {
      id: project.assignedTo.id,
      firstName: project.assignedTo.firstName,
      lastName: project.assignedTo.lastName,
      email: project.assignedTo.email,
    } : null,
    findingsBySeverity,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  });
});

// ===========================================
// PATCH /:id — Update project
// ===========================================
projectRoutes.patch("/:id", async (c) => {
  const tenantId = c.get("tenantId");
  const userId = c.get("userId");
  const requestId = c.get("requestId");
  const projectId = c.req.param("id");

  const body = await c.req.json().catch(() => null);
  if (!body) {
    return c.json(
      { error: { code: "INVALID_BODY", message: "Request body must be valid JSON", requestId } },
      400
    );
  }

  const parsed = UpdateProjectRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid request body", details: parsed.error.issues, requestId } },
      400
    );
  }

  // Verify project belongs to tenant
  const existing = await db.project.findFirst({
    where: { id: projectId, tenantId },
    select: { id: true, name: true, assignedToId: true },
  });

  if (!existing) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Project not found", requestId } },
      404
    );
  }

  // If assignedToId is being set, validate user belongs to same tenant
  if (parsed.data.assignedToId !== undefined && parsed.data.assignedToId !== null) {
    const assignee = await db.user.findFirst({
      where: { id: parsed.data.assignedToId, tenantId },
      select: { id: true },
    });
    if (!assignee) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "Assigned user not found in tenant", requestId } },
        400
      );
    }
  }

  const updated = await db.project.update({
    where: { id: projectId },
    data: { ...parsed.data },
    include: {
      assignedTo: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
  });

  // Create notification if assigning a different user (not self-assigning or unassigning)
  const newAssigneeId = parsed.data.assignedToId;
  if (newAssigneeId && newAssigneeId !== userId && newAssigneeId !== existing.assignedToId) {
    await db.notification.create({
      data: {
        userId: newAssigneeId,
        tenantId,
        type: "project_assigned",
        title: "Assigned to project",
        body: `You were assigned to "${existing.name}"`,
        linkUrl: `/projects/${projectId}`,
        projectId,
        sourceEventId: `project_assigned:${projectId}:${newAssigneeId}`,
      },
    }).catch(() => {
      // Swallow duplicate notification errors (sourceEventId unique constraint)
    });
  }

  return c.json({
    id: updated.id,
    name: updated.name,
    icon: updated.icon,
    color: updated.color,
    assignedTo: updated.assignedTo ? {
      id: updated.assignedTo.id,
      firstName: updated.assignedTo.firstName,
      lastName: updated.assignedTo.lastName,
      email: updated.assignedTo.email,
    } : null,
    updatedAt: updated.updatedAt.toISOString(),
  });
});

// ===========================================
// DELETE /:id — Soft-delete project
// ===========================================
projectRoutes.delete("/:id", async (c) => {
  const tenantId = c.get("tenantId");
  const requestId = c.get("requestId");
  const projectId = c.req.param("id");

  // Verify project belongs to tenant
  const existing = await db.project.findFirst({
    where: { id: projectId, tenantId },
    select: { id: true },
  });

  if (!existing) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Project not found", requestId } },
      404
    );
  }

  // Soft-delete: unlink all sources and archive the project sources
  // Then delete the project record (cascade will handle ProjectSource cleanup)
  await db.$transaction(async (tx) => {
    // Archive all active sources
    await tx.projectSource.updateMany({
      where: { projectId, isArchived: false },
      data: {
        isArchived: true,
        archivedAt: new Date(),
        archivedReason: "project_deleted",
      },
    });

    // Nullify projectId on context bundles
    await tx.contextBundle.updateMany({
      where: { projectId },
      data: { projectId: null },
    });

    // Delete the project (hard delete - sources are archived, bundles are unlinked)
    await tx.project.delete({
      where: { id: projectId },
    });
  });

  return c.body(null, 204);
});

// ===========================================
// Source Linking Sub-Routes
// ===========================================

// ===========================================
// GET /:id/sources — List sources for a project
// ===========================================
projectRoutes.get("/:id/sources", async (c) => {
  const tenantId = c.get("tenantId");
  const requestId = c.get("requestId");
  const projectId = c.req.param("id");

  const project = await verifyProjectOwnership(projectId, tenantId);
  if (!project) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Project not found", requestId } },
      404
    );
  }

  const sources = await db.projectSource.findMany({
    where: { projectId },
    orderBy: { linkedAt: "desc" },
    select: {
      id: true,
      sourceType: true,
      sourceId: true,
      sourceUrl: true,
      linkedBy: true,
      linkReason: true,
      isArchived: true,
      archivedAt: true,
      archivedReason: true,
      linkedAt: true,
      unlinkedAt: true,
      linkedByUser: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  });

  // Resolve human-readable titles from Event payload
  const sourceIds = sources.map((s) => s.sourceId);
  const events = sourceIds.length > 0
    ? await db.event.findMany({
        where: { tenantId, externalId: { in: sourceIds } },
        orderBy: { createdAt: "desc" },
        distinct: ["externalId"],
        select: { externalId: true, payload: true },
      })
    : [];

  const titleMap = new Map<string, string>();
  const urlMap = new Map<string, string>();
  for (const event of events) {
    const payload = event.payload as Record<string, unknown> | null;
    const title =
      (payload?.title as string) ??
      (payload?.data as Record<string, unknown>)?.title as string | undefined;
    if (title && !titleMap.has(event.externalId)) {
      titleMap.set(event.externalId, title);
    }
    const url = payload?.url as string | undefined;
    if (url && !urlMap.has(event.externalId)) {
      urlMap.set(event.externalId, url);
    }
  }

  const enrichedSources = sources.map((source) => ({
    ...source,
    title: titleMap.get(source.sourceId) ?? null,
    sourceUrl: source.sourceUrl ?? urlMap.get(source.sourceId) ?? null,
  }));

  return c.json({ sources: enrichedSources });
});

/**
 * Helper: trigger debounced summary regeneration for a project.
 */
async function triggerSummaryRegeneration(projectId: string) {
  await summaryGenerationQueue.add(
    "regenerate",
    { projectId, trigger: "source-mutation" },
    { jobId: `summary-${projectId}`, delay: 60_000 }
  );
}

/**
 * Helper: verify project belongs to tenant, return project or null.
 */
async function verifyProjectOwnership(projectId: string, tenantId: string) {
  return db.project.findFirst({
    where: { id: projectId, tenantId },
    select: { id: true, name: true },
  });
}

// ===========================================
// POST /:id/sources — Link sources to a project
// ===========================================
projectRoutes.post("/:id/sources", async (c) => {
  const tenantId = c.get("tenantId");
  const userId = c.get("userId");
  const requestId = c.get("requestId");
  const projectId = c.req.param("id");

  const body = await c.req.json().catch(() => null);
  if (!body) {
    return c.json(
      { error: { code: "INVALID_BODY", message: "Request body must be valid JSON", requestId } },
      400
    );
  }

  const parsed = LinkSourcesRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid request body", details: parsed.error.issues, requestId } },
      400
    );
  }

  const project = await verifyProjectOwnership(projectId, tenantId);
  if (!project) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Project not found", requestId } },
      404
    );
  }

  const { sources } = parsed.data;
  const created: Array<{ id: string; sourceType: string; sourceId: string; sourceUrl: string | null }> = [];
  const existing: string[] = [];

  for (const source of sources) {
    try {
      const record = await db.projectSource.create({
        data: {
          projectId,
          sourceType: source.sourceType as any,
          sourceId: source.sourceId,
          sourceUrl: source.sourceUrl ?? null,
          linkedBy: "MANUAL" as any,
          linkedByUserId: userId,
        },
        select: { id: true, sourceType: true, sourceId: true, sourceUrl: true },
      });
      created.push(record);
    } catch (err: any) {
      if (err?.code === "P2002") {
        // Already linked - idempotent
        existing.push(source.sourceId);
      } else {
        throw err;
      }
    }
  }

  await triggerSummaryRegeneration(projectId);

  // Publish source.linked events for notifications (non-blocking)
  if (created.length > 0) {
    try {
      await Promise.all(
        created.map((source) =>
          eventsQueue.add("source.linked", {
            tenantId,
            eventType: "source.linked",
            data: {
              projectId,
              projectName: project.name,
              sourceType: source.sourceType,
              sourceId: source.sourceId,
              linkedByUserId: userId,
            },
            timestamp: new Date().toISOString(),
          })
        )
      );
    } catch {
      // Event publishing failure should not fail the user's request
    }
  }

  const status = created.length > 0 ? 201 : 200;
  return c.json({ linked: created, alreadyLinked: existing }, status);
});

// ===========================================
// DELETE /:id/sources/:sourceId — Unlink a source
// ===========================================
projectRoutes.delete("/:id/sources/:sourceId", async (c) => {
  const tenantId = c.get("tenantId");
  const requestId = c.get("requestId");
  const projectId = c.req.param("id");
  const sourceId = c.req.param("sourceId");

  const project = await verifyProjectOwnership(projectId, tenantId);
  if (!project) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Project not found", requestId } },
      404
    );
  }

  const source = await db.projectSource.findFirst({
    where: { projectId, sourceId, unlinkedAt: null },
    select: { id: true },
  });

  if (!source) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Active source link not found", requestId } },
      404
    );
  }

  await db.projectSource.update({
    where: { id: source.id },
    data: { unlinkedAt: new Date() },
  });

  await triggerSummaryRegeneration(projectId);

  return c.body(null, 204);
});

// ===========================================
// PATCH /:id/sources/:sourceId — Archive/unarchive a source
// ===========================================
projectRoutes.patch("/:id/sources/:sourceId", async (c) => {
  const tenantId = c.get("tenantId");
  const requestId = c.get("requestId");
  const projectId = c.req.param("id");
  const sourceId = c.req.param("sourceId");

  const body = await c.req.json().catch(() => null);
  if (!body) {
    return c.json(
      { error: { code: "INVALID_BODY", message: "Request body must be valid JSON", requestId } },
      400
    );
  }

  const parsed = ArchiveSourceRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid request body", details: parsed.error.issues, requestId } },
      400
    );
  }

  const project = await verifyProjectOwnership(projectId, tenantId);
  if (!project) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Project not found", requestId } },
      404
    );
  }

  // Cannot archive an already-unlinked source
  const source = await db.projectSource.findFirst({
    where: { projectId, sourceId, unlinkedAt: null },
    select: { id: true, isArchived: true, sourceType: true, sourceId: true },
  });

  if (!source) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Active source link not found", requestId } },
      404
    );
  }

  const { isArchived } = parsed.data;

  if (isArchived) {
    await db.projectSource.update({
      where: { id: source.id },
      data: {
        isArchived: true,
        archivedAt: new Date(),
        archivedReason: "manual",
      },
    });
  } else {
    await db.projectSource.update({
      where: { id: source.id },
      data: {
        isArchived: false,
        archivedAt: null,
        archivedReason: null,
      },
    });
  }

  await triggerSummaryRegeneration(projectId);

  // Publish source.archived event for notifications (non-blocking)
  if (isArchived) {
    try {
      await eventsQueue.add("source.archived", {
        tenantId,
        eventType: "source.archived",
        data: {
          projectId,
          projectName: project.name,
          sourceType: source.sourceType,
          sourceId: source.sourceId,
          reason: "manual",
        },
        timestamp: new Date().toISOString(),
      });
    } catch {
      // Event publishing failure should not fail the user's request
    }
  }

  return c.json({ sourceId, isArchived });
});

// ===========================================
// POST /:id/sources/relink — Move source to another project
// ===========================================
projectRoutes.post("/:id/sources/relink", async (c) => {
  const tenantId = c.get("tenantId");
  const userId = c.get("userId");
  const requestId = c.get("requestId");
  const projectId = c.req.param("id");

  const body = await c.req.json().catch(() => null);
  if (!body) {
    return c.json(
      { error: { code: "INVALID_BODY", message: "Request body must be valid JSON", requestId } },
      400
    );
  }

  const parsed = RelinkSourceRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid request body", details: parsed.error.issues, requestId } },
      400
    );
  }

  const { sourceId, targetProjectId } = parsed.data;

  // Verify both projects belong to tenant
  const [sourceProject, targetProject] = await Promise.all([
    verifyProjectOwnership(projectId, tenantId),
    verifyProjectOwnership(targetProjectId, tenantId),
  ]);

  if (!sourceProject) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Source project not found", requestId } },
      404
    );
  }

  if (!targetProject) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Target project not found", requestId } },
      404
    );
  }

  // Find the active source link
  const source = await db.projectSource.findFirst({
    where: { projectId, sourceId, unlinkedAt: null },
    select: { id: true, sourceType: true, sourceUrl: true },
  });

  if (!source) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Active source link not found in source project", requestId } },
      404
    );
  }

  // Atomically unlink from source project and link to target project
  await db.$transaction(async (tx) => {
    // Unlink from current project
    await tx.projectSource.update({
      where: { id: source.id },
      data: { unlinkedAt: new Date() },
    });

    // Link to target project (ignore if already linked)
    try {
      await tx.projectSource.create({
        data: {
          projectId: targetProjectId,
          sourceType: source.sourceType as any,
          sourceId,
          sourceUrl: source.sourceUrl,
          linkedBy: "MANUAL" as any,
          linkedByUserId: userId,
        },
      });
    } catch (err: any) {
      if (err?.code !== "P2002") throw err;
      // Already linked to target - that's fine
    }
  });

  // Trigger summary regeneration for both projects
  await Promise.all([
    triggerSummaryRegeneration(projectId),
    triggerSummaryRegeneration(targetProjectId),
  ]);

  return c.json({ sourceId, fromProjectId: projectId, toProjectId: targetProjectId });
});

// ===========================================
// GET /:id/reviews — Project-scoped reviews
// ===========================================
projectRoutes.get("/:id/reviews", async (c) => {
  const tenantId = c.get("tenantId");
  const requestId = c.get("requestId");
  const projectId = c.req.param("id");

  const project = await verifyProjectOwnership(projectId, tenantId);
  if (!project) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Project not found", requestId } },
      404
    );
  }

  // Parse filters
  const statusParam = c.req.query("status");
  const riskParam = c.req.query("riskLevel");
  const limitParam = c.req.query("limit");
  const cursor = c.req.query("cursor");

  const limit = Math.min(Math.max(parseInt(limitParam || "20", 10) || 20, 1), 50);

  // Build where clause for reviews through context bundles
  const bundleWhere: any = {
    tenantId,
    projectId,
    review: { isNot: null },
  };

  if (statusParam) {
    const statuses = statusParam.split(",");
    bundleWhere.status = { in: statuses };
  }
  if (riskParam) {
    const risks = riskParam.split(",");
    bundleWhere.riskLevel = { in: risks };
  }

  const bundles = await db.contextBundle.findMany({
    where: bundleWhere,
    orderBy: [{ riskLevel: "asc" }, { createdAt: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      event: {
        select: { source: true, externalId: true },
      },
      review: {
        select: {
          id: true,
          status: true,
          severity: true,
          summary: true,
          confidence: true,
          createdAt: true,
          _count: { select: { findings: true } },
        },
      },
    },
  });

  const hasMore = bundles.length > limit;
  const page = hasMore ? bundles.slice(0, limit) : bundles;
  const nextCursor = hasMore ? page[page.length - 1].id : null;

  const reviews = page
    .filter((b) => b.review)
    .map((bundle) => ({
      id: bundle.id,
      reviewId: bundle.review!.id,
      status: bundle.status,
      reviewStatus: bundle.review!.status,
      riskLevel: bundle.riskLevel,
      severity: bundle.review!.severity,
      summary: bundle.review!.summary,
      confidence: bundle.review!.confidence,
      findingCount: bundle.review!._count?.findings ?? 0,
      title: bundle.title,
      source: bundle.event.source,
      externalId: bundle.event.externalId,
      createdAt: bundle.review!.createdAt.toISOString(),
    }));

  return c.json({ reviews, nextCursor });
});

// ===========================================
// GET /:id/activity — Project activity timeline
// ===========================================

interface ActivityEvent {
  type: "source_linked" | "source_unlinked" | "source_archived" | "review_generated" | "summary_updated";
  timestamp: string;
  data: Record<string, unknown>;
}

projectRoutes.get("/:id/activity", async (c) => {
  const tenantId = c.get("tenantId");
  const requestId = c.get("requestId");
  const projectId = c.req.param("id");

  const project = await db.project.findFirst({
    where: { id: projectId, tenantId },
    select: { id: true, summaryUpdatedAt: true },
  });

  if (!project) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Project not found", requestId } },
      404
    );
  }

  const limitParam = c.req.query("limit");
  const cursor = c.req.query("cursor");
  const limit = Math.min(Math.max(parseInt(limitParam || "50", 10) || 50, 1), 50);
  const cursorDate = cursor ? new Date(cursor) : null;

  // Gather activity events from multiple sources in parallel
  const [sources, reviews] = await Promise.all([
    // All ProjectSource records (linked, unlinked, archived events)
    db.projectSource.findMany({
      where: { projectId },
      select: {
        sourceType: true,
        sourceId: true,
        linkedBy: true,
        linkReason: true,
        linkedByUserId: true,
        linkedAt: true,
        unlinkedAt: true,
        isArchived: true,
        archivedAt: true,
        archivedReason: true,
      },
    }),
    // Reviews via context bundles
    db.review.findMany({
      where: {
        tenantId,
        contextBundle: { projectId },
      },
      select: {
        id: true,
        severity: true,
        createdAt: true,
        contextBundle: { select: { title: true } },
      },
    }),
  ]);

  // Build unified timeline
  const events: ActivityEvent[] = [];

  // Source linked events
  for (const source of sources) {
    events.push({
      type: "source_linked",
      timestamp: source.linkedAt.toISOString(),
      data: {
        sourceType: source.sourceType,
        sourceId: source.sourceId,
        linkedBy: source.linkedBy,
        linkReason: source.linkReason,
        linkedByUserId: source.linkedByUserId,
      },
    });

    // Source unlinked events
    if (source.unlinkedAt) {
      events.push({
        type: "source_unlinked",
        timestamp: source.unlinkedAt.toISOString(),
        data: {
          sourceType: source.sourceType,
          sourceId: source.sourceId,
        },
      });
    }

    // Source archived events
    if (source.isArchived && source.archivedAt) {
      events.push({
        type: "source_archived",
        timestamp: source.archivedAt.toISOString(),
        data: {
          sourceType: source.sourceType,
          sourceId: source.sourceId,
          reason: source.archivedReason,
        },
      });
    }
  }

  // Review generated events
  for (const review of reviews) {
    events.push({
      type: "review_generated",
      timestamp: review.createdAt.toISOString(),
      data: {
        reviewId: review.id,
        title: review.contextBundle?.title ?? null,
        severity: review.severity,
      },
    });
  }

  // Summary updated event (single entry from latest update)
  if (project.summaryUpdatedAt) {
    events.push({
      type: "summary_updated",
      timestamp: project.summaryUpdatedAt.toISOString(),
      data: { trigger: "latest" },
    });
  }

  // Sort newest first
  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Apply cursor filter
  let filtered = events;
  if (cursorDate) {
    filtered = events.filter((e) => new Date(e.timestamp) < cursorDate);
  }

  // Paginate
  const page = filtered.slice(0, limit);
  const hasMore = filtered.length > limit;
  const nextCursor = hasMore ? page[page.length - 1].timestamp : null;

  return c.json({ events: page, nextCursor });
});
