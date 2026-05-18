/**
 * Tests for Semantic Search Route and Library.
 *
 * All external dependencies (Bedrock API, DB) are mocked.
 * Tests cover:
 * - Returns relevant results for query (AC1)
 * - Results scoped to tenant (AC3)
 * - Respects limit parameter
 * - Validates query length
 * - Returns empty array for no matches (AC4)
 * - Includes similarity scores (AC2)
 */
import { describe, it, expect, beforeEach, mock } from "bun:test";
import { Hono } from "hono";
import type { AppEnv } from "../../lib/types";

// =========================================
// Mock setup
// =========================================

// Mock vector for consistent testing (1024 dimensions)
const mockQueryVector = Array.from({ length: 1024 }, (_, i) => i * 0.001);

const mockEmbed = mock(async (_opts: any) => ({
  embedding: mockQueryVector,
  usage: { tokens: 10 },
}));

mock.module("ai", () => ({
  embed: mockEmbed,
  embedMany: mock(),
}));

mock.module("@ai-sdk/amazon-bedrock", () => ({
  createAmazonBedrock: () => {
    const provider = (modelId: string) => ({ modelId });
    provider.embeddingModel = (modelId: string) => ({ modelId, type: "embedding" });
    provider.embedding = provider.embeddingModel;
    return provider;
  },
}));

// Mock search results for different scenarios
const mockSearchResults = [
  {
    id: "emb_1",
    documentId: "doc_123",
    chunk: 0,
    content: "OAuth2 authentication flow uses PKCE for mobile clients",
    metadata: { sourceType: "linear_ticket", sourceId: "LOO-100" },
    similarity: 0.89,
  },
  {
    id: "emb_2",
    documentId: "doc_123",
    chunk: 1,
    content: "Session management relies on httpOnly cookies with secure flag",
    metadata: { sourceType: "linear_ticket", sourceId: "LOO-100" },
    similarity: 0.72,
  },
  {
    id: "emb_3",
    documentId: "doc_456",
    chunk: 0,
    content: "JWT tokens should use short expiry times for security",
    metadata: { sourceType: "notion_page", sourceId: "page_xyz" },
    similarity: 0.65,
  },
];

const mockVectorSearch = mock(async (_db: any, opts: any) => {
  // Return results only for tenant_123 (simulates tenant isolation)
  if (opts.tenantId !== "tenant_123") {
    return [];
  }
  return mockSearchResults.slice(0, opts.limit ?? 10);
});

mock.module("@loomii/db", () => ({
  db: {},
  vectorSearch: mockVectorSearch,
  insertEmbedding: mock(),
}));

// Import after mocking
const { searchRoutes } = await import("./search");

// =========================================
// Test app setup
// =========================================

function createTestApp(tenantId = "tenant_123") {
  const app = new Hono<AppEnv>();

  // Simulate auth middleware
  app.use("*", async (c, next) => {
    c.set("tenantId", tenantId);
    c.set("userId", "user_123");
    c.set("requestId", "req_test_123");
    c.set("logger", {
      info: mock(),
      warn: mock(),
      error: mock(),
      debug: mock(),
      child: mock(() => ({
        info: mock(),
        warn: mock(),
        error: mock(),
        debug: mock(),
      })),
    } as any);
    c.set("user", { id: "user_123", email: "test@test.com" } as any);
    c.set("role", "ADMIN" as any);
    await next();
  });

  app.route("/api/v1/search", searchRoutes);
  return app;
}

// =========================================
// Tests
// =========================================

describe("Semantic Search", () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    app = createTestApp();
    mockEmbed.mockClear();
    mockVectorSearch.mockClear();
  });

  describe("GET /api/v1/search", () => {
    it("returns relevant results for query", async () => {
      const res = await app.request("/api/v1/search?query=authentication+flow");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.results).toHaveLength(3);
      expect(body.results[0].content).toContain("OAuth2 authentication");
      expect(body.query).toBe("authentication flow");
      expect(body.count).toBe(3);
    });

    it("results include similarity score in 0-1 range (AC2)", async () => {
      const res = await app.request("/api/v1/search?query=authentication+flow");
      const body = await res.json();

      for (const result of body.results) {
        expect(result.similarity).toBeGreaterThan(0);
        expect(result.similarity).toBeLessThanOrEqual(1);
      }

      // Results should be ordered by similarity (highest first)
      expect(body.results[0].similarity).toBeGreaterThanOrEqual(body.results[1].similarity);
    });

    it("results scoped to tenant (AC3)", async () => {
      // Request with tenant_123 -> gets results
      const res1 = await app.request("/api/v1/search?query=authentication+flow");
      const body1 = await res1.json();
      expect(body1.results.length).toBeGreaterThan(0);

      // Request with different tenant -> gets no results
      const otherApp = createTestApp("tenant_other");
      const res2 = await otherApp.request("/api/v1/search?query=authentication+flow");
      const body2 = await res2.json();
      expect(body2.results).toHaveLength(0);
    });

    it("passes tenantId to vectorSearch", async () => {
      await app.request("/api/v1/search?query=authentication+flow");

      expect(mockVectorSearch).toHaveBeenCalled();
      const callArgs = mockVectorSearch.mock.calls[0];
      expect(callArgs[1].tenantId).toBe("tenant_123");
    });

    it("generates embedding for query text", async () => {
      await app.request("/api/v1/search?query=test+query");

      expect(mockEmbed).toHaveBeenCalled();
      const callArgs = mockEmbed.mock.calls[0][0];
      expect(callArgs.value).toBe("test query");
    });

    it("respects limit parameter", async () => {
      const res = await app.request("/api/v1/search?query=authentication&limit=2");
      const body = await res.json();

      expect(mockVectorSearch).toHaveBeenCalled();
      const callArgs = mockVectorSearch.mock.calls[0];
      expect(callArgs[1].limit).toBe(2);
    });

    it("uses default limit of 10 when not specified", async () => {
      await app.request("/api/v1/search?query=authentication+flow");

      const callArgs = mockVectorSearch.mock.calls[0];
      expect(callArgs[1].limit).toBe(10);
    });

    it("returns empty array for no matches (AC4)", async () => {
      // Use a tenant with no embeddings
      const emptyApp = createTestApp("tenant_empty");
      const res = await emptyApp.request("/api/v1/search?query=anything+at+all");

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.results).toHaveLength(0);
      expect(body.count).toBe(0);
    });

    it("includes durationMs in response", async () => {
      const res = await app.request("/api/v1/search?query=authentication+flow");
      const body = await res.json();

      expect(body.durationMs).toBeDefined();
      expect(typeof body.durationMs).toBe("number");
      expect(body.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("includes metadata in results", async () => {
      const res = await app.request("/api/v1/search?query=authentication+flow");
      const body = await res.json();

      expect(body.results[0].metadata).toEqual({
        sourceType: "linear_ticket",
        sourceId: "LOO-100",
      });
    });
  });

  describe("Query validation", () => {
    it("returns 400 for missing query", async () => {
      const res = await app.request("/api/v1/search");
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.message).toContain("required");
    });

    it("returns 400 for query shorter than 3 chars", async () => {
      const res = await app.request("/api/v1/search?query=ab");
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.message).toContain("at least 3");
    });

    it("returns 400 for query longer than 500 chars", async () => {
      const longQuery = "a".repeat(501);
      const res = await app.request(`/api/v1/search?query=${longQuery}`);
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.message).toContain("at most 500");
    });

    it("accepts query at minimum length (3 chars)", async () => {
      const res = await app.request("/api/v1/search?query=abc");
      expect(res.status).toBe(200);
    });

    it("accepts query at maximum length (500 chars)", async () => {
      const maxQuery = "a".repeat(500);
      const res = await app.request(`/api/v1/search?query=${maxQuery}`);
      expect(res.status).toBe(200);
    });
  });

  describe("Limit validation", () => {
    it("returns 400 for limit less than 1", async () => {
      const res = await app.request("/api/v1/search?query=test+query&limit=0");
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.message).toContain("between 1 and 50");
    });

    it("returns 400 for limit greater than 50", async () => {
      const res = await app.request("/api/v1/search?query=test+query&limit=51");
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 for non-numeric limit", async () => {
      const res = await app.request("/api/v1/search?query=test+query&limit=abc");
      expect(res.status).toBe(400);
    });

    it("accepts valid limit values", async () => {
      const res = await app.request("/api/v1/search?query=test+query&limit=25");
      expect(res.status).toBe(200);
    });
  });

  describe("Threshold validation", () => {
    it("returns 400 for threshold less than 0", async () => {
      const res = await app.request("/api/v1/search?query=test+query&threshold=-0.1");
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.message).toContain("between 0 and 1");
    });

    it("returns 400 for threshold greater than 1", async () => {
      const res = await app.request("/api/v1/search?query=test+query&threshold=1.5");
      expect(res.status).toBe(400);
    });

    it("passes threshold to vectorSearch", async () => {
      await app.request("/api/v1/search?query=test+query&threshold=0.7");

      const callArgs = mockVectorSearch.mock.calls[0];
      expect(callArgs[1].threshold).toBe(0.7);
    });
  });

  describe("Error response format", () => {
    it("includes requestId in error responses", async () => {
      const res = await app.request("/api/v1/search");
      const body = await res.json();

      expect(body.error.requestId).toBe("req_test_123");
    });
  });
});
