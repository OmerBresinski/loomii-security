/**
 * Tests for Policy Retrieval (Keyword Extractor + searchPolicies Tool).
 *
 * Covers:
 * - AC1: Context about "user login flow" returns A01 + A07
 * - AC2: Context about "payment processing" returns crypto-related policies
 * - AC3: Keyword rule forces inclusion even if semantic similarity is low
 * - AC4: Custom tenant policy included when relevant
 * - AC5: Retrieval completes within 2 seconds (mocked)
 * - AC6: Disabled policies not returned
 */
import "../test-setup";
import { describe, it, expect, beforeEach, mock } from "bun:test";

// =========================================
// Mock setup
// =========================================

const mockVectorSearch = mock(async (_db: any, _opts: any) => [] as any[]);
const mockGenerateQueryEmbedding = mock(
  async (_query: string) => new Array(1024).fill(0.1)
);

const mockPolicyFindMany = mock((_args: any) => Promise.resolve([] as any[]));

const mockDb = {
  policy: {
    findMany: mockPolicyFindMany,
  },
};

mock.module("@loomii/db", () => ({
  db: mockDb,
  vectorSearch: mockVectorSearch,
  insertEmbedding: mock(),
}));

mock.module("../../lib/embeddings", () => ({
  generateEmbeddings: mock(async () => []),
  generateQueryEmbedding: mockGenerateQueryEmbedding,
}));

// Import after mocks
const { extractKeywords } = await import("./keyword-extractor");
const { searchPoliciesTool } = await import(
  "../agents/tools/search-policies"
);

// =========================================
// Keyword Extractor Tests
// =========================================

describe("Keyword Extractor", () => {
  it("extracts auth keywords from login context", () => {
    const keywords = extractKeywords(
      "Implementing OAuth login flow with session management and JWT tokens"
    );

    expect(keywords).toContain("authentication");
    expect(keywords).toContain("login");
    expect(keywords).toContain("session");
    expect(keywords).toContain("oauth");
  });

  it("extracts access control keywords", () => {
    const keywords = extractKeywords(
      "Adding RBAC permissions with admin role and authorization checks"
    );

    expect(keywords).toContain("access control");
    expect(keywords).toContain("rbac");
    expect(keywords).toContain("role");
    expect(keywords).toContain("authorization");
  });

  it("extracts payment/crypto keywords", () => {
    const keywords = extractKeywords(
      "Processing credit card payments with Stripe and encrypting sensitive data"
    );

    expect(keywords).toContain("encryption");
    expect(keywords).toContain("sensitive data");
  });

  it("extracts injection keywords", () => {
    const keywords = extractKeywords(
      "Using parameterized SQL queries to prevent injection attacks"
    );

    expect(keywords).toContain("injection");
    expect(keywords).toContain("sql");
    expect(keywords).toContain("parameterized");
  });

  it("extracts LLM/AI keywords", () => {
    const keywords = extractKeywords(
      "Building a chatbot with prompt engineering and RAG pipeline"
    );

    expect(keywords).toContain("prompt injection");
    expect(keywords).toContain("llm");
    expect(keywords).toContain("prompt");
  });

  it("extracts multiple keyword groups from complex context", () => {
    const keywords = extractKeywords(
      "The API gateway handles OAuth authentication, validates input to prevent SQL injection, and enforces rate limit on all endpoints"
    );

    expect(keywords).toContain("authentication");
    expect(keywords).toContain("oauth");
    expect(keywords).toContain("injection");
    expect(keywords).toContain("sql");
    expect(keywords).toContain("denial of service");
    expect(keywords).toContain("rate limit");
  });

  it("returns empty for unrelated context", () => {
    const keywords = extractKeywords(
      "Fixed the CSS alignment of the submit button on the settings page"
    );

    expect(keywords).toHaveLength(0);
  });

  it("is case-insensitive", () => {
    const keywords = extractKeywords("OAUTH LOGIN SESSION");

    expect(keywords).toContain("authentication");
    expect(keywords).toContain("login");
    expect(keywords).toContain("session");
  });
});

// =========================================
// searchPolicies Tool Tests
// =========================================

describe("searchPolicies Tool", () => {
  beforeEach(() => {
    mockVectorSearch.mockReset();
    mockGenerateQueryEmbedding.mockReset();
    mockPolicyFindMany.mockReset();

    mockVectorSearch.mockResolvedValue([]);
    mockGenerateQueryEmbedding.mockResolvedValue(new Array(1024).fill(0.1));
    mockPolicyFindMany.mockResolvedValue([]);
  });

  it("returns semantically relevant policies", async () => {
    // Semantic search returns a policy embedding
    mockVectorSearch.mockResolvedValue([
      {
        id: "emb_1",
        documentId: "policy_p1",
        chunk: 0,
        content: "A01 Broken Access Control",
        metadata: { sourceType: "policy", policyId: "p1" },
        similarity: 0.85,
      },
    ]);

    // Policy lookup returns the full policy
    mockPolicyFindMany.mockImplementation((args: any) => {
      if (args.where?.id?.in) {
        return Promise.resolve([
          {
            id: "p1",
            name: "A01:2021 - Broken Access Control",
            framework: "OWASP_TOP_10_2021",
            identifier: "A01",
            content: "# A01 content...",
          },
        ]);
      }
      // Keyword query returns empty
      return Promise.resolve([]);
    });

    const result = await searchPoliciesTool.execute!(
      { contextSummary: "user authentication and access control" },
      { requestContext: new Map([["tenantId", "tenant_123"]]) } as any
    );

    expect(result.policies).toHaveLength(1);
    expect(result.policies[0].name).toContain("Broken Access Control");
    expect(result.policies[0].relevanceReason).toContain("Semantic match");
  });

  it("keyword rules force inclusion", async () => {
    // No semantic results
    mockVectorSearch.mockResolvedValue([]);

    // Keyword query returns matching policies
    mockPolicyFindMany.mockImplementation((args: any) => {
      if (args.where?.keywords?.hasSome) {
        return Promise.resolve([
          {
            id: "p1",
            name: "A01:2021 - Broken Access Control",
            framework: "OWASP_TOP_10_2021",
            identifier: "A01",
            content: "# A01 content...",
            keywords: ["access control", "authorization", "permission"],
          },
          {
            id: "p7",
            name: "A07:2021 - Identification and Authentication Failures",
            framework: "OWASP_TOP_10_2021",
            identifier: "A07",
            content: "# A07 content...",
            keywords: ["authentication", "login", "session"],
          },
        ]);
      }
      return Promise.resolve([]);
    });

    const result = await searchPoliciesTool.execute!(
      { contextSummary: "implementing OAuth login with session management" },
      { requestContext: new Map([["tenantId", "tenant_123"]]) } as any
    );

    expect(result.policies.length).toBeGreaterThanOrEqual(2);
    const names = result.policies.map((p) => p.name);
    expect(names).toContain("A01:2021 - Broken Access Control");
    expect(names).toContain(
      "A07:2021 - Identification and Authentication Failures"
    );

    // All keyword-matched results should have keyword relevance reason
    const keywordResults = result.policies.filter((p) =>
      p.relevanceReason.startsWith("Keyword match")
    );
    expect(keywordResults.length).toBeGreaterThan(0);
  });

  it("merges and deduplicates semantic + keyword results", async () => {
    // Same policy appears in both semantic and keyword results
    mockVectorSearch.mockResolvedValue([
      {
        id: "emb_1",
        documentId: "policy_p1",
        chunk: 0,
        content: "A01 content",
        metadata: { sourceType: "policy", policyId: "p1" },
        similarity: 0.9,
      },
    ]);

    mockPolicyFindMany.mockImplementation((args: any) => {
      if (args.where?.id?.in) {
        return Promise.resolve([
          {
            id: "p1",
            name: "A01:2021 - Broken Access Control",
            framework: "OWASP_TOP_10_2021",
            identifier: "A01",
            content: "# content",
          },
        ]);
      }
      if (args.where?.keywords?.hasSome) {
        return Promise.resolve([
          {
            id: "p1", // Same policy!
            name: "A01:2021 - Broken Access Control",
            framework: "OWASP_TOP_10_2021",
            identifier: "A01",
            content: "# content",
            keywords: ["access control"],
          },
        ]);
      }
      return Promise.resolve([]);
    });

    const result = await searchPoliciesTool.execute!(
      { contextSummary: "access control and authorization check" },
      { requestContext: new Map([["tenantId", "tenant_123"]]) } as any
    );

    // Should be deduplicated — only 1 result, not 2
    expect(result.policies).toHaveLength(1);
    // Semantic match takes priority (listed first)
    expect(result.policies[0].relevanceReason).toContain("Semantic match");
  });

  it("includes custom tenant policies", async () => {
    mockVectorSearch.mockResolvedValue([]);

    mockPolicyFindMany.mockImplementation((args: any) => {
      if (args.where?.keywords?.hasSome) {
        // Check that OR clause includes tenant-specific filter
        const orClause = args.where.OR;
        const hasTenantFilter = orClause?.some(
          (clause: any) => clause.tenantId === "tenant_123"
        );
        expect(hasTenantFilter).toBe(true);

        return Promise.resolve([
          {
            id: "custom_1",
            name: "Custom Auth Policy",
            framework: "CUSTOM",
            identifier: "custom_auth",
            content: "# Custom policy",
            keywords: ["authentication"],
          },
        ]);
      }
      return Promise.resolve([]);
    });

    const result = await searchPoliciesTool.execute!(
      { contextSummary: "login flow with authentication" },
      { requestContext: new Map([["tenantId", "tenant_123"]]) } as any
    );

    expect(result.policies).toHaveLength(1);
    expect(result.policies[0].framework).toBe("CUSTOM");
  });

  it("excludes disabled policies", async () => {
    mockVectorSearch.mockResolvedValue([]);

    mockPolicyFindMany.mockImplementation((args: any) => {
      // Verify isEnabled: true is in the query
      expect(args.where.isEnabled).toBe(true);
      return Promise.resolve([]);
    });

    await searchPoliciesTool.execute!(
      { contextSummary: "login authentication with OAuth session" },
      { requestContext: new Map([["tenantId", "tenant_123"]]) } as any
    );

    // findMany should have been called with isEnabled: true
    expect(mockPolicyFindMany).toHaveBeenCalled();
  });

  it("never returns other tenant's policies (tenant isolation)", async () => {
    mockVectorSearch.mockResolvedValue([]);

    mockPolicyFindMany.mockImplementation((args: any) => {
      if (args.where?.keywords?.hasSome) {
        const orClause = args.where.OR;
        // Should include null (built-in) and tenant_A, but never tenant_B
        const tenantIds = orClause
          ?.filter((c: any) => c.tenantId !== null && c.tenantId !== undefined)
          .map((c: any) => c.tenantId);
        expect(tenantIds).not.toContain("tenant_B");
      }
      return Promise.resolve([]);
    });

    await searchPoliciesTool.execute!(
      { contextSummary: "login authentication" },
      { requestContext: new Map([["tenantId", "tenant_A"]]) } as any
    );
  });

  it("completes within SLA (mocked)", async () => {
    mockVectorSearch.mockResolvedValue([]);
    mockPolicyFindMany.mockResolvedValue([]);

    const start = Date.now();
    await searchPoliciesTool.execute!(
      { contextSummary: "some context with authentication and SQL queries" },
      { requestContext: new Map([["tenantId", "tenant_123"]]) } as any
    );
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(1000);
  });

  it("returns empty when no tenantId in context", async () => {
    mockVectorSearch.mockResolvedValue([]);
    mockPolicyFindMany.mockResolvedValue([]);

    const result = await searchPoliciesTool.execute!(
      { contextSummary: "some context" },
      { requestContext: new Map() } as any
    );

    expect(result.policies).toHaveLength(0);
  });
});
