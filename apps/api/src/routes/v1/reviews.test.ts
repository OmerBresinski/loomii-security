/**
 * Tests for Reviews API
 *
 * Tests cover:
 * - AC1: GET /reviews returns 20 reviews by default
 * - AC2: ?limit=5 returns exactly 5 reviews
 * - AC3: ?riskLevel=CRITICAL returns only critical reviews
 * - AC4: ?status=COMPLETED,FAILED returns reviews with either status
 * - AC5: ?search=auth returns reviews with "auth" in title or summary
 * - AC6: Pagination: using nextCursor fetches the next page
 * - AC7: hasMore: false when no more pages
 * - AC8: Empty result returns { data: [], nextCursor: null, hasMore: false }
 */
import { describe, it, expect, beforeEach, mock } from "bun:test";
import { Hono } from "hono";
import type { AppEnv } from "../../lib/types";

// =========================================
// Mock data
// =========================================

function generateMockBundles(count: number) {
  const statuses = ["ASSEMBLING", "READY", "REVIEWING", "COMPLETED", "FAILED"];
  const riskLevels = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];

  return Array.from({ length: count }, (_, i) => ({
    id: `bundle_${String(i + 1).padStart(3, "0")}`,
    tenantId: "tenant_123",
    eventId: `event_${String(i + 1).padStart(3, "0")}`,
    status: statuses[i % statuses.length],
    riskLevel: i % 7 === 0 ? null : riskLevels[i % riskLevels.length],
    title: i % 3 === 0 ? "Authentication bypass in payment service" : `Security review ${i + 1}`,
    summary: i % 4 === 0 ? "Missing auth checks allow unauthorized access" : `Review summary ${i + 1}`,
    content: null,
    reviewOutput: null,
    createdAt: new Date(Date.now() - i * 3_600_000),
    updatedAt: new Date(Date.now() - i * 3_600_000 + 600_000),
    review: {
      _count: {
        findings: ((i * 7 + 3) % 12) + 1,
      },
    },
  }));
}

const ALL_BUNDLES = generateMockBundles(50);

// =========================================
// Mock setup
// =========================================

const mockFindMany = mock(async (args: any) => {
  let results = [...ALL_BUNDLES];

  // Apply tenant filter
  if (args.where?.tenantId) {
    results = results.filter((r) => r.tenantId === args.where.tenantId);
  }

  // Apply status filter
  if (args.where?.status?.in) {
    results = results.filter((r) => args.where.status.in.includes(r.status));
  }

  // Apply riskLevel filter
  if (args.where?.riskLevel?.in) {
    results = results.filter(
      (r) => r.riskLevel !== null && args.where.riskLevel.in.includes(r.riskLevel)
    );
  }

  // Apply search (OR on title/summary)
  if (args.where?.OR) {
    const titleSearch = args.where.OR[0]?.title?.contains?.toLowerCase();
    const summarySearch = args.where.OR[1]?.summary?.contains?.toLowerCase();
    const keyword = titleSearch || summarySearch;
    if (keyword) {
      results = results.filter(
        (r) =>
          (r.title && r.title.toLowerCase().includes(keyword)) ||
          (r.summary && r.summary.toLowerCase().includes(keyword))
      );
    }
  }

  // Apply cursor (createdAt lt)
  if (args.where?.createdAt?.lt) {
    const cursorDate = new Date(args.where.createdAt.lt).getTime();
    results = results.filter((r) => r.createdAt.getTime() < cursorDate);
  }

  // Apply ordering
  if (args.orderBy?.createdAt === "desc") {
    results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  // Apply take (limit)
  if (args.take) {
    results = results.slice(0, args.take);
  }

  return results;
});

mock.module("@loomii/db", () => ({
  db: {
    contextBundle: {
      findMany: mockFindMany,
    },
  },
}));

// Import after mocking
const { reviewRoutes } = await import("./reviews");

// =========================================
// Test app setup
// =========================================

function createTestApp() {
  const app = new Hono<AppEnv>();

  app.use("/*", async (c, next) => {
    c.set("tenantId", "tenant_123");
    c.set("role", "ADMIN" as any);
    c.set("requestId", "req_test");
    c.set("userId", "user_1");
    c.set("logger", { info: () => {}, warn: () => {}, error: () => {}, child: () => ({}) } as any);
    c.set("user", { id: "user_1", email: "test@example.com" } as any);
    await next();
  });

  app.route("/reviews", reviewRoutes);
  return app;
}

// =========================================
// Tests
// =========================================

describe("GET /reviews", () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    app = createTestApp();
    mockFindMany.mockClear();
  });

  it("AC1: returns 20 reviews by default", async () => {
    const res = await app.request("/reviews");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data).toBeArray();
    // findMany is called with take: 21 (limit + 1 for hasMore check)
    expect(mockFindMany).toHaveBeenCalledTimes(1);
    const callArgs = mockFindMany.mock.calls[0][0];
    expect(callArgs.take).toBe(21);
  });

  it("AC2: ?limit=5 requests exactly 5+1 items", async () => {
    const res = await app.request("/reviews?limit=5");
    expect(res.status).toBe(200);

    const callArgs = mockFindMany.mock.calls[0][0];
    expect(callArgs.take).toBe(6); // 5 + 1 for hasMore
  });

  it("AC2: limit is clamped between 1 and 100", async () => {
    await app.request("/reviews?limit=200");
    expect(mockFindMany.mock.calls[0][0].take).toBe(101); // 100 + 1

    mockFindMany.mockClear();
    await app.request("/reviews?limit=-5");
    expect(mockFindMany.mock.calls[0][0].take).toBe(2); // clamped to 1, +1 for hasMore
  });

  it("AC3: ?riskLevel=CRITICAL filters to only critical reviews", async () => {
    const res = await app.request("/reviews?riskLevel=CRITICAL");
    expect(res.status).toBe(200);

    const callArgs = mockFindMany.mock.calls[0][0];
    expect(callArgs.where.riskLevel).toEqual({ in: ["CRITICAL"] });
  });

  it("AC4: ?status=COMPLETED,FAILED filters to both statuses", async () => {
    const res = await app.request("/reviews?status=COMPLETED,FAILED");
    expect(res.status).toBe(200);

    const callArgs = mockFindMany.mock.calls[0][0];
    expect(callArgs.where.status).toEqual({ in: ["COMPLETED", "FAILED"] });
  });

  it("AC4: invalid status values are ignored", async () => {
    const res = await app.request("/reviews?status=COMPLETED,INVALID,FAILED");
    expect(res.status).toBe(200);

    const callArgs = mockFindMany.mock.calls[0][0];
    expect(callArgs.where.status).toEqual({ in: ["COMPLETED", "FAILED"] });
  });

  it("AC5: ?search=auth filters on title/summary (case-insensitive)", async () => {
    const res = await app.request("/reviews?search=auth");
    expect(res.status).toBe(200);

    const callArgs = mockFindMany.mock.calls[0][0];
    expect(callArgs.where.OR).toEqual([
      { title: { contains: "auth", mode: "insensitive" } },
      { summary: { contains: "auth", mode: "insensitive" } },
    ]);
  });

  it("AC6: cursor-based pagination passes createdAt filter", async () => {
    const cursorDate = "2026-05-20T10:00:00.000Z";
    const res = await app.request(`/reviews?cursor=${cursorDate}`);
    expect(res.status).toBe(200);

    const callArgs = mockFindMany.mock.calls[0][0];
    expect(callArgs.where.createdAt).toEqual({ lt: new Date(cursorDate) });
  });

  it("AC6: nextCursor is returned when hasMore is true", async () => {
    const res = await app.request("/reviews?limit=5");
    const body = await res.json();

    // With 50 items and limit 5, there should be more
    expect(body.hasMore).toBe(true);
    expect(body.nextCursor).toBeString();
    expect(body.nextCursor).not.toBe("");
  });

  it("AC7: hasMore is false when no more pages", async () => {
    // Request all 50 items
    const res = await app.request("/reviews?limit=100");
    const body = await res.json();

    expect(body.hasMore).toBe(false);
    expect(body.nextCursor).toBeNull();
  });

  it("AC8: empty result returns correct shape", async () => {
    // Search for something that doesn't exist
    const res = await app.request("/reviews?search=xyznonexistent");
    const body = await res.json();

    expect(body.data).toEqual([]);
    expect(body.nextCursor).toBeNull();
    expect(body.hasMore).toBe(false);
  });

  it("tenant isolation: passes tenantId to query", async () => {
    await app.request("/reviews");

    const callArgs = mockFindMany.mock.calls[0][0];
    expect(callArgs.where.tenantId).toBe("tenant_123");
  });

  it("orders by createdAt descending", async () => {
    await app.request("/reviews");

    const callArgs = mockFindMany.mock.calls[0][0];
    expect(callArgs.orderBy).toEqual({ createdAt: "desc" });
  });

  it("includes review finding count", async () => {
    await app.request("/reviews");

    const callArgs = mockFindMany.mock.calls[0][0];
    expect(callArgs.include).toEqual({
      review: {
        include: {
          _count: {
            select: { findings: true },
          },
        },
      },
    });
  });

  it("response data maps fields correctly", async () => {
    const res = await app.request("/reviews?limit=1");
    const body = await res.json();

    const item = body.data[0];
    expect(item).toHaveProperty("id");
    expect(item).toHaveProperty("eventId");
    expect(item).toHaveProperty("status");
    expect(item).toHaveProperty("riskLevel");
    expect(item).toHaveProperty("title");
    expect(item).toHaveProperty("summary");
    expect(item).toHaveProperty("findingCount");
    expect(item).toHaveProperty("createdAt");
    expect(item).toHaveProperty("updatedAt");
    expect(typeof item.findingCount).toBe("number");
    expect(typeof item.createdAt).toBe("string");
  });

  it("combines multiple filters (AND logic)", async () => {
    const res = await app.request("/reviews?status=COMPLETED&riskLevel=CRITICAL&search=auth");
    expect(res.status).toBe(200);

    const callArgs = mockFindMany.mock.calls[0][0];
    expect(callArgs.where.status).toEqual({ in: ["COMPLETED"] });
    expect(callArgs.where.riskLevel).toEqual({ in: ["CRITICAL"] });
    expect(callArgs.where.OR).toBeDefined();
  });

  it("no filters returns unfiltered (only tenantId)", async () => {
    await app.request("/reviews");

    const callArgs = mockFindMany.mock.calls[0][0];
    expect(callArgs.where).toEqual({ tenantId: "tenant_123" });
  });
});
