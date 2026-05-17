/**
 * Linear webhook signature verification.
 * Validates that incoming webhooks are genuinely from Linear.
 *
 * Docs: https://developers.linear.app/docs/graphql/webhooks
 *
 * Linear signs webhooks with HMAC-SHA256 using the webhook signing secret.
 * The signature is in the `linear-signature` header.
 */
import { createHmac, timingSafeEqual } from "crypto";

/**
 * Verify a Linear webhook signature.
 *
 * @param body - Raw request body (string)
 * @param signature - Value from the `linear-signature` header
 * @param secret - Webhook signing secret from LINEAR_WEBHOOK_SECRET
 * @returns true if signature is valid
 */
export function verifyLinearWebhookSignature(
  body: string,
  signature: string,
  secret?: string
): boolean {
  const webhookSecret = secret ?? process.env.LINEAR_WEBHOOK_SECRET;

  if (!webhookSecret) {
    throw new Error(
      "LINEAR_WEBHOOK_SECRET not configured. Cannot verify webhook signature."
    );
  }

  if (!signature) {
    return false;
  }

  const hmac = createHmac("sha256", webhookSecret);
  hmac.update(body);
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
    return false;
  }
}
