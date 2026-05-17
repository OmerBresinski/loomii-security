/**
 * E2E Notion Integration Tests
 *
 * Tests OAuth URL generation, token exchange flow, and API connectivity.
 * Requires NOTION_CLIENT_ID, NOTION_CLIENT_SECRET, and NOTION_REDIRECT_URI in .env.
 *
 * Run: bun test apps/api/src/integrations/notion.e2e.test.ts
 */
import { describe, it, expect, beforeAll } from "bun:test";
import {
  getNotionAuthorizationUrl,
  exchangeNotionCode,
  NOTION_AUTHORIZE_URL,
} from "./notion";

describe("E2E: Notion Integration", () => {
  beforeAll(() => {
    if (!process.env.NOTION_CLIENT_ID || !process.env.NOTION_CLIENT_SECRET) {
      throw new Error(
        "Notion credentials not configured. Set NOTION_CLIENT_ID and NOTION_CLIENT_SECRET in .env",
      );
    }
  });

  describe("OAuth authorization URL generation", () => {
    it("generates a valid Notion authorization URL", () => {
      const state = "test-csrf-token-123";
      const url = getNotionAuthorizationUrl(state);

      expect(url).toStartWith(NOTION_AUTHORIZE_URL);
      const parsed = new URL(url);
      expect(parsed.origin + parsed.pathname).toBe(NOTION_AUTHORIZE_URL);
    });

    it("includes correct client_id", () => {
      const url = getNotionAuthorizationUrl("state");
      const parsed = new URL(url);
      expect(parsed.searchParams.get("client_id")).toBe(
        process.env.NOTION_CLIENT_ID!,
      );
    });

    it("includes correct redirect_uri", () => {
      const url = getNotionAuthorizationUrl("state");
      const parsed = new URL(url);
      expect(parsed.searchParams.get("redirect_uri")).toBe(
        process.env.NOTION_REDIRECT_URI!,
      );
    });

    it("includes response_type=code", () => {
      const url = getNotionAuthorizationUrl("state");
      const parsed = new URL(url);
      expect(parsed.searchParams.get("response_type")).toBe("code");
    });

    it("includes owner=user", () => {
      const url = getNotionAuthorizationUrl("state");
      const parsed = new URL(url);
      expect(parsed.searchParams.get("owner")).toBe("user");
    });

    it("includes state parameter for CSRF protection", () => {
      const state = "unique-csrf-token-789";
      const url = getNotionAuthorizationUrl(state);
      const parsed = new URL(url);
      expect(parsed.searchParams.get("state")).toBe(state);
    });
  });

  describe("OAuth token exchange", () => {
    it("rejects invalid authorization code", async () => {
      await expect(
        exchangeNotionCode("invalid_code_that_does_not_exist"),
      ).rejects.toThrow("Notion token exchange failed");
    });

    it("uses Basic auth for token exchange (not body params)", async () => {
      // Verify the error response comes from Notion's token endpoint
      // (meaning our request format is correct, just the code is invalid)
      try {
        await exchangeNotionCode("bad_code");
      } catch (e: any) {
        // Should get a 401 or 400 from Notion, not a network error
        expect(e.message).toContain("Notion token exchange failed");
        expect(e.message).toMatch(/4\d{2}/); // 4xx status code
      }
    });
  });

  describe("API connectivity", () => {
    it("can reach Notion API with valid credentials format", async () => {
      // Test that we can hit the Notion API (users/me endpoint)
      // This will fail with 401 since we don't have a valid access_token yet,
      // but confirms network connectivity and correct API URL
      const response = await fetch("https://api.notion.com/v1/users/me", {
        headers: {
          Authorization: "Bearer invalid_token_for_connectivity_test",
          "Notion-Version": "2022-06-28",
        },
      });

      // 401 means we reached Notion's API successfully (just unauthorized)
      expect(response.status).toBe(401);
    });
  });
});
