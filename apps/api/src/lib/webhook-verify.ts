/**
 * Webhook signature verification utilities.
 *
 * Provides HMAC-SHA256 signature verification for incoming webhooks.
 * Uses timing-safe comparison to prevent timing attacks.
 *
 * For Linear webhooks:
 * - Signature is in the `linear-signature` header
 * - Computed: HMAC-SHA256(rawBody, webhookSecret)
 * - The webhookSecret is stored encrypted in the integration's metadata
 */
import { createHmac, timingSafeEqual } from "crypto";
import { db } from "@loomii/db";
import { decrypt } from "@loomii/shared";

/**
 * Verify a webhook signature using HMAC-SHA256.
 *
 * @param rawBody - Raw request body string (must be the exact bytes the signature was computed over)
 * @param signature - The signature to verify (hex-encoded)
 * @param secret - The signing secret
 * @returns true if the signature is valid
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  secret: string
): boolean {
  if (!signature || !secret) {
    return false;
  }

  const hmac = createHmac("sha256", secret);
  hmac.update(rawBody);
  const expectedSignature = hmac.digest("hex");

  // Use timing-safe comparison to prevent timing attacks
  try {
    const sigBuffer = Buffer.from(signature, "hex");
    const expectedBuffer = Buffer.from(expectedSignature, "hex");

    if (sigBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(sigBuffer, expectedBuffer);
  } catch {
    // Invalid hex string or other crypto error
    return false;
  }
}

/**
 * Look up the Linear integration for a given organization ID and verify the webhook.
 *
 * Linear webhooks include an organizationId in the payload.
 * We use this to find the integration record, which has the encrypted webhook secret.
 *
 * @param organizationId - Linear organization ID from webhook payload
 * @returns The integration record with decrypted webhook secret, or null if not found
 */
export async function findLinearIntegrationByOrgId(
  organizationId: string
): Promise<{
  integrationId: string;
  tenantId: string;
  webhookSecret: string;
} | null> {
  // Find integration by externalId (which is the Linear organization ID)
  const integration = await db.integration.findFirst({
    where: {
      provider: "LINEAR",
      externalId: organizationId,
      status: "ACTIVE",
    },
    select: {
      id: true,
      tenantId: true,
      metadata: true,
    },
  });

  if (!integration) {
    return null;
  }

  // Extract and decrypt webhook secret from metadata
  const metadata = integration.metadata as Record<string, unknown> | null;
  const encryptedSecret = metadata?.webhookSecret as string | null;

  if (!encryptedSecret) {
    return null;
  }

  const webhookSecret = decrypt(encryptedSecret);

  return {
    integrationId: integration.id,
    tenantId: integration.tenantId,
    webhookSecret,
  };
}
