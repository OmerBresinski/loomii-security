/**
 * Integration management routes.
 *
 * GET  /api/v1/integrations         - List all integrations for the tenant
 * POST /api/v1/integrations/linear/connect  - Initiate Linear OAuth
 * GET  /api/v1/integrations/linear/callback - Handle Linear OAuth callback
 * POST /api/v1/integrations/notion/connect  - Initiate Notion OAuth
 * GET  /api/v1/integrations/notion/callback - Handle Notion OAuth callback
 */
import { Hono } from "hono";
import type { AppEnv } from "../../lib/types";
import { db } from "@loomii/db";
import { linearRoutes } from "./integrations/linear";
import { notionRoutes } from "./integrations/notion";

export const integrationRoutes = new Hono<AppEnv>();

// Mount provider-specific routes
integrationRoutes.route("/linear", linearRoutes);
integrationRoutes.route("/notion", notionRoutes);

/**
 * GET /api/v1/integrations
 *
 * Lists all integrations for the current tenant.
 * Tokens are NEVER exposed in the response.
 */
integrationRoutes.get("/", async (c) => {
  const tenantId = c.get("tenantId");

  const integrations = await db.integration.findMany({
    where: { tenantId },
    select: {
      id: true,
      provider: true,
      status: true,
      externalId: true,
      metadata: true,
      lastSyncAt: true,
      createdAt: true,
      updatedAt: true,
      // Explicitly exclude tokens
      accessToken: false,
      refreshToken: false,
      tokenExpiresAt: false,
    },
    orderBy: { createdAt: "desc" },
  });

  // Map to API response shape
  const response = integrations.map((integration) => ({
    id: integration.id,
    provider: integration.provider,
    status: integration.status,
    externalId: integration.externalId,
    workspaceName:
      (integration.metadata as Record<string, unknown>)?.workspaceName ?? null,
    lastSyncAt: integration.lastSyncAt?.toISOString() ?? null,
    connectedAt: integration.createdAt.toISOString(),
    updatedAt: integration.updatedAt.toISOString(),
  }));

  return c.json({ integrations: response }, 200);
});
