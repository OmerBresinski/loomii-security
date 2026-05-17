/**
 * E2E Auth Tests
 * These tests run against a live API server with real WorkOS credentials.
 * Requires: .env with valid WORKOS_API_KEY, WORKOS_CLIENT_ID, WORKOS_REDIRECT_URI
 *
 * Run: docker compose up -d postgres redis && bun run apps/api/src/index.ts &
 * Then: bun test apps/api/src/middleware/auth.e2e.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";

const API_URL = "http://localhost:3000";
let serverProcess: any;

describe("E2E: Auth Flow", () => {
  beforeAll(async () => {
    // Verify server is running by checking health
    const maxRetries = 5;
    for (let i = 0; i < maxRetries; i++) {
      try {
        const res = await fetch(`${API_URL}/health`);
        if (res.ok) return;
      } catch {}
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error(
      "API server not running. Start with: bun run apps/api/src/index.ts"
    );
  });

  describe("Public routes remain accessible", () => {
    it("GET /health returns 200 without auth", async () => {
      const res = await fetch(`${API_URL}/health`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.status).toBe("healthy");
    });

    it("GET /health includes X-Request-ID header", async () => {
      const res = await fetch(`${API_URL}/health`);
      const requestId = res.headers.get("X-Request-ID");
      expect(requestId).toBeDefined();
      expect(requestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    });
  });

  describe("Protected routes require auth", () => {
    it("GET /api/v1 without token returns 401", async () => {
      const res = await fetch(`${API_URL}/api/v1`);
      expect(res.status).toBe(401);

      const body = await res.json();
      expect(body.error.code).toBe("UNAUTHORIZED");
      expect(body.error.message).toContain("Missing");
      expect(body.error.requestId).toBeDefined();
    });

    it("GET /api/v1 with malformed token returns 401", async () => {
      const res = await fetch(`${API_URL}/api/v1`, {
        headers: { Authorization: "Bearer totally_invalid_token_xyz" },
      });
      expect(res.status).toBe(401);

      const body = await res.json();
      expect(body.error.code).toBe("UNAUTHORIZED");
      expect(body.error.message).toContain("Invalid or expired");
    });

    it("GET /api/v1 with empty Bearer returns 401", async () => {
      const res = await fetch(`${API_URL}/api/v1`, {
        headers: { Authorization: "Bearer " },
      });
      expect(res.status).toBe(401);
    });

    it("401 response includes CORS headers", async () => {
      const res = await fetch(`${API_URL}/api/v1`, {
        headers: { Origin: "http://localhost:5173" },
      });
      expect(res.status).toBe(401);
      // CORS should still be applied on 401 responses
      expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    });
  });

  describe("Auth login redirect", () => {
    it("GET /auth/login redirects to WorkOS authorization URL", async () => {
      const res = await fetch(`${API_URL}/auth/login`, {
        redirect: "manual",
      });

      // Should be a 302 redirect
      expect(res.status).toBe(302);

      const location = res.headers.get("Location");
      expect(location).toBeDefined();
      expect(location).toContain("api.workos.com");
      expect(location).toContain("user_management/authorize");
      expect(location).toContain("client_id=");
      expect(location).toContain("redirect_uri=");
      expect(location).toContain("provider=authkit");
    });

    it("Auth URL contains correct client_id from env", async () => {
      const res = await fetch(`${API_URL}/auth/login`, {
        redirect: "manual",
      });

      const location = res.headers.get("Location")!;
      const url = new URL(location);
      const clientId = url.searchParams.get("client_id");
      expect(clientId).toStartWith("client_");
    });

    it("Auth URL contains correct redirect_uri", async () => {
      const res = await fetch(`${API_URL}/auth/login`, {
        redirect: "manual",
      });

      const location = res.headers.get("Location")!;
      const url = new URL(location);
      const redirectUri = url.searchParams.get("redirect_uri");
      expect(redirectUri).toBe("http://localhost:3000/auth/callback");
    });
  });

  describe("Auth callback", () => {
    it("GET /auth/callback without code returns 400", async () => {
      const res = await fetch(`${API_URL}/auth/callback`);
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error.code).toBe("BAD_REQUEST");
      expect(body.error.message).toContain("Missing authorization code");
    });

    it("GET /auth/callback with invalid code returns 401", async () => {
      const res = await fetch(`${API_URL}/auth/callback?code=invalid_code_123`);
      expect(res.status).toBe(401);

      const body = await res.json();
      expect(body.error.code).toBe("AUTH_FAILED");
    });
  });
});
