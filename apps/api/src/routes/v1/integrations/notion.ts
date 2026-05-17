/**
 * Notion OAuth integration routes.
 *
 * POST /api/v1/integrations/notion/connect
 *   - Generates state token, returns Notion OAuth redirect URL
 *
 * GET /api/v1/integrations/notion/callback
 *   - Handles OAuth callback
 *   - Verifies state, exchanges code, stores encrypted tokens
 *   - Registers BullMQ repeatable polling job (every 2 min)
 *   - Redirects to frontend settings page
 *
 * Key differences from Linear:
 * - No refresh token (Notion tokens don't expire)
 * - No webhooks - registers a BullMQ repeatable job for polling
 * - Rate limit: max 3 req/s per integration
 */
import { Hono } from "hono";
import type { AppEnv } from "../../../lib/types";
import { db } from "@loomii/db";
import { eventsQueue, notionPollingQueue } from "@loomii/queue";
import {
  initiateNotionOAuth,
  verifyAndConsumeNotionState,
  completeNotionOAuth,
} from "../../../lib/notion-oauth";

export const notionRoutes = new Hono<AppEnv>();

/**
 * POST /api/v1/integrations/notion/connect
 *
 * Initiates the Notion OAuth connection flow.
 * Generates a state token stored in Redis (10min TTL) and returns
 * the Notion OAuth authorization URL for the frontend to redirect to.
 */
notionRoutes.post("/connect", async (c) => {
  const tenantId = c.get("tenantId");
  const logger = c.get("logger");

  // Check if tenant already has an active Notion integration
  const existing = await db.integration.findUnique({
    where: {
      tenantId_provider: {
        tenantId,
        provider: "NOTION",
      },
    },
  });

  if (existing && existing.status === "ACTIVE") {
    return c.json(
      {
        error: {
          code: "INTEGRATION_EXISTS",
          message: "Notion integration is already connected",
          requestId: c.get("requestId"),
        },
      },
      409
    );
  }

  const { redirectUrl } = await initiateNotionOAuth(tenantId);

  logger.info({ provider: "notion" }, "OAuth flow initiated");

  return c.json({ redirectUrl }, 200);
});

/**
 * GET /api/v1/integrations/notion/callback
 *
 * Handles the OAuth callback from Notion.
 * Verifies state, exchanges code for token, encrypts and stores it,
 * verifies access, registers polling job, and redirects to frontend.
 *
 * NOTE: The callback needs auth context. In production, the state token
 * carries the tenantId so we can resolve ownership without a session.
 */
notionRoutes.get("/callback", async (c) => {
  const logger = c.get("logger");
  const code = c.req.query("code");
  const state = c.req.query("state");

  // Validate required params
  if (!code || !state) {
    logger.warn("Notion OAuth callback missing code or state");
    const frontendUrl = process.env.FRONTEND_URL;
    return c.redirect(
      `${frontendUrl}/settings/integrations?status=error&reason=missing_params`
    );
  }

  // Verify and consume state token (single-use)
  const stateData = await verifyAndConsumeNotionState(state);
  if (!stateData) {
    logger.warn(
      { state: state.slice(0, 8) + "..." },
      "Invalid or expired Notion OAuth state"
    );
    const frontendUrl = process.env.FRONTEND_URL;
    return c.redirect(
      `${frontendUrl}/settings/integrations?status=error&reason=invalid_state`
    );
  }

  const { tenantId } = stateData;

  try {
    // Complete the OAuth flow: exchange code, encrypt, verify
    const result = await completeNotionOAuth(code);

    // Store integration record in DB
    const integration = await db.integration.upsert({
      where: {
        tenantId_provider: {
          tenantId,
          provider: "NOTION",
        },
      },
      update: {
        status: "ACTIVE",
        externalId: result.workspaceId,
        accessToken: result.encryptedAccessToken,
        refreshToken: null, // Notion tokens don't have refresh tokens
        tokenExpiresAt: null, // Notion tokens don't expire
        metadata: {
          workspaceName: result.workspaceName,
          botId: result.botId,
          workspaceId: result.workspaceId,
        },
        lastSyncAt: null,
        lastSyncCursor: null,
      },
      create: {
        tenantId,
        provider: "NOTION",
        status: "ACTIVE",
        externalId: result.workspaceId,
        accessToken: result.encryptedAccessToken,
        refreshToken: null,
        tokenExpiresAt: null,
        metadata: {
          workspaceName: result.workspaceName,
          botId: result.botId,
          workspaceId: result.workspaceId,
        },
      },
    });

    // Register BullMQ repeatable job for polling (every 2 minutes)
    // Notion has no webhooks, so we poll for changes
    await notionPollingQueue.add(
      "poll",
      {
        tenantId,
        integrationId: integration.id,
      },
      {
        repeat: {
          every: 120_000, // 2 minutes in milliseconds
        },
        jobId: `notion-poll-${tenantId}`, // Prevent duplicate repeatable jobs
      }
    );

    // Publish integration.connected event to queue
    await eventsQueue.add("integration.connected", {
      tenantId,
      eventType: "integration.connected",
      data: {
        integrationId: integration.id,
        provider: "NOTION",
        workspaceName: result.workspaceName,
        externalId: result.workspaceId,
      },
      timestamp: new Date().toISOString(),
    });

    logger.info(
      {
        provider: "notion",
        integrationId: integration.id,
        workspaceName: result.workspaceName,
      },
      "Notion integration connected successfully"
    );

    // Redirect to frontend success page
    const frontendUrl = process.env.FRONTEND_URL;
    return c.redirect(
      `${frontendUrl}/settings/integrations?status=success&provider=notion`
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    logger.error(
      { error: errorMessage, provider: "notion" },
      "Notion OAuth callback failed"
    );

    const frontendUrl = process.env.FRONTEND_URL;
    return c.redirect(
      `${frontendUrl}/settings/integrations?status=error&reason=exchange_failed`
    );
  }
});
