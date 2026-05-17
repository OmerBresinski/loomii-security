import { describe, it, expect } from "bun:test";
import { Hono } from "hono";
import type { AppEnv } from "../lib/types";
import { requireRole } from "./rbac";
import { requestId } from "./request-id";

function createApp(allowedRoles: string[], userRole: string | undefined) {
  const app = new Hono<AppEnv>();
  app.use("*", requestId);
  // Simulate auth middleware setting role
  app.use("*", async (c, next) => {
    if (userRole) {
      c.set("role", userRole as any);
    }
    await next();
  });
  app.get("/protected", requireRole(...(allowedRoles as any)), (c) =>
    c.json({ ok: true })
  );
  return app;
}

describe("requireRole", () => {
  it("allows matching role", async () => {
    const app = createApp(["ADMIN"], "ADMIN");
    const res = await app.request("/protected");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("blocks non-matching role", async () => {
    const app = createApp(["ADMIN", "SECURITY_LEAD"], "DEVELOPER");
    const res = await app.request("/protected");
    expect(res.status).toBe(403);
  });

  it("allows when user has one of multiple allowed roles", async () => {
    const app = createApp(["ADMIN", "SECURITY_LEAD"], "SECURITY_LEAD");
    const res = await app.request("/protected");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("returns consistent 403 format", async () => {
    const app = createApp(["ADMIN"], "DEVELOPER");
    const res = await app.request("/protected");
    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.error.message).toContain("Access denied");
    expect(body.error.message).toContain("ADMIN");
    expect(body.error.requestId).toBeDefined();
  });

  it("returns 403 when role is not set on context", async () => {
    const app = createApp(["ADMIN"], undefined);
    const res = await app.request("/protected");
    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("ADMIN accessing admin-only route passes through", async () => {
    const app = createApp(["ADMIN"], "ADMIN");
    const res = await app.request("/protected");
    expect(res.status).toBe(200);
  });

  it("DEVELOPER accessing policies route gets 403", async () => {
    const app = createApp(["ADMIN", "SECURITY_LEAD"], "DEVELOPER");
    const res = await app.request("/protected");
    expect(res.status).toBe(403);
  });

  it("SECURITY_LEAD accessing policies route passes through", async () => {
    const app = createApp(["ADMIN", "SECURITY_LEAD"], "SECURITY_LEAD");
    const res = await app.request("/protected");
    expect(res.status).toBe(200);
  });

  it("VIEWER is blocked from write routes", async () => {
    const app = createApp(["ADMIN", "SECURITY_LEAD", "DEVELOPER"], "VIEWER");
    const res = await app.request("/protected");
    expect(res.status).toBe(403);
  });
});
