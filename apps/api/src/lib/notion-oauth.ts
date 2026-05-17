/**
 * Notion OAuth orchestration.
 * Manages the complete OAuth flow: state tokens, code exchange,
 * token encryption, and verification.
 *
 * Key differences from Linear OAuth:
 * - Notion tokens don't expire (no refresh token)
 * - No webhooks - uses BullMQ polling instead
 * - Basic auth for token exchange (base64 of client_id:client_secret)
 *
 * State tokens are stored in Redis with 10-minute TTL and are single-use.
 */
import type { Redis } from "ioredis";
import { createRedisConnection } from "@loomii/queue";
import { encrypt } from "@loomii/shared";
import {
  getNotionAuthorizationUrl,
  exchangeNotionCode,
} from "../integrations/notion/oauth";
import { verifyNotionAccess, type NotionWorkspaceInfo } from "./notion-client";

// Redis key prefix for OAuth state tokens
const STATE_KEY_PREFIX = "oauth:notion:state:";
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

export interface InitiateNotionOAuthResult {
  redirectUrl: string;
  state: string;
}

/**
 * Initiate the Notion OAuth connection flow.
 * Generates a state token, stores it in Redis with tenant context, and returns the redirect URL.
 *
 * @param tenantId - Tenant requesting the connection
 */
export async function initiateNotionOAuth(
  tenantId: string
): Promise<InitiateNotionOAuthResult> {
  const state = crypto.randomUUID();
  const redis = getRedis();

  // Store state -> tenantId mapping with TTL
  await redis.set(
    `${STATE_KEY_PREFIX}${state}`,
    JSON.stringify({ tenantId, createdAt: Date.now() }),
    "EX",
    STATE_TTL_SECONDS
  );

  const redirectUrl = getNotionAuthorizationUrl(state);

  return { redirectUrl, state };
}

/**
 * Verify and consume an OAuth state token.
 * Returns the associated tenantId if valid, null otherwise.
 * State is deleted after successful verification (single-use).
 */
export async function verifyAndConsumeNotionState(
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
 * Complete the OAuth callback: exchange code, encrypt token, verify access,
 * and return the results for storage.
 *
 * This function does NOT write to the database - the caller is responsible
 * for creating/updating the Integration record and registering the polling job.
 */
export async function completeNotionOAuth(code: string): Promise<{
  encryptedAccessToken: string;
  workspaceId: string;
  workspaceName: string;
  botId: string;
  workspace: NotionWorkspaceInfo;
}> {
  // 1. Exchange authorization code for tokens
  const tokenResponse = await exchangeNotionCode(code);

  // 2. Encrypt token before any storage
  // Notion tokens don't expire - no refresh token to handle
  const encryptedAccessToken = encrypt(tokenResponse.access_token);

  // 3. Verify access by calling Notion API (search)
  const workspace = await verifyNotionAccess(tokenResponse.access_token);

  return {
    encryptedAccessToken,
    workspaceId: tokenResponse.workspace_id,
    workspaceName: tokenResponse.workspace_name ?? "Unnamed Workspace",
    botId: tokenResponse.bot_id,
    workspace,
  };
}
