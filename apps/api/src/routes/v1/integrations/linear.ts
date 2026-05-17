/**
 * Linear OAuth integration routes.
 *
 * POST /api/v1/integrations/linear/connect
 *   - Generates state token, returns Linear OAuth redirect URL
 *
 * GET /integrations/linear/callback
 *   - Handles OAuth callback (NOTE: mounted at root, not under /api/v1 since it's a redirect target)
 *   - Verifies state, exchanges code, stores encrypted tokens
 *   - Redirects to frontend settings page
 */
import { Hono } from "hono";
import type { AppEnv } from "../../../lib/types";
import { db } from "@loomii/db";
import { eventsQueue } from "@loomii/queue";
import { encrypt } from "@loomii/shared";
import {
  initiateLinearOAuth,
  verifyAndConsumeState,
  completeLinearOAuth,
} from "../../../lib/linear-oauth";

export const linearRoutes = new Hono<AppEnv>();

/**
 * POST /api/v1/integrations/linear/connect
 *
 * Initiates the Linear OAuth connection flow.
 * Generates a state token stored in Redis (10min TTL) and returns
 * the Linear OAuth authorization URL for the frontend to redirect to.
 */
linearRoutes.post("/connect", async (c) => {
  const tenantId = c.get("tenantId");
  const logger = c.get("logger");

  // Check if tenant already has an active Linear integration
  const existing = await db.integration.findUnique({
    where: {
      tenantId_provider: {
        tenantId,
        provider: "LINEAR",
      },
    },
  });

  if (existing && existing.status === "ACTIVE") {
    return c.json(
      {
        error: {
          code: "INTEGRATION_EXISTS",
          message: "Linear integration is already connected",
          requestId: c.get("requestId"),
        },
      },
      409
    );
  }

  const { redirectUrl, state } = await initiateLinearOAuth(tenantId);

  logger.info({ provider: "linear" }, "OAuth flow initiated");

  return c.json({ redirectUrl }, 200);
});

/**
 * GET /api/v1/integrations/linear/callback
 *
 * Handles the OAuth callback from Linear.
 * Verifies state, exchanges code for tokens, encrypts and stores them,
 * verifies access, registers webhooks, and redirects to frontend.
 *
 * NOTE: The callback needs auth context. In production, the state token
 * carries the tenantId so we can resolve ownership without a session.
 */
linearRoutes.get("/callback", async (c) => {
  const logger = c.get("logger");
  const code = c.req.query("code");
  const state = c.req.query("state");

  // Validate required params
  if (!code || !state) {
    logger.warn("OAuth callback missing code or state");
    const frontendUrl = process.env.FRONTEND_URL;
    return c.redirect(
      `${frontendUrl}/settings/integrations?status=error&reason=missing_params`
    );
  }

  // Verify and consume state token (single-use)
  const stateData = await verifyAndConsumeState(state);
  if (!stateData) {
    logger.warn({ state: state.slice(0, 8) + "..." }, "Invalid or expired OAuth state");
    const frontendUrl = process.env.FRONTEND_URL;
    return c.redirect(
      `${frontendUrl}/settings/integrations?status=error&reason=invalid_state`
    );
  }

  const { tenantId } = stateData;

  try {
    // Build webhook callback URL
    const apiBase = process.env.LINEAR_REDIRECT_URI?.replace(
      "/integrations/linear/callback",
      ""
    );
    const webhookCallbackUrl = `${apiBase}/api/v1/webhooks/linear`;

    // Complete the OAuth flow: exchange code, encrypt, verify, register webhooks
    const result = await completeLinearOAuth(code, webhookCallbackUrl);

    // Store integration record in DB
    const integration = await db.integration.upsert({
      where: {
        tenantId_provider: {
          tenantId,
          provider: "LINEAR",
        },
      },
      update: {
        status: "ACTIVE",
        externalId: result.viewer.organization.id,
        accessToken: result.encryptedAccessToken,
        refreshToken: result.encryptedRefreshToken,
        tokenExpiresAt: result.tokenExpiresAt,
        metadata: {
          workspaceName: result.viewer.organization.name,
          viewerId: result.viewer.id,
          viewerEmail: result.viewer.email,
          webhookId: result.webhook.id,
          webhookSecret: result.webhook.secret
            ? encrypt(result.webhook.secret)
            : null,
          webhookResourceTypes: result.webhook.resourceTypes,
        },
      },
      create: {
        tenantId,
        provider: "LINEAR",
        status: "ACTIVE",
        externalId: result.viewer.organization.id,
        accessToken: result.encryptedAccessToken,
        refreshToken: result.encryptedRefreshToken,
        tokenExpiresAt: result.tokenExpiresAt,
        metadata: {
          workspaceName: result.viewer.organization.name,
          viewerId: result.viewer.id,
          viewerEmail: result.viewer.email,
          webhookId: result.webhook.id,
          webhookSecret: result.webhook.secret
            ? encrypt(result.webhook.secret)
            : null,
          webhookResourceTypes: result.webhook.resourceTypes,
        },
      },
    });

    // Publish integration.connected event to queue
    await eventsQueue.add("integration.connected", {
      tenantId,
      eventType: "integration.connected",
      data: {
        integrationId: integration.id,
        provider: "LINEAR",
        workspaceName: result.viewer.organization.name,
        externalId: result.viewer.organization.id,
      },
      timestamp: new Date().toISOString(),
    });

    logger.info(
      {
        provider: "linear",
        integrationId: integration.id,
        workspaceName: result.viewer.organization.name,
      },
      "Linear integration connected successfully"
    );

    // Redirect to frontend success page
    const frontendUrl = process.env.FRONTEND_URL;
    return c.redirect(
      `${frontendUrl}/settings/integrations?status=success&provider=linear`
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    logger.error(
      { error: errorMessage, provider: "linear" },
      "Linear OAuth callback failed"
    );

    const frontendUrl = process.env.FRONTEND_URL;
    return c.redirect(
      `${frontendUrl}/settings/integrations?status=error&reason=exchange_failed`
    );
  }
});
