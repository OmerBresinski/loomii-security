import { describe, it, expect, beforeEach, mock } from "bun:test";
import { Hono } from "hono";
import { requestId } from "./request-id";

// Mock WorkOS responses
let mockAuthResult: any = null;
let mockAuthError: Error | null = null;

mock.module("@workos-inc/node", () => ({
  WorkOS: class MockWorkOS {
    userManagement = {
      authenticateWithSessionCookie: async ({ sessionData }: { sessionData: string }) => {
        if (mockAuthError) throw mockAuthError;
        return mockAuthResult;
      },
    };
  },
}));

// Import after mocking
const { authMiddleware, _resetStores } = await import("./auth");

describe("authMiddleware", () => {
  let app: Hono;

  beforeEach(() => {
    _resetStores();
    mockAuthResult = null;
    mockAuthError = null;

    app = new Hono();
    app.use("*", requestId);
    app.use("*", authMiddleware);
    app.get("/api/test", (c) => {
      return c.json({
        user: c.get("user"),
        tenantId: c.get("tenantId"),
        role: c.get("role"),
      });
    });
  });

  it("returns 401 for missing token", async () => {
    const res = await app.request("/api/test");
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(body.error.message).toContain("Missing");
  });

  it("returns 401 for missing Bearer prefix", async () => {
    const res = await app.request("/api/test", {
      headers: { Authorization: "invalid-token" },
    });
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 401 for invalid token", async () => {
    mockAuthError = new Error("Invalid session");

    const res = await app.request("/api/test", {
      headers: { Authorization: "Bearer invalid_session_token_here" },
    });
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(body.error.message).toContain("Invalid or expired");
  });

  it("sets context for valid token", async () => {
    mockAuthResult = {
      authenticated: true,
      user: {
        id: "user_001",
        email: "alice@example.com",
        firstName: "Alice",
        lastName: "Smith",
      },
      organizationId: "org_123",
    };

    const res = await app.request("/api/test", {
      headers: { Authorization: "Bearer valid_session_token" },
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.user.id).toBe("user_001");
    expect(body.user.email).toBe("alice@example.com");
    expect(body.tenantId).toBeDefined();
    expect(body.role).toBe("ADMIN"); // First user = ADMIN
  });

  it("creates tenant on first org login and assigns ADMIN", async () => {
    mockAuthResult = {
      authenticated: true,
      user: {
        id: "user_first",
        email: "founder@startup.com",
        firstName: "Founder",
        lastName: null,
      },
      organizationId: "org_new",
    };

    const res = await app.request("/api/test", {
      headers: { Authorization: "Bearer valid_token" },
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.tenantId).toBeDefined();
    expect(body.role).toBe("ADMIN");
  });

  it("assigns DEVELOPER to subsequent users from same org", async () => {
    // First user creates tenant as ADMIN
    mockAuthResult = {
      authenticated: true,
      user: {
        id: "user_admin",
        email: "admin@company.com",
        firstName: "Admin",
        lastName: null,
      },
      organizationId: "org_existing",
    };
    await app.request("/api/test", {
      headers: { Authorization: "Bearer token1" },
    });

    // Second user from same org
    mockAuthResult = {
      authenticated: true,
      user: {
        id: "user_dev",
        email: "dev@company.com",
        firstName: "Dev",
        lastName: null,
      },
      organizationId: "org_existing",
    };
    const res = await app.request("/api/test", {
      headers: { Authorization: "Bearer token2" },
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.role).toBe("DEVELOPER");
  });

  it("does not expose token in error response", async () => {
    mockAuthError = new Error("Token expired");

    const res = await app.request("/api/test", {
      headers: { Authorization: "Bearer super_secret_token_value_here" },
    });
    expect(res.status).toBe(401);

    const body = await res.json();
    const bodyString = JSON.stringify(body);
    expect(bodyString).not.toContain("super_secret_token_value_here");
  });
});
