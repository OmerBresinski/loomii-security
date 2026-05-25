/**
 * Tests for finding dismiss/restore endpoints.
 * All external dependencies (DB) are mocked.
 */
import { describe, it, expect, beforeEach, mock } from "bun:test";
import { Hono } from "hono";
import type { AppEnv } from "../../lib/types";
import { findingRoutes } from "./findings";

// =========================================
// Mock setup
// =========================================

const mockFindingFindFirst = mock((_args: unknown) => Promise.resolve(null as unknown));
const mockFindingUpdate = mock((_args: unknown) => Promise.resolve({} as unknown));

mock.module("@loomii/db", () => ({
  db: {
    finding: {
      findFirst: mockFindingFindFirst,
      update: mockFindingUpdate,
    },
  },
}));

// =========================================
// Test app setup
// =========================================

function createTestApp() {
  const app = new Hono<AppEnv>();

  app.use("*", async (c, next) => {
    c.set("tenantId", "tenant_123");
    c.set("userId", "user_456");
    c.set("requestId", "req_test");
    c.set("logger", { info: mock(), warn: mock(), error: mock(), debug: mock() } as any);
    c.set("user", { id: "user_456", email: "sec@test.com" } as any);
    c.set("role", "SECURITY_LEAD" as any);
    await next();
  });

  app.route("/api/v1/findings", findingRoutes);
  return app;
}

// =========================================
// Tests
// =========================================

describe("PATCH /api/v1/findings/:id/dismiss", () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    app = createTestApp();
    mockFindingFindFirst.mockReset();
    mockFindingUpdate.mockReset();
  });

  it("returns 200 with DISMISSED status for valid reason", async () => {
    mockFindingFindFirst.mockResolvedValueOnce({ id: "finding_1", status: null });
    mockFindingUpdate.mockResolvedValueOnce({
      id: "finding_1",
      status: "DISMISSED",
      dismissalReason: "FALSE_POSITIVE",
      dismissedAt: new Date("2026-01-01"),
    });

    const res = await app.request("/api/v1/findings/finding_1/dismiss", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "FALSE_POSITIVE" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("finding_1");
    expect(body.status).toBe("DISMISSED");
    expect(body.dismissalReason).toBe("FALSE_POSITIVE");
  });

  it("returns 400 for invalid dismissal reason", async () => {
    const res = await app.request("/api/v1/findings/finding_1/dismiss", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "INVALID_REASON" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when finding is CONFIRMED", async () => {
    mockFindingFindFirst.mockResolvedValueOnce({ id: "finding_1", status: "CONFIRMED" });

    const res = await app.request("/api/v1/findings/finding_1/dismiss", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "FALSE_POSITIVE" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_STATE");
  });

  it("returns 404 for wrong tenant (finding not found)", async () => {
    mockFindingFindFirst.mockResolvedValueOnce(null);

    const res = await app.request("/api/v1/findings/finding_unknown/dismiss", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "NOT_APPLICABLE" }),
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("records dismissedBy and dismissedAt in update call", async () => {
    mockFindingFindFirst.mockResolvedValueOnce({ id: "finding_1", status: null });
    mockFindingUpdate.mockResolvedValueOnce({
      id: "finding_1",
      status: "DISMISSED",
      dismissalReason: "DUPLICATE",
      dismissedAt: new Date(),
    });

    await app.request("/api/v1/findings/finding_1/dismiss", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "DUPLICATE" }),
    });

    expect(mockFindingUpdate).toHaveBeenCalledTimes(1);
    const updateArgs = mockFindingUpdate.mock.calls[0][0] as any;
    expect(updateArgs.data.dismissedBy).toBe("user_456");
    expect(updateArgs.data.dismissedAt).toBeInstanceOf(Date);
    expect(updateArgs.data.dismissalReason).toBe("DUPLICATE");
  });
});

describe("PATCH /api/v1/findings/:id/restore", () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    app = createTestApp();
    mockFindingFindFirst.mockReset();
    mockFindingUpdate.mockReset();
  });

  it("returns 200 with null status", async () => {
    mockFindingFindFirst.mockResolvedValueOnce({ id: "finding_1", status: "DISMISSED" });
    mockFindingUpdate.mockResolvedValueOnce({ id: "finding_1", status: null });

    const res = await app.request("/api/v1/findings/finding_1/restore", {
      method: "PATCH",
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("finding_1");
    expect(body.status).toBeNull();
  });

  it("clears dismissal metadata on restore", async () => {
    mockFindingFindFirst.mockResolvedValueOnce({ id: "finding_1", status: "DISMISSED" });
    mockFindingUpdate.mockResolvedValueOnce({ id: "finding_1", status: null });

    await app.request("/api/v1/findings/finding_1/restore", { method: "PATCH" });

    const updateArgs = mockFindingUpdate.mock.calls[0][0] as any;
    expect(updateArgs.data.status).toBeNull();
    expect(updateArgs.data.dismissalReason).toBeNull();
    expect(updateArgs.data.dismissedBy).toBeNull();
    expect(updateArgs.data.dismissedAt).toBeNull();
  });

  it("returns 400 when finding is CONFIRMED", async () => {
    mockFindingFindFirst.mockResolvedValueOnce({ id: "finding_1", status: "CONFIRMED" });

    const res = await app.request("/api/v1/findings/finding_1/restore", {
      method: "PATCH",
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_STATE");
  });
});
