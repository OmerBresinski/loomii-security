/**
 * Linear OAuth orchestration.
 * Manages the complete OAuth flow: state tokens, code exchange,
 * token encryption, verification, and webhook registration.
 *
 * State tokens are stored in Redis with 10-minute TTL and are single-use.
 */
import type { Redis } from "ioredis";
import { createRedisConnection } from "@loomii/queue";
import { encrypt } from "@loomii/shared";
import {
  getLinearAuthorizationUrl,
  exchangeLinearCode,
} from "../integrations/linear/oauth";
import {
  verifyLinearAccess,
  registerLinearWebhooks,
  type LinearViewerInfo,
  type LinearWebhookResult,
} from "./linear-client";

// Redis key prefix for OAuth state tokens
const STATE_KEY_PREFIX = "oauth:linear:state:";
const STATE_TTL_SECONDS = 600; // 10 minutes

/**
 * Lazy-initialized Redis connection for OAuth state management.
 * Separate from rate-limiter to avoid coupling.
 */
let _redis: Redis | null = null;

function getRedis(): Redis {
  if (!_redis) {
    _redis = createRedisConnection();
  }
  return _redis;
}

/** Allow injecting a mock Redis for tests */
export function _setRedis(redis: Redis | null): void {
  _redis = redis;
}

export interface InitiateOAuthResult {
  redirectUrl: string;
  state: string;
}

export interface OAuthCallbackResult {
  integrationId: string;
  workspaceName: string;
  webhookId: string;
}

/**
 * Initiate the Linear OAuth connection flow.
 * Generates a state token, stores it in Redis with tenant context, and returns the redirect URL.
 *
 * @param tenantId - Tenant requesting the connection
 */
export async function initiateLinearOAuth(
  tenantId: string
): Promise<InitiateOAuthResult> {
  const state = crypto.randomUUID();
  const redis = getRedis();

  // Store state -> tenantId mapping with TTL
  await redis.set(
    `${STATE_KEY_PREFIX}${state}`,
    JSON.stringify({ tenantId, createdAt: Date.now() }),
    "EX",
    STATE_TTL_SECONDS
  );

  const redirectUrl = getLinearAuthorizationUrl(state);

  return { redirectUrl, state };
}

/**
 * Verify and consume an OAuth state token.
 * Returns the associated tenantId if valid, null otherwise.
 * State is deleted after successful verification (single-use).
 */
export async function verifyAndConsumeState(
  state: string
): Promise<{ tenantId: string } | null> {
  const redis = getRedis();
  const key = `${STATE_KEY_PREFIX}${state}`;

  // Atomic get-and-delete for single-use
  const data = await redis.get(key);
  if (!data) {
    return null;
  }

  // Delete immediately - single-use regardless of outcome
  await redis.del(key);

  try {
    const parsed = JSON.parse(data) as { tenantId: string; createdAt: number };
    return { tenantId: parsed.tenantId };
  } catch {
    return null;
  }
}

/**
 * Complete the OAuth callback: exchange code, encrypt tokens, verify access,
 * register webhooks, and return the results for storage.
 *
 * This function does NOT write to the database - the caller is responsible
 * for creating/updating the Integration record.
 */
export async function completeLinearOAuth(
  code: string,
  webhookCallbackUrl: string
): Promise<{
  encryptedAccessToken: string;
  encryptedRefreshToken: string | null;
  tokenExpiresAt: Date | null;
  viewer: LinearViewerInfo;
  webhook: LinearWebhookResult;
}> {
  // 1. Exchange authorization code for tokens
  const tokenResponse = await exchangeLinearCode(code);

  // 2. Encrypt tokens before any storage
  const encryptedAccessToken = encrypt(tokenResponse.access_token);
  const encryptedRefreshToken = tokenResponse.refresh_token
    ? encrypt(tokenResponse.refresh_token)
    : null;

  // 3. Calculate token expiry
  const tokenExpiresAt = tokenResponse.expires_in
    ? new Date(Date.now() + tokenResponse.expires_in * 1000)
    : null;

  // 4. Verify access by calling Linear API
  const viewer = await verifyLinearAccess(tokenResponse.access_token);

  // 5. Register webhooks for change detection
  const webhook = await registerLinearWebhooks(
    tokenResponse.access_token,
    webhookCallbackUrl,
    ["Issue", "Comment", "Project"]
  );

  return {
    encryptedAccessToken,
    encryptedRefreshToken,
    tokenExpiresAt,
    viewer,
    webhook,
  };
}
