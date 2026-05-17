/**
 * E2E Linear Integration Tests
 *
 * Tests OAuth URL generation, webhook signature verification,
 * and callback flow. Requires LINEAR_CLIENT_ID, LINEAR_CLIENT_SECRET,
 * LINEAR_REDIRECT_URI, and LINEAR_WEBHOOK_SECRET in .env.
 *
 * Run: bun test apps/api/src/integrations/linear.e2e.test.ts
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { createHmac } from "crypto";
import {
  getLinearAuthorizationUrl,
  exchangeLinearCode,
  verifyLinearWebhookSignature,
  SCOPES,
  LINEAR_AUTHORIZE_URL,
} from "./linear";

describe("E2E: Linear Integration", () => {
  beforeAll(() => {
    if (!process.env.LINEAR_CLIENT_ID || !process.env.LINEAR_CLIENT_SECRET) {
      throw new Error(
        "Linear credentials not configured. Set LINEAR_CLIENT_ID and LINEAR_CLIENT_SECRET in .env"
      );
    }
  });

  describe("OAuth authorization URL generation", () => {
    it("generates a valid Linear authorization URL", () => {
      const state = "test-csrf-token-123";
      const url = getLinearAuthorizationUrl(state);

      expect(url).toStartWith(LINEAR_AUTHORIZE_URL);
      const parsed = new URL(url);
      expect(parsed.origin + parsed.pathname).toBe(LINEAR_AUTHORIZE_URL);
    });

    it("includes correct client_id", () => {
      const url = getLinearAuthorizationUrl("state");
      const parsed = new URL(url);
      expect(parsed.searchParams.get("client_id")).toBe(
        process.env.LINEAR_CLIENT_ID!
      );
    });

    it("includes correct redirect_uri", () => {
      const url = getLinearAuthorizationUrl("state");
      const parsed = new URL(url);
      expect(parsed.searchParams.get("redirect_uri")).toBe(
        process.env.LINEAR_REDIRECT_URI!
      );
    });

    it("includes required scopes", () => {
      const url = getLinearAuthorizationUrl("state");
      const parsed = new URL(url);
      const scopeParam = parsed.searchParams.get("scope")!;
      const scopes = scopeParam.split(",");

      for (const scope of SCOPES) {
        expect(scopes).toContain(scope);
      }
    });

    it("includes state parameter for CSRF protection", () => {
      const state = "unique-csrf-token-456";
      const url = getLinearAuthorizationUrl(state);
      const parsed = new URL(url);
      expect(parsed.searchParams.get("state")).toBe(state);
    });

    it("includes response_type=code", () => {
      const url = getLinearAuthorizationUrl("state");
      const parsed = new URL(url);
      expect(parsed.searchParams.get("response_type")).toBe("code");
    });

    it("includes prompt=consent", () => {
      const url = getLinearAuthorizationUrl("state");
      const parsed = new URL(url);
      expect(parsed.searchParams.get("prompt")).toBe("consent");
    });
  });

  describe("Webhook signature verification", () => {
    const webhookSecret = process.env.LINEAR_WEBHOOK_SECRET!;

    it("verifies a valid webhook signature", () => {
      const body = JSON.stringify({
        action: "create",
        type: "Issue",
        data: { id: "issue-123", title: "Test Issue" },
      });

      // Compute the correct signature
      const hmac = createHmac("sha256", webhookSecret);
      hmac.update(body);
      const signature = hmac.digest("hex");

      const isValid = verifyLinearWebhookSignature(body, signature);
      expect(isValid).toBe(true);
    });

    it("rejects an invalid webhook signature", () => {
      const body = JSON.stringify({ action: "create", type: "Issue" });
      const invalidSignature = "deadbeef".repeat(8); // 64 hex chars (32 bytes)

      const isValid = verifyLinearWebhookSignature(body, invalidSignature);
      expect(isValid).toBe(false);
    });

    it("rejects when body has been tampered with", () => {
      const originalBody = JSON.stringify({ action: "create", type: "Issue" });
      const tamperedBody = JSON.stringify({ action: "delete", type: "Issue" });

      // Sign the original body
      const hmac = createHmac("sha256", webhookSecret);
      hmac.update(originalBody);
      const signature = hmac.digest("hex");

      // Verify with tampered body
      const isValid = verifyLinearWebhookSignature(tamperedBody, signature);
      expect(isValid).toBe(false);
    });

    it("rejects empty signature", () => {
      const body = JSON.stringify({ action: "create" });
      const isValid = verifyLinearWebhookSignature(body, "");
      expect(isValid).toBe(false);
    });

    it("rejects malformed signature (not hex)", () => {
      const body = JSON.stringify({ action: "create" });
      const isValid = verifyLinearWebhookSignature(body, "not-hex-at-all!");
      expect(isValid).toBe(false);
    });

    it("works with explicit secret parameter", () => {
      const body = JSON.stringify({ data: "test" });
      const customSecret = "my-custom-secret";

      const hmac = createHmac("sha256", customSecret);
      hmac.update(body);
      const signature = hmac.digest("hex");

      const isValid = verifyLinearWebhookSignature(body, signature, customSecret);
      expect(isValid).toBe(true);
    });
  });

  describe("OAuth token exchange", () => {
    it("rejects invalid authorization code", async () => {
      await expect(
        exchangeLinearCode("invalid_code_that_does_not_exist")
      ).rejects.toThrow("Linear token exchange failed");
    });
  });
});
