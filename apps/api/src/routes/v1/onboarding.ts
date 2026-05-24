/**
 * Onboarding Wizard Routes
 *
 * Manages the 5-step onboarding flow for new tenants:
 * 1. Connect Linear
 * 2. Connect Notion
 * 3. Configure Policies
 * 4. Select Monitoring Scope
 * 5. Initial Sync (cosmetic)
 *
 * Routes:
 * - GET    /api/v1/onboarding              - Get current onboarding state
 * - PATCH  /api/v1/onboarding/step         - Save current step progress
 * - POST   /api/v1/onboarding/policies     - Configure policy toggles
 * - GET    /api/v1/onboarding/scope        - List available resources to monitor
 * - POST   /api/v1/onboarding/scope        - Save monitoring scope selection
 * - POST   /api/v1/onboarding/sync         - Start initial sync (cosmetic)
 * - GET    /api/v1/onboarding/sync/status  - Poll sync status
 * - POST   /api/v1/onboarding/complete     - Mark onboarding as done
 */
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../lib/types";
import { db } from "@loomii/db";

export const onboardingRoutes = new Hono<AppEnv>();

// ─── Schemas ──────────────────────────────────────────────────────────────────

const SaveStepSchema = z.object({
  step: z.number().int().min(0).max(4),
});

const ConfigurePoliciesSchema = z.object({
  enabledPolicies: z.array(z.string()),
});

const SaveScopeSchema = z.object({
  linearProjectIds: z.array(z.string()),
  linearTeamIds: z.array(z.string()),
  notionPageIds: z.array(z.string()),
});

// ─── In-memory sync state (per-tenant, cosmetic) ─────────────────────────────

const syncState = new Map<
  string,
  { status: string; progress: number; message: string; startedAt: number }
>();

// ─── GET /api/v1/onboarding ──────────────────────────────────────────────────

onboardingRoutes.get("/", async (c) => {
  const tenantId = c.get("tenantId");

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: {
      onboardingStep: true,
      onboardingCompleted: true,
    },
  });

  if (!tenant) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Tenant not found", requestId: c.get("requestId") } },
      404
    );
  }

  // Check integration statuses
  const integrations = await db.integration.findMany({
    where: { tenantId, status: "ACTIVE" },
    select: { provider: true },
  });

  const linearConnected = integrations.some((i) => i.provider === "LINEAR");
  const notionConnected = integrations.some((i) => i.provider === "NOTION");

  return c.json({
    onboarding: {
      currentStep: tenant.onboardingStep,
      completed: tenant.onboardingCompleted,
      linearConnected,
      notionConnected,
      policiesConfigured: tenant.onboardingStep > 2,
      monitoringConfigured: tenant.onboardingStep > 3,
      syncCompleted: tenant.onboardingCompleted,
    },
  });
});

// ─── PATCH /api/v1/onboarding/step ───────────────────────────────────────────

onboardingRoutes.patch("/step", async (c) => {
  const tenantId = c.get("tenantId");
  const requestId = c.get("requestId");

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      { error: { code: "INVALID_BODY", message: "Invalid JSON body", requestId } },
      400
    );
  }

  const parsed = SaveStepSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
          requestId,
        },
      },
      400
    );
  }

  await db.tenant.update({
    where: { id: tenantId },
    data: { onboardingStep: parsed.data.step },
  });

  return c.json({ success: true });
});

// ─── POST /api/v1/onboarding/policies ────────────────────────────────────────

onboardingRoutes.post("/policies", async (c) => {
  const tenantId = c.get("tenantId");
  const requestId = c.get("requestId");

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      { error: { code: "INVALID_BODY", message: "Invalid JSON body", requestId } },
      400
    );
  }

  const parsed = ConfigurePoliciesSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
          requestId,
        },
      },
      400
    );
  }

  const { enabledPolicies } = parsed.data;

  // Get all built-in policies
  const builtInPolicies = await db.policy.findMany({
    where: { isBuiltIn: true },
    select: { id: true, identifier: true },
  });

  // Create/update overrides for each built-in policy based on the selection
  for (const policy of builtInPolicies) {
    const isEnabled = enabledPolicies.includes(policy.identifier);

    await db.policyOverride.upsert({
      where: {
        tenantId_policyId: { tenantId, policyId: policy.id },
      },
      create: {
        tenantId,
        policyId: policy.id,
        isEnabled,
      },
      update: {
        isEnabled,
      },
    });
  }

  return c.json({ success: true });
});

// ─── GET /api/v1/onboarding/scope ────────────────────────────────────────────

onboardingRoutes.get("/scope", async (c) => {
  const tenantId = c.get("tenantId");

  // Fetch connected integrations with their metadata
  const integrations = await db.integration.findMany({
    where: { tenantId, status: "ACTIVE" },
    select: { provider: true, metadata: true, externalId: true },
  });

  // For Linear: extract teams/projects from metadata stored during OAuth
  const linearIntegration = integrations.find((i) => i.provider === "LINEAR");
  const notionIntegration = integrations.find((i) => i.provider === "NOTION");

  // Linear teams/projects come from the integration metadata
  // (populated during the OAuth connect callback)
  const linearMeta = (linearIntegration?.metadata ?? {}) as Record<string, unknown>;
  const linearTeams = Array.isArray(linearMeta.teams)
    ? (linearMeta.teams as Array<{ id: string; name: string; key: string }>)
    : [];
  const linearProjects = Array.isArray(linearMeta.projects)
    ? (linearMeta.projects as Array<{ id: string; name: string; teamName: string }>)
    : [];

  // Notion pages from metadata
  const notionMeta = (notionIntegration?.metadata ?? {}) as Record<string, unknown>;
  const notionPages = Array.isArray(notionMeta.pages)
    ? (notionMeta.pages as Array<{ id: string; title: string; icon: string | null; parentTitle: string | null }>)
    : [];

  return c.json({
    linearTeams,
    linearProjects,
    notionPages,
  });
});

// ─── POST /api/v1/onboarding/scope ───────────────────────────────────────────

onboardingRoutes.post("/scope", async (c) => {
  const tenantId = c.get("tenantId");
  const requestId = c.get("requestId");

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      { error: { code: "INVALID_BODY", message: "Invalid JSON body", requestId } },
      400
    );
  }

  const parsed = SaveScopeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
          requestId,
        },
      },
      400
    );
  }

  // Store scope selection in the tenant's integration metadata
  // This will be used by polling/webhook processors to filter incoming events
  const { linearProjectIds, linearTeamIds, notionPageIds } = parsed.data;

  // Update Linear integration metadata with selected scope (merge, don't overwrite)
  if (linearProjectIds.length > 0 || linearTeamIds.length > 0) {
    const linearIntegration = await db.integration.findFirst({
      where: { tenantId, provider: "LINEAR", status: "ACTIVE" },
      select: { id: true, metadata: true },
    });

    if (linearIntegration) {
      const existingMeta = (linearIntegration.metadata ?? {}) as Record<string, unknown>;
      await db.integration.update({
        where: { id: linearIntegration.id },
        data: {
          metadata: {
            ...existingMeta,
            monitoringScope: { projectIds: linearProjectIds, teamIds: linearTeamIds },
          },
        },
      });
    }
  }

  // Update Notion integration metadata with selected scope (merge, don't overwrite)
  if (notionPageIds.length > 0) {
    const notionIntegration = await db.integration.findFirst({
      where: { tenantId, provider: "NOTION", status: "ACTIVE" },
      select: { id: true, metadata: true },
    });

    if (notionIntegration) {
      const existingMeta = (notionIntegration.metadata ?? {}) as Record<string, unknown>;
      await db.integration.update({
        where: { id: notionIntegration.id },
        data: {
          metadata: {
            ...existingMeta,
            monitoringScope: { pageIds: notionPageIds },
          },
        },
      });
    }
  }

  return c.json({ success: true });
});

// ─── POST /api/v1/onboarding/sync ────────────────────────────────────────────

onboardingRoutes.post("/sync", async (c) => {
  const tenantId = c.get("tenantId");

  // Start cosmetic sync progress
  syncState.set(tenantId, {
    status: "syncing",
    progress: 0,
    message: "Preparing initial sync...",
    startedAt: Date.now(),
  });

  return c.json({ success: true });
});

// ─── GET /api/v1/onboarding/sync/status ──────────────────────────────────────

onboardingRoutes.get("/sync/status", async (c) => {
  const tenantId = c.get("tenantId");

  const state = syncState.get(tenantId);

  if (!state) {
    return c.json({ status: "idle", progress: 0, message: "Not started" });
  }

  // Cosmetic progress: advance over ~5 seconds
  const elapsed = Date.now() - state.startedAt;
  const duration = 5000; // 5 seconds total

  if (elapsed >= duration) {
    // Complete
    syncState.delete(tenantId);
    return c.json({
      status: "completed",
      progress: 100,
      message: "Initial sync complete!",
    });
  }

  // Calculate progress with easing
  const rawProgress = Math.min(elapsed / duration, 1);
  // Ease-out cubic for natural feeling
  const easedProgress = 1 - Math.pow(1 - rawProgress, 3);
  const progress = Math.round(easedProgress * 95); // Cap at 95% until done

  // Progress messages
  let message = "Preparing initial sync...";
  if (progress > 20) message = "Connecting to workspaces...";
  if (progress > 40) message = "Scanning Linear issues...";
  if (progress > 60) message = "Scanning Notion pages...";
  if (progress > 80) message = "Indexing content...";

  return c.json({ status: "syncing", progress, message });
});

// ─── POST /api/v1/onboarding/complete ────────────────────────────────────────

onboardingRoutes.post("/complete", async (c) => {
  const tenantId = c.get("tenantId");
  const requestId = c.get("requestId");

  // Verify at least one workspace is connected
  const integrations = await db.integration.findMany({
    where: { tenantId, status: "ACTIVE" },
    select: { provider: true },
  });

  if (integrations.length === 0) {
    return c.json(
      {
        error: {
          code: "PRECONDITION_FAILED",
          message: "At least one workspace must be connected before completing onboarding",
          requestId,
        },
      },
      412
    );
  }

  // Mark onboarding as completed
  await db.tenant.update({
    where: { id: tenantId },
    data: {
      onboardingCompleted: true,
      onboardingStep: 4, // Final step
    },
  });

  // Clean up sync state
  syncState.delete(tenantId);

  return c.json({ success: true });
});
