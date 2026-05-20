/**
 * Threat Model Query API
 *
 * 5 endpoints for querying threat model data:
 * - GET /                   - Full model (all entities)
 * - GET /threats?query=     - Semantic threat search (pgvector)
 * - GET /gaps               - Unresolved coverage gaps
 * - GET /history            - Version changelog
 * - GET /components/:id     - Component detail + relations
 *
 * All queries are tenant-scoped via auth middleware.
 * Response times: full model <3s, search <2s, gaps <1s.
 */
import { Hono } from "hono";
import type { AppEnv } from "../../lib/types";
import { db } from "@loomii/db";
import { semanticSearch } from "../../lib/semantic-search";

export const threatModelRoutes = new Hono<AppEnv>();

// ─── GET / — Full model ───────────────────────────────────────────────────────

/**
 * GET /api/v1/threat-model
 *
 * Returns the full threat model for the authenticated tenant with all entities.
 * Excludes deprecated entities by default (add ?includeDeprecated=true to include).
 */
threatModelRoutes.get("/", async (c) => {
  const tenantId = c.get("tenantId");
  const includeDeprecated = c.req.query("includeDeprecated") === "true";

  const deprecatedFilter = includeDeprecated ? {} : { isDeprecated: false };

  const model = await db.threatModel.findUnique({
    where: { tenantId },
    include: {
      components: {
        where: deprecatedFilter,
        orderBy: { createdAt: "asc" },
      },
      dataFlows: {
        where: deprecatedFilter,
        orderBy: { createdAt: "asc" },
      },
      trustBoundaries: {
        where: deprecatedFilter,
        orderBy: { createdAt: "asc" },
      },
      entryPoints: {
        where: deprecatedFilter,
        orderBy: { createdAt: "asc" },
      },
      assets: {
        where: deprecatedFilter,
        orderBy: { createdAt: "asc" },
      },
      threats: {
        where: deprecatedFilter,
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!model) {
    return c.json(
      {
        error: {
          code: "NOT_FOUND",
          message: "No threat model exists for this tenant",
          requestId: c.get("requestId"),
        },
      },
      404
    );
  }

  return c.json({
    model: {
      id: model.id,
      status: model.status,
      version: model.version,
      generatedAt: model.generatedAt?.toISOString() ?? null,
      lastUpdatedAt: model.lastUpdatedAt.toISOString(),
      components: model.components.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        description: c.description,
        isDeprecated: c.isDeprecated,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      })),
      dataFlows: model.dataFlows.map((f) => ({
        id: f.id,
        fromComponentId: f.fromComponentId,
        toComponentId: f.toComponentId,
        description: f.description,
        dataType: f.dataType,
        sensitivity: f.sensitivity,
        encryption: f.encryption,
        isDeprecated: f.isDeprecated,
        createdAt: f.createdAt.toISOString(),
        updatedAt: f.updatedAt.toISOString(),
      })),
      trustBoundaries: model.trustBoundaries.map((b) => ({
        id: b.id,
        name: b.name,
        description: b.description,
        fromZone: b.fromZone,
        toZone: b.toZone,
        isDeprecated: b.isDeprecated,
        createdAt: b.createdAt.toISOString(),
        updatedAt: b.updatedAt.toISOString(),
      })),
      entryPoints: model.entryPoints.map((ep) => ({
        id: ep.id,
        name: ep.name,
        type: ep.type,
        description: ep.description,
        authRequired: ep.authRequired,
        authType: ep.authType,
        rateLimited: ep.rateLimited,
        isDeprecated: ep.isDeprecated,
        createdAt: ep.createdAt.toISOString(),
        updatedAt: ep.updatedAt.toISOString(),
      })),
      assets: model.assets.map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        sensitivity: a.sensitivity,
        description: a.description,
        isDeprecated: a.isDeprecated,
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
      })),
      threats: model.threats.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        strideCategory: t.strideCategory,
        severity: t.severity,
        likelihood: t.likelihood,
        mitigationStatus: t.mitigationStatus,
        mitigationNotes: t.mitigationNotes,
        componentId: t.componentId,
        dataFlowId: t.dataFlowId,
        entryPointId: t.entryPointId,
        isDeprecated: t.isDeprecated,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      })),
    },
  });
});

// ─── GET /threats?query= — Semantic threat search ─────────────────────────────

/**
 * GET /api/v1/threat-model/threats?query=<text>&limit=5
 *
 * Semantic search across threat embeddings via pgvector cosine similarity.
 * Returns threats matching the query, ranked by relevance.
 */
threatModelRoutes.get("/threats", async (c) => {
  const tenantId = c.get("tenantId");
  const query = c.req.query("query");
  const limitParam = c.req.query("limit");

  if (!query || query.length < 3) {
    return c.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Query parameter 'query' is required (min 3 characters)",
          requestId: c.get("requestId"),
        },
      },
      400
    );
  }

  let limit = 10;
  if (limitParam) {
    const parsed = parseInt(limitParam, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 50) {
      limit = parsed;
    }
  }

  // Semantic search scoped to tenant, filtered to threat embeddings.
  // Over-fetch 3x to account for non-threat embeddings being discarded.
  const results = await semanticSearch({
    query,
    tenantId,
    limit: Math.min(limit * 3, 50),
    threshold: 0.5, // Higher threshold for threat relevance
  });

  // Filter to only threat-sourced embeddings and take requested limit
  const threatResults = results
    .filter((r) => (r.metadata as any)?.sourceType === "threat")
    .slice(0, limit);

  // Fetch full threat records for the matched IDs
  const threatIds = threatResults
    .map((r) => (r.metadata as any)?.threatId)
    .filter(Boolean) as string[];

  let threats: Array<{
    id: string;
    title: string;
    description: string | null;
    strideCategory: string;
    severity: string;
    likelihood: string | null;
    similarity?: number;
  }> = [];

  if (threatIds.length > 0) {
    const dbThreats = await db.tmThreat.findMany({
      where: { id: { in: threatIds }, isDeprecated: false },
      select: {
        id: true,
        title: true,
        description: true,
        strideCategory: true,
        severity: true,
        likelihood: true,
      },
    });

    // Merge with similarity scores, preserving search ranking
    const threatMap = new Map(dbThreats.map((t) => [t.id, t]));
    threats = threatResults
      .map((r) => {
        const threatId = (r.metadata as any)?.threatId;
        const threat = threatMap.get(threatId);
        if (!threat) return null;
        return { ...threat, similarity: r.similarity };
      })
      .filter(Boolean) as typeof threats;
  }

  return c.json({ threats, query, count: threats.length });
});

// ─── GET /gaps — Unresolved coverage gaps ─────────────────────────────────────

/**
 * GET /api/v1/threat-model/gaps
 *
 * Returns all unresolved coverage gaps for the tenant's threat model,
 * sorted by severity (CRITICAL first).
 */
threatModelRoutes.get("/gaps", async (c) => {
  const tenantId = c.get("tenantId");

  const model = await db.threatModel.findUnique({
    where: { tenantId },
    select: { id: true },
  });

  if (!model) {
    return c.json(
      {
        error: {
          code: "NOT_FOUND",
          message: "No threat model exists for this tenant",
          requestId: c.get("requestId"),
        },
      },
      404
    );
  }

  const gaps = await db.tmGap.findMany({
    where: { threatModelId: model.id, isResolved: false },
    select: {
      id: true,
      type: true,
      severity: true,
      description: true,
      entityType: true,
      entityId: true,
      createdAt: true,
    },
  });

  // Sort by severity priority (CRITICAL > HIGH > MEDIUM > LOW)
  const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  const sorted = gaps.sort(
    (a, b) => {
      const sevDiff =
        (severityOrder[a.severity as keyof typeof severityOrder] ?? 4) -
        (severityOrder[b.severity as keyof typeof severityOrder] ?? 4);
      if (sevDiff !== 0) return sevDiff;
      // Secondary sort: most recent first within same severity
      return b.createdAt.getTime() - a.createdAt.getTime();
    }
  );

  return c.json({
    gaps: sorted.map((g) => ({
      ...g,
      createdAt: g.createdAt.toISOString(),
    })),
    count: sorted.length,
  });
});

// ─── GET /history — Version changelog ─────────────────────────────────────────

/**
 * GET /api/v1/threat-model/history
 *
 * Returns the version changelog (TmChange records) for the tenant's model,
 * ordered by version descending (most recent first).
 */
threatModelRoutes.get("/history", async (c) => {
  const tenantId = c.get("tenantId");

  const model = await db.threatModel.findUnique({
    where: { tenantId },
    select: { id: true },
  });

  if (!model) {
    return c.json(
      {
        error: {
          code: "NOT_FOUND",
          message: "No threat model exists for this tenant",
          requestId: c.get("requestId"),
        },
      },
      404
    );
  }

  const changes = await db.tmChange.findMany({
    where: { threatModelId: model.id },
    select: {
      id: true,
      version: true,
      changeType: true,
      triggeredBy: true,
      summary: true,
      diff: true,
      createdAt: true,
    },
    orderBy: { version: "desc" },
  });

  return c.json({
    changes: changes.map((ch) => ({
      ...ch,
      createdAt: ch.createdAt.toISOString(),
    })),
    count: changes.length,
  });
});

// ─── GET /components/:id — Component detail ───────────────────────────────────

/**
 * GET /api/v1/threat-model/components/:id
 *
 * Returns a single component with its related threats, data flows (from/to),
 * and entry points. Verifies the component belongs to the authenticated tenant.
 */
threatModelRoutes.get("/components/:id", async (c) => {
  const tenantId = c.get("tenantId");
  const componentId = c.req.param("id");

  // Fetch component with relations, ensuring tenant scope
  const component = await db.tmComponent.findFirst({
    where: {
      id: componentId,
      threatModel: { tenantId },
    },
    include: {
      threats: {
        where: { isDeprecated: false },
        select: {
          id: true,
          title: true,
          strideCategory: true,
          severity: true,
          likelihood: true,
          mitigationStatus: true,
        },
      },
      outgoingDataFlows: {
        where: { isDeprecated: false },
        select: {
          id: true,
          toComponentId: true,
          description: true,
          dataType: true,
          sensitivity: true,
          encryption: true,
        },
      },
      incomingDataFlows: {
        where: { isDeprecated: false },
        select: {
          id: true,
          fromComponentId: true,
          description: true,
          dataType: true,
          sensitivity: true,
          encryption: true,
        },
      },
    },
  });

  if (!component) {
    return c.json(
      {
        error: {
          code: "NOT_FOUND",
          message: "Component not found",
          requestId: c.get("requestId"),
        },
      },
      404
    );
  }

  return c.json({
    component: {
      id: component.id,
      name: component.name,
      type: component.type,
      description: component.description,
      isDeprecated: component.isDeprecated,
      createdAt: component.createdAt.toISOString(),
      updatedAt: component.updatedAt.toISOString(),
      threats: component.threats,
      dataFlowsFrom: component.outgoingDataFlows,
      dataFlowsTo: component.incomingDataFlows,
    },
  });
});
