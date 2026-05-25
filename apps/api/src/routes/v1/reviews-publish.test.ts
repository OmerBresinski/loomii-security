/**
 * Tests for review publish/confirm-publish endpoints.
 * All external dependencies (DB, LLM, queues, comment poster) are mocked.
 */
import { describe, it, expect, beforeEach, mock } from "bun:test";
import { Hono } from "hono";
import type { AppEnv } from "../../lib/types";
import { reviewRoutes } from "./reviews";

// =========================================
// Mock setup
// =========================================

const mockReviewFindFirst = mock((_args: unknown) => Promise.resolve(null as unknown));
const mockReviewUpdate = mock((_args: unknown) => Promise.resolve({} as unknown));
const mockFindingUpdateMany = mock((_args: unknown) => Promise.resolve({ count: 0 }));
const mockContextBundleFindUnique = mock((_args: unknown) => Promise.resolve(null as unknown));
const mockContextBundleFindMany = mock((_args: unknown) => Promise.resolve([]));

mock.module("@loomii/db", () => ({
  db: {
    review: {
      findFirst: mockReviewFindFirst,
      update: mockReviewUpdate,
    },
    finding: {
      updateMany: mockFindingUpdateMany,
    },
    contextBundle: {
      findUnique: mockContextBundleFindUnique,
      findMany: mockContextBundleFindMany,
    },
    integration: {
      findFirst: mock((_args: unknown) => Promise.resolve(null)),
    },
  },
}));

const mockSummaryQueueAdd = mock((_name: string, _payload: unknown, _opts?: unknown) =>
  Promise.resolve({ id: "job_1" })
);
const mockThreatModelQueueAdd = mock((_name: string, _payload: unknown, _opts?: unknown) =>
  Promise.resolve({ id: "job_2" })
);
const mockEventsQueueAdd = mock((_name: string, _payload: unknown, _opts?: unknown) =>
  Promise.resolve({ id: "job_3" })
);

mock.module("@loomii/queue", () => ({
  summaryGenerationQueue: { add: mockSummaryQueueAdd },
  threatModelQueue: { add: mockThreatModelQueueAdd },
  eventsQueue: { add: mockEventsQueueAdd },
  contextAssemblyQueue: { add: mock() },
  reviewQueue: { add: mock() },
  QUEUE_NAMES: {},
  ALL_QUEUE_NAMES: [],
}));

const mockGenerateReviewComment = mock((_findings: unknown, _reviewId: string) =>
  Promise.resolve("Security Review — 2 findings:\n• Finding A (High)\n• Finding B (Medium)\n\nView full details → https://app.loomii.ai/reviews?review=review_1")
);

mock.module("../../lib/comment-generator", () => ({
  generateReviewComment: mockGenerateReviewComment,
}));

const mockGetCommentTargets = mock((_tenantId: string, _bundleId: string) =>
  Promise.resolve([{ sourceType: "LINEAR", sourceId: "LIN-123", sourceTitle: "Auth Flow" }])
);
const mockPostCommentToSources = mock((_tenantId: string, _targets: unknown, _text: string) =>
  Promise.resolve([{ sourceId: "LIN-123", success: true } as { sourceId: string; success: boolean; error?: string }])
);

mock.module("../../lib/comment-poster", () => ({
  getCommentTargets: mockGetCommentTargets,
  postCommentToSources: mockPostCommentToSources,
}));

mock.module("@loomii/shared", () => ({
  encrypt: (text: string) => `encrypted:${text}`,
  decrypt: (text: string) => text.replace("encrypted:", ""),
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

  app.route("/api/v1/reviews", reviewRoutes);
  return app;
}

// =========================================
// Tests
// =========================================

describe("POST /api/v1/reviews/:id/publish", () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    app = createTestApp();
    mockReviewFindFirst.mockReset();
    mockReviewUpdate.mockReset();
    mockGenerateReviewComment.mockReset();
    mockGetCommentTargets.mockReset();
    mockGenerateReviewComment.mockResolvedValue(
      "Security Review — 2 findings:\n• Test Finding (High)"
    );
    mockGetCommentTargets.mockResolvedValue([
      { sourceType: "LINEAR", sourceId: "LIN-123", sourceTitle: "Auth Flow" },
    ]);
  });

  it("generates comment for READY review", async () => {
    mockReviewFindFirst.mockResolvedValueOnce({
      id: "review_1",
      status: "READY",
      contextBundleId: "bundle_1",
      findings: [
        { title: "Missing CSRF", severity: "HIGH" },
        { title: "Info Disclosure", severity: "MEDIUM" },
      ],
    });
    mockReviewUpdate.mockResolvedValueOnce({});

    const res = await app.request("/api/v1/reviews/review_1/publish", {
      method: "POST",
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.commentText).toContain("Security Review");
    expect(body.targets).toHaveLength(1);
    expect(body.findingsCount).toBe(2);
  });

  it("returns 400 for non-READY review", async () => {
    mockReviewFindFirst.mockResolvedValueOnce({
      id: "review_1",
      status: "PUBLISHED",
      contextBundleId: "bundle_1",
      findings: [],
    });

    const res = await app.request("/api/v1/reviews/review_1/publish", {
      method: "POST",
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_STATE");
  });

  it("returns 400 when all findings dismissed", async () => {
    mockReviewFindFirst.mockResolvedValueOnce({
      id: "review_1",
      status: "READY",
      contextBundleId: "bundle_1",
      findings: [], // All dismissed = empty after filter
    });

    const res = await app.request("/api/v1/reviews/review_1/publish", {
      method: "POST",
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_STATE");
    expect(body.error.message).toContain("No findings");
  });

  it("returns 404 for review not found", async () => {
    mockReviewFindFirst.mockResolvedValueOnce(null);

    const res = await app.request("/api/v1/reviews/nonexistent/publish", {
      method: "POST",
    });

    expect(res.status).toBe(404);
  });
});

describe("POST /api/v1/reviews/:id/confirm-publish", () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    app = createTestApp();
    mockReviewFindFirst.mockReset();
    mockReviewUpdate.mockReset();
    mockFindingUpdateMany.mockReset();
    mockGetCommentTargets.mockReset();
    mockPostCommentToSources.mockReset();
    mockSummaryQueueAdd.mockReset();
    mockThreatModelQueueAdd.mockReset();
    mockEventsQueueAdd.mockReset();
    mockGetCommentTargets.mockResolvedValue([
      { sourceType: "LINEAR", sourceId: "LIN-123", sourceTitle: "Auth Flow" },
    ]);
    mockPostCommentToSources.mockResolvedValue([
      { sourceId: "LIN-123", success: true },
    ]);
  });

  it("bulk confirms non-dismissed findings and sets PUBLISHED", async () => {
    mockReviewFindFirst.mockResolvedValueOnce({
      id: "review_1",
      status: "READY",
      commentText: "Security Review — 2 findings...",
      contextBundleId: "bundle_1",
      contextBundle: { projectId: "project_1" },
    });
    mockFindingUpdateMany.mockResolvedValueOnce({ count: 3 });
    mockReviewUpdate.mockResolvedValueOnce({});

    const res = await app.request("/api/v1/reviews/review_1/confirm-publish", {
      method: "POST",
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("PUBLISHED");
    expect(body.findingsConfirmed).toBe(3);
    expect(body.commentPostedTo).toContain("LIN-123");
  });

  it("enqueues summary-generation and threat-model-update jobs", async () => {
    mockReviewFindFirst.mockResolvedValueOnce({
      id: "review_1",
      status: "READY",
      commentText: "Comment text",
      contextBundleId: "bundle_1",
      contextBundle: { projectId: "project_1" },
    });
    mockFindingUpdateMany.mockResolvedValueOnce({ count: 2 });
    mockReviewUpdate.mockResolvedValueOnce({});

    await app.request("/api/v1/reviews/review_1/confirm-publish", {
      method: "POST",
    });

    expect(mockSummaryQueueAdd).toHaveBeenCalledTimes(1);
    expect(mockThreatModelQueueAdd).toHaveBeenCalledTimes(1);
    expect(mockEventsQueueAdd).toHaveBeenCalledTimes(1);
  });

  it("returns 400 when /publish not called first (no commentText)", async () => {
    mockReviewFindFirst.mockResolvedValueOnce({
      id: "review_1",
      status: "READY",
      commentText: null, // Not generated yet
      contextBundleId: "bundle_1",
      contextBundle: { projectId: "project_1" },
    });

    const res = await app.request("/api/v1/reviews/review_1/confirm-publish", {
      method: "POST",
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_STATE");
  });

  it("handles external posting failure gracefully", async () => {
    mockReviewFindFirst.mockResolvedValueOnce({
      id: "review_1",
      status: "READY",
      commentText: "Comment text",
      contextBundleId: "bundle_1",
      contextBundle: { projectId: "project_1" },
    });
    mockFindingUpdateMany.mockResolvedValueOnce({ count: 2 });
    mockReviewUpdate.mockResolvedValueOnce({});
    // Posting fails for this source
    mockPostCommentToSources.mockResolvedValueOnce([
      { sourceId: "LIN-123", success: false, error: "Token expired" },
    ]);

    const res = await app.request("/api/v1/reviews/review_1/confirm-publish", {
      method: "POST",
    });

    // Should still succeed — graceful degradation
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("PUBLISHED");
    expect(body.commentPostedTo).toHaveLength(0); // None succeeded
  });
});
