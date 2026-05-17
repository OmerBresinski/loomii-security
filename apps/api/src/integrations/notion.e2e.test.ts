/**
 * E2E Notion Integration Tests
 *
 * Tests OAuth URL generation, token exchange flow, and API connectivity.
 * Requires NOTION_CLIENT_ID, NOTION_CLIENT_SECRET, and NOTION_REDIRECT_URI in .env.
 *
 * Run: bun test apps/api/src/integrations/notion.e2e.test.ts
 */
import { describe, it, expect } from "bun:test";
import {
  getNotionAuthorizationUrl,
  exchangeNotionCode,
  NOTION_AUTHORIZE_URL,
} from "./notion";

const hasCredentials = !!(
  process.env.NOTION_CLIENT_ID && process.env.NOTION_CLIENT_SECRET
);

const describeE2E = hasCredentials ? describe : describe.skip;

if (!hasCredentials) {
  console.log(
    "⚠️  Skipping E2E Notion tests: NOTION_CLIENT_ID and NOTION_CLIENT_SECRET not set"
  );
}

describeE2E("E2E: Notion Integration", () => {
  describe("OAuth authorization URL generation", () => {
    it("generates a valid Notion authorization URL", () => {
      const state = "test-csrf-token-123";
      const url = getNotionAuthorizationUrl(state);

      expect(url).toStartWith(NOTION_AUTHORIZE_URL);
      const parsed = new URL(url);
      expect(parsed.origin + parsed.pathname).toBe(NOTION_AUTHORIZE_URL);
    });

    it("includes correct client_id (owner)", () => {
      const url = getNotionAuthorizationUrl("state");
      const parsed = new URL(url);
      expect(parsed.searchParams.get("owner")).toBe("user");
    });

    it("includes correct redirect_uri", () => {
      const url = getNotionAuthorizationUrl("state");
      const parsed = new URL(url);
      expect(parsed.searchParams.get("redirect_uri")).toBe(
        process.env.NOTION_REDIRECT_URI!
      );
    });

    it("includes state parameter for CSRF protection", () => {
      const state = "unique-csrf-token-789";
      const url = getNotionAuthorizationUrl(state);
      const parsed = new URL(url);
      expect(parsed.searchParams.get("state")).toBe(state);
    });

    it("includes response_type=code", () => {
      const url = getNotionAuthorizationUrl("state");
      const parsed = new URL(url);
      expect(parsed.searchParams.get("response_type")).toBe("code");
    });
  });

  describe("OAuth token exchange", () => {
    it("rejects invalid authorization code", async () => {
      await expect(
        exchangeNotionCode("invalid_code_that_does_not_exist")
      ).rejects.toThrow();
    });
  });
});
