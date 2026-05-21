import { describe, it, expect, beforeEach } from "bun:test";
import { Hono } from "hono";
import type { AppEnv } from "../lib/types";
import { requestId } from "./request-id";
import { authMiddleware, createSession, _resetStores } from "./auth";

describe("authMiddleware", () => {
  let app: Hono<AppEnv>;

  beforeEach(() => {
    _resetStores();

    app = new Hono<AppEnv>();
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
    const res = await app.request("/api/test", {
      headers: { Authorization: "Bearer nonexistent_session_id" },
    });
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(body.error.message).toContain("Invalid or expired");
  });

  it("sets context for valid session", async () => {
    const sessionId = createSession({
      user: {
        id: "user_001",
        email: "alice@example.com",
        firstName: "Alice",
        lastName: "Smith",
      },
      organizationId: "org_123",
      createdAt: Date.now(),
    });

    const res = await app.request("/api/test", {
      headers: { Authorization: `Bearer ${sessionId}` },
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.user.id).toBe("user_001");
    expect(body.user.email).toBe("alice@example.com");
    expect(body.tenantId).toBeDefined();
    expect(body.role).toBe("ADMIN"); // First user = ADMIN
  });

  it("creates tenant on first org login and assigns ADMIN", async () => {
    const sessionId = createSession({
      user: {
        id: "user_first",
        email: "founder@startup.com",
        firstName: "Founder",
      },
      organizationId: "org_new",
      createdAt: Date.now(),
    });

    const res = await app.request("/api/test", {
      headers: { Authorization: `Bearer ${sessionId}` },
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.tenantId).toBeDefined();
    expect(body.role).toBe("ADMIN");
  });

  it("assigns DEVELOPER to subsequent users from same org", async () => {
    // First user creates tenant as ADMIN
    const session1 = createSession({
      user: {
        id: "user_admin",
        email: "admin@company.com",
        firstName: "Admin",
      },
      organizationId: "org_existing",
      createdAt: Date.now(),
    });
    await app.request("/api/test", {
      headers: { Authorization: `Bearer ${session1}` },
    });

    // Second user from same org
    const session2 = createSession({
      user: {
        id: "user_dev",
        email: "dev@company.com",
        firstName: "Dev",
      },
      organizationId: "org_existing",
      createdAt: Date.now(),
    });
    const res = await app.request("/api/test", {
      headers: { Authorization: `Bearer ${session2}` },
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.role).toBe("DEVELOPER");
  });

  it("does not expose token in error response", async () => {
    const res = await app.request("/api/test", {
      headers: { Authorization: "Bearer super_secret_token_value_here" },
    });
    expect(res.status).toBe(401);

    const body = await res.json();
    const bodyString = JSON.stringify(body);
    expect(bodyString).not.toContain("super_secret_token_value_here");
  });
});
