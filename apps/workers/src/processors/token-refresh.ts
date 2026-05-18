/**
 * Token Refresh Logic
 *
 * Proactively refreshes Linear OAuth tokens before they expire.
 * Runs as a sweep job every 15 minutes, finding tokens expiring within 1 hour.
 *
 * Flow:
 * 1. Query all Linear integrations with tokenExpiresAt within 1 hour
 * 2. For each, decrypt refresh_token and call Linear's token endpoint
 * 3. Encrypt new tokens and update the DB
 * 4. Track refresh failures in metadata; after 3 consecutive failures, mark as ERROR
 * 5. Publish integration.error event on failure
 *
 * Linear token endpoint: POST https://api.linear.app/oauth/token
 *   grant_type=refresh_token, client_id, client_secret, refresh_token
 */
import { db } from "@loomii/db";
import { eventsQueue } from "@loomii/queue";
import { encrypt, decrypt } from "@loomii/shared";
import { logger } from "../lib/logger";

const LINEAR_TOKEN_URL = "https://api.linear.app/oauth/token";
const MAX_REFRESH_FAILURES = 3;

/** Tokens expiring within this window will be proactively refreshed */
const EXPIRY_WINDOW_MS = 60 * 60 * 1000; // 1 hour

interface RefreshResult {
  integrationId: string;
  success: boolean;
  error?: string;
}

/**
 * Find and refresh all Linear tokens expiring within the next hour.
 */
export async function refreshExpiringTokens(): Promise<RefreshResult[]> {
  const childLogger = logger.child({ task: "token-refresh" });

  // Find Linear integrations with tokens expiring within 1 hour
  const expiryThreshold = new Date(Date.now() + EXPIRY_WINDOW_MS);

  const expiring = await db.integration.findMany({
    where: {
      provider: "LINEAR",
      status: "ACTIVE",
      refreshToken: { not: null },
      tokenExpiresAt: {
        not: null,
        lte: expiryThreshold,
      },
    },
  });

  if (expiring.length === 0) {
    childLogger.info("No tokens expiring soon");
    return [];
  }

  childLogger.info(
    { count: expiring.length },
    "Found integrations with expiring tokens"
  );

  const results: RefreshResult[] = [];

  for (const integration of expiring) {
    const result = await refreshSingleToken(integration, childLogger);
    results.push(result);
  }

  return results;
}

/**
 * Refresh a single integration's token.
 */
async function refreshSingleToken(
  integration: {
    id: string;
    tenantId: string;
    refreshToken: string | null;
    metadata: unknown;
  },
  childLogger: typeof logger
): Promise<RefreshResult> {
  const integrationLogger = childLogger.child({
    integrationId: integration.id,
    tenantId: integration.tenantId,
  });

  if (!integration.refreshToken) {
    integrationLogger.warn("No refresh token available, skipping");
    return { integrationId: integration.id, success: false, error: "No refresh token" };
  }

  try {
    // Decrypt the refresh token
    const refreshToken = decrypt(integration.refreshToken);

    // Call Linear token endpoint
    const tokenResponse = await exchangeRefreshToken(refreshToken);

    // Encrypt new tokens
    const encryptedAccessToken = encrypt(tokenResponse.access_token);
    const encryptedRefreshToken = tokenResponse.refresh_token
      ? encrypt(tokenResponse.refresh_token)
      : integration.refreshToken; // Keep existing if no new refresh token returned

    // Calculate new expiry
    const tokenExpiresAt = tokenResponse.expires_in
      ? new Date(Date.now() + tokenResponse.expires_in * 1000)
      : null;

    // Update integration with new tokens (reset failure counter)
    const metadata = (integration.metadata as Record<string, unknown>) ?? {};
    await db.integration.update({
      where: { id: integration.id },
      data: {
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        tokenExpiresAt,
        metadata: { ...metadata, refreshFailures: 0 },
        updatedAt: new Date(),
      },
    });

    integrationLogger.info("Token refreshed successfully");
    return { integrationId: integration.id, success: true };
  } catch (err: any) {
    integrationLogger.error(
      { error: err.message },
      "Token refresh failed"
    );

    // Increment failure counter
    const metadata = (integration.metadata as Record<string, unknown>) ?? {};
    const failures = ((metadata.refreshFailures as number) ?? 0) + 1;

    if (failures >= MAX_REFRESH_FAILURES) {
      // Mark integration as ERROR after 3 consecutive failures
      await db.integration.update({
        where: { id: integration.id },
        data: {
          status: "ERROR",
          metadata: { ...metadata, refreshFailures: failures, errorReason: "token_refresh_failed" },
          updatedAt: new Date(),
        },
      });

      // Publish error event
      await eventsQueue.add("integration-error", {
        tenantId: integration.tenantId,
        eventType: "integration.error",
        data: {
          integrationId: integration.id,
          provider: "LINEAR",
          reason: "token_refresh_failed",
          failures,
          message: `Token refresh failed ${failures} times. Integration disabled.`,
        },
        timestamp: new Date().toISOString(),
      });

      integrationLogger.error(
        { failures },
        "Integration marked as ERROR after max refresh failures"
      );
    } else {
      // Just increment the counter
      await db.integration.update({
        where: { id: integration.id },
        data: {
          metadata: { ...metadata, refreshFailures: failures },
          updatedAt: new Date(),
        },
      });
    }

    return { integrationId: integration.id, success: false, error: err.message };
  }
}

/**
 * Exchange a refresh token for new access/refresh tokens via Linear's OAuth endpoint.
 */
async function exchangeRefreshToken(refreshToken: string): Promise<{
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
}> {
  const clientId = process.env.LINEAR_CLIENT_ID;
  const clientSecret = process.env.LINEAR_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Missing LINEAR_CLIENT_ID or LINEAR_CLIENT_SECRET");
  }

  const response = await fetch(LINEAR_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Linear token refresh failed (${response.status}): ${errorBody}`
    );
  }

  return response.json();
}

/** Exported for testing */
export { MAX_REFRESH_FAILURES, EXPIRY_WINDOW_MS, exchangeRefreshToken };
