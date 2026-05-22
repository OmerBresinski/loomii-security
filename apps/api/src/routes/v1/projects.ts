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
import type { AppEnv } from "../../lib/types";
import {
  CreateProjectRequestSchema,
  UpdateProjectRequestSchema,
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

  const lastActivity = project.contextBundles.length > 0
    ? project.contextBundles.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0].updatedAt.toISOString()
    : null;

  return { sourceCount, reviewCount, highestRisk, lastActivity };
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

  const { name, sources } = parsed.data;

  // Create project + sources in a transaction
  const project = await db.$transaction(async (tx) => {
    const newProject = await tx.project.create({
      data: {
        tenantId,
        name,
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
          linkedBy: "MANUAL" as any,
          linkedByUserId: userId,
        })),
        skipDuplicates: true,
      });
    }

    return newProject;
  });

  return c.json(
    {
      id: project.id,
      name: project.name,
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
    const { sourceCount, reviewCount, highestRisk, lastActivity } = computeAggregates(p);

    return {
      id: p.id,
      name: p.name,
      sourceCount,
      reviewCount,
      highestRisk,
      lastActivity,
      createdAt: p.createdAt.toISOString(),
    };
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
    },
  });

  if (!project) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Project not found", requestId } },
      404
    );
  }

  const { sourceCount, reviewCount, highestRisk, lastActivity } = computeAggregates(project);

  return c.json({
    id: project.id,
    name: project.name,
    summary: project.summary ?? null,
    summaryUpdatedAt: project.summaryUpdatedAt?.toISOString() ?? null,
    sourceCount,
    reviewCount,
    highestRisk,
    lastActivity,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  });
});

// ===========================================
// PATCH /:id — Update project
// ===========================================
projectRoutes.patch("/:id", async (c) => {
  const tenantId = c.get("tenantId");
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
    select: { id: true },
  });

  if (!existing) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Project not found", requestId } },
      404
    );
  }

  const updated = await db.project.update({
    where: { id: projectId },
    data: { ...parsed.data },
  });

  return c.json({
    id: updated.id,
    name: updated.name,
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
