/**
 * Tests for Threat Model Query API.
 *
 * All external dependencies (DB, Bedrock) are mocked.
 * Tests cover:
 * - AC1: Full model returns all entities within 3s
 * - AC2: Semantic search returns auth-related threats
 * - AC3: Gaps endpoint returns only unresolved gaps
 * - AC4: History shows version changes
 * - AC5: Component detail includes related threats and data flows
 * - AC6: Tenant isolation enforced
 */
import { describe, it, expect, beforeEach, mock } from "bun:test";
import { Hono } from "hono";
import type { AppEnv } from "../../lib/types";

// =========================================
// Mock setup
// =========================================

const mockThreatModel = {
  id: "tm_123",
  tenantId: "tenant_123",
  status: "ACTIVE",
  version: 1,
  generatedAt: new Date("2026-05-18T10:00:00Z"),
  lastUpdatedAt: new Date("2026-05-18T10:00:00Z"),
  components: [
    { id: "comp_1", name: "API Server", type: "api-gateway", description: "REST API", isDeprecated: false, createdAt: new Date(), updatedAt: new Date() },
    { id: "comp_2", name: "Database", type: "database", description: "PostgreSQL", isDeprecated: false, createdAt: new Date(), updatedAt: new Date() },
  ],
  dataFlows: [
    { id: "flow_1", fromComponentId: "comp_1", toComponentId: "comp_2", description: "Queries", dataType: "PII", sensitivity: "RESTRICTED", encryption: "TLS 1.3", isDeprecated: false, createdAt: new Date(), updatedAt: new Date() },
  ],
  trustBoundaries: [
    { id: "tb_1", name: "Internet/DMZ", description: "Public boundary", fromZone: "internet", toZone: "dmz", isDeprecated: false, createdAt: new Date(), updatedAt: new Date() },
  ],
  entryPoints: [
    { id: "ep_1", name: "REST API", type: "REST API", description: "Public API", authRequired: true, authType: "JWT", rateLimited: true, isDeprecated: false, createdAt: new Date(), updatedAt: new Date() },
  ],
  assets: [
    { id: "asset_1", name: "User Credentials", type: "credentials", sensitivity: "RESTRICTED", description: "Passwords", isDeprecated: false, createdAt: new Date(), updatedAt: new Date() },
  ],
  threats: [
    { id: "threat_1", title: "JWT Token Forgery", description: "Weak signing", strideCategory: "SPOOFING", severity: "CRITICAL", likelihood: "LOW", mitigationStatus: "UNMITIGATED", isDeprecated: false, createdAt: new Date(), updatedAt: new Date() },
    { id: "threat_2", title: "SQL Injection", description: "Unvalidated input", strideCategory: "TAMPERING", severity: "HIGH", likelihood: "MEDIUM", mitigationStatus: "MITIGATED", isDeprecated: false, createdAt: new Date(), updatedAt: new Date() },
  ],
};

const mockGaps = [
  { id: "gap_1", type: "unmitigated_critical_threat", severity: "CRITICAL", description: "Critical threat unmitigated", entityType: "threat", entityId: "threat_1", createdAt: new Date("2026-05-18T10:00:00Z") },
  { id: "gap_2", type: "no_rate_limit_public_endpoint", severity: "MEDIUM", description: "No rate limit on WS", entityType: "entryPoint", entityId: "ep_2", createdAt: new Date("2026-05-18T10:01:00Z") },
];

const mockChanges = [
  { id: "ch_1", version: 2, changeType: "incremental_update", triggeredBy: "context_bundle", summary: "Added 1 component", diff: {}, createdAt: new Date("2026-05-19T12:00:00Z") },
  { id: "ch_2", version: 1, changeType: "initial_generation", triggeredBy: "system", summary: "Initial generation", diff: {}, createdAt: new Date("2026-05-18T10:00:00Z") },
];

const mockComponent = {
  id: "comp_1",
  name: "API Server",
  type: "api-gateway",
  description: "REST API",
  isDeprecated: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  threatModelId: "tm_123",
  threats: [
    { id: "threat_1", title: "JWT Forgery", strideCategory: "SPOOFING", severity: "CRITICAL", likelihood: "LOW", mitigationStatus: "UNMITIGATED" },
  ],
  outgoingDataFlows: [
    { id: "flow_1", toComponentId: "comp_2", description: "Queries", dataType: "PII", sensitivity: "RESTRICTED", encryption: "TLS 1.3" },
  ],
  incomingDataFlows: [],
};

const mockDb = {
  threatModel: {
    findUnique: mock((_args: any) => Promise.resolve(null as any)),
  },
  tmGap: {
    findMany: mock((_args: any) => Promise.resolve([] as any[])),
  },
  tmChange: {
    findMany: mock((_args: any) => Promise.resolve([] as any[])),
  },
  tmComponent: {
    findFirst: mock((_args: any) => Promise.resolve(null as any)),
  },
  tmThreat: {
    findMany: mock((_args: any) => Promise.resolve([] as any[])),
  },
};

const mockEmbed = mock(async (opts: any) => {
  // Generate input-dependent embedding so e2e "different queries → different embeddings" passes
  const value = typeof opts?.value === "string" ? opts.value : "";
  const seed = value.split("").reduce((acc: number, ch: string) => acc + ch.charCodeAt(0), 0);
  return {
    embedding: Array.from({ length: 1024 }, (_, i) => ((i + seed) % 1000) * 0.001),
    usage: { tokens: 10 },
  };
});

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

const mockVectorSearch = mock(async (_db: any, _opts: any) => [] as any[]);

mock.module("@loomii/db", () => ({
  db: mockDb,
  vectorSearch: mockVectorSearch,
  insertEmbedding: mock(),
}));

// Import after mocks
const { threatModelRoutes } = await import("./threat-model");

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

  app.route("/api/v1/threat-model", threatModelRoutes);
  return app;
}

// =========================================
// Tests
// =========================================

describe("Threat Model Query API", () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    app = createTestApp();
    mockDb.threatModel.findUnique.mockReset();
    mockDb.tmGap.findMany.mockReset();
    mockDb.tmChange.findMany.mockReset();
    mockDb.tmComponent.findFirst.mockReset();
    mockDb.tmThreat.findMany.mockReset();
    mockVectorSearch.mockReset();
    mockEmbed.mockReset();

    // Defaults
    mockDb.threatModel.findUnique.mockResolvedValue(null);
    mockDb.tmGap.findMany.mockResolvedValue([]);
    mockDb.tmChange.findMany.mockResolvedValue([]);
    mockDb.tmComponent.findFirst.mockResolvedValue(null);
    mockDb.tmThreat.findMany.mockResolvedValue([]);
    mockVectorSearch.mockResolvedValue([]);
    mockEmbed.mockImplementation(async (opts: any) => {
      const value = typeof opts?.value === "string" ? opts.value : "";
      const seed = value.split("").reduce((acc: number, ch: string) => acc + ch.charCodeAt(0), 0);
      return {
        embedding: Array.from({ length: 1024 }, (_, i) => ((i + seed) % 1000) * 0.001),
        usage: { tokens: 10 },
      };
    });
  });

  // ─── AC1: Full Model ────────────────────────────────────────────────

  describe("GET /api/v1/threat-model (Full Model)", () => {
    it("returns all entities for tenant", async () => {
      mockDb.threatModel.findUnique.mockResolvedValue(mockThreatModel);

      const res = await app.request("/api/v1/threat-model");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.model.id).toBe("tm_123");
      expect(body.model.status).toBe("ACTIVE");
      expect(body.model.version).toBe(1);
      expect(body.model.components).toHaveLength(2);
      expect(body.model.dataFlows).toHaveLength(1);
      expect(body.model.trustBoundaries).toHaveLength(1);
      expect(body.model.entryPoints).toHaveLength(1);
      expect(body.model.assets).toHaveLength(1);
      expect(body.model.threats).toHaveLength(2);
    });

    it("returns 404 when no model exists", async () => {
      mockDb.threatModel.findUnique.mockResolvedValue(null);

      const res = await app.request("/api/v1/threat-model");
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error.code).toBe("NOT_FOUND");
    });

    it("completes within SLA (mocked)", async () => {
      mockDb.threatModel.findUnique.mockResolvedValue(mockThreatModel);

      const start = Date.now();
      await app.request("/api/v1/threat-model");
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(1000);
    });

    it("excludes deprecated entities by default", async () => {
      mockDb.threatModel.findUnique.mockResolvedValue(mockThreatModel);

      await app.request("/api/v1/threat-model");

      const findCall = mockDb.threatModel.findUnique.mock.calls[0]![0] as any;
      // Check that the include has isDeprecated: false filter
      expect(findCall.include.components.where.isDeprecated).toBe(false);
      expect(findCall.include.threats.where.isDeprecated).toBe(false);
    });

    it("includes deprecated entities when param set", async () => {
      mockDb.threatModel.findUnique.mockResolvedValue(mockThreatModel);

      await app.request("/api/v1/threat-model?includeDeprecated=true");

      const findCall = mockDb.threatModel.findUnique.mock.calls[0]![0] as any;
      // Empty where = no filter
      expect(findCall.include.components.where).toEqual({});
    });
  });

  // ─── AC2: Semantic Threat Search ────────────────────────────────────

  describe("GET /api/v1/threat-model/threats (Semantic Search)", () => {
    it("returns relevant threats for query", async () => {
      // vectorSearch returns threat embeddings
      mockVectorSearch.mockResolvedValue([
        {
          id: "emb_1",
          documentId: "threat_threat_1",
          chunk: 0,
          content: "[SPOOFING] JWT Token Forgery",
          metadata: { sourceType: "threat", threatId: "threat_1" },
          similarity: 0.85,
        },
      ]);

      mockDb.tmThreat.findMany.mockResolvedValue([
        {
          id: "threat_1",
          title: "JWT Token Forgery",
          description: "Weak signing",
          strideCategory: "SPOOFING",
          severity: "CRITICAL",
          likelihood: "LOW",
        },
      ]);

      const res = await app.request(
        "/api/v1/threat-model/threats?query=authentication+tokens"
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.threats).toHaveLength(1);
      expect(body.threats[0].title).toBe("JWT Token Forgery");
      expect(body.threats[0].similarity).toBe(0.85);
      expect(body.threats[0].strideCategory).toBe("SPOOFING");
    });

    it("returns 400 for missing query", async () => {
      const res = await app.request("/api/v1/threat-model/threats");
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 for query shorter than 3 chars", async () => {
      const res = await app.request("/api/v1/threat-model/threats?query=ab");
      expect(res.status).toBe(400);
    });

    it("scopes search to tenant", async () => {
      mockVectorSearch.mockResolvedValue([]);

      await app.request(
        "/api/v1/threat-model/threats?query=authentication&limit=5"
      );

      expect(mockVectorSearch).toHaveBeenCalledTimes(1);
      const opts = mockVectorSearch.mock.calls[0]![1] as any;
      expect(opts.tenantId).toBe("tenant_123");
    });
  });

  // ─── AC3: Gaps ──────────────────────────────────────────────────────

  describe("GET /api/v1/threat-model/gaps", () => {
    it("returns only unresolved gaps sorted by severity", async () => {
      mockDb.threatModel.findUnique.mockResolvedValue({ id: "tm_123" });
      mockDb.tmGap.findMany.mockResolvedValue(mockGaps);

      const res = await app.request("/api/v1/threat-model/gaps");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.gaps).toHaveLength(2);
      expect(body.count).toBe(2);

      // CRITICAL should come before MEDIUM
      expect(body.gaps[0].severity).toBe("CRITICAL");
      expect(body.gaps[1].severity).toBe("MEDIUM");
    });

    it("returns 404 when no model exists", async () => {
      mockDb.threatModel.findUnique.mockResolvedValue(null);

      const res = await app.request("/api/v1/threat-model/gaps");
      expect(res.status).toBe(404);
    });

    it("queries with isResolved: false", async () => {
      mockDb.threatModel.findUnique.mockResolvedValue({ id: "tm_123" });
      mockDb.tmGap.findMany.mockResolvedValue([]);

      await app.request("/api/v1/threat-model/gaps");

      const findCall = mockDb.tmGap.findMany.mock.calls[0]![0] as any;
      expect(findCall.where.isResolved).toBe(false);
      expect(findCall.where.threatModelId).toBe("tm_123");
    });
  });

  // ─── AC4: History ───────────────────────────────────────────────────

  describe("GET /api/v1/threat-model/history", () => {
    it("returns version changes ordered by version desc", async () => {
      mockDb.threatModel.findUnique.mockResolvedValue({ id: "tm_123" });
      mockDb.tmChange.findMany.mockResolvedValue(mockChanges);

      const res = await app.request("/api/v1/threat-model/history");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.changes).toHaveLength(2);
      expect(body.changes[0].version).toBe(2); // Most recent first
      expect(body.changes[1].version).toBe(1);
      expect(body.changes[0].changeType).toBe("incremental_update");
      expect(body.changes[1].triggeredBy).toBe("system");
    });

    it("returns 404 when no model exists", async () => {
      mockDb.threatModel.findUnique.mockResolvedValue(null);

      const res = await app.request("/api/v1/threat-model/history");
      expect(res.status).toBe(404);
    });

    it("queries ordered by version desc", async () => {
      mockDb.threatModel.findUnique.mockResolvedValue({ id: "tm_123" });
      mockDb.tmChange.findMany.mockResolvedValue([]);

      await app.request("/api/v1/threat-model/history");

      const findCall = mockDb.tmChange.findMany.mock.calls[0]![0] as any;
      expect(findCall.orderBy.version).toBe("desc");
    });
  });

  // ─── AC5: Component Detail ──────────────────────────────────────────

  describe("GET /api/v1/threat-model/components/:id", () => {
    it("returns component with related threats and data flows", async () => {
      mockDb.tmComponent.findFirst.mockResolvedValue(mockComponent);

      const res = await app.request(
        "/api/v1/threat-model/components/comp_1"
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.component.id).toBe("comp_1");
      expect(body.component.name).toBe("API Server");
      expect(body.component.threats).toHaveLength(1);
      expect(body.component.threats[0].title).toBe("JWT Forgery");
      expect(body.component.dataFlowsFrom).toHaveLength(1);
      expect(body.component.dataFlowsTo).toHaveLength(0);
    });

    it("returns 404 for non-existent component", async () => {
      mockDb.tmComponent.findFirst.mockResolvedValue(null);

      const res = await app.request(
        "/api/v1/threat-model/components/comp_nonexistent"
      );
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error.code).toBe("NOT_FOUND");
    });

    it("scopes query to tenant via threatModel relation", async () => {
      mockDb.tmComponent.findFirst.mockResolvedValue(null);

      await app.request("/api/v1/threat-model/components/comp_1");

      const findCall = mockDb.tmComponent.findFirst.mock.calls[0]![0] as any;
      expect(findCall.where.id).toBe("comp_1");
      expect(findCall.where.threatModel.tenantId).toBe("tenant_123");
    });
  });

  // ─── AC6: Tenant Isolation ──────────────────────────────────────────

  describe("Tenant Isolation", () => {
    it("tenant A cannot see tenant B model", async () => {
      // App for tenant_B
      const appB = createTestApp("tenant_B");
      mockDb.threatModel.findUnique.mockResolvedValue(null); // No model for tenant_B

      const res = await appB.request("/api/v1/threat-model");
      expect(res.status).toBe(404);

      // Verify query was scoped to tenant_B
      const findCall = mockDb.threatModel.findUnique.mock.calls[0]![0] as any;
      expect(findCall.where.tenantId).toBe("tenant_B");
    });

    it("component query scoped to tenant", async () => {
      const appB = createTestApp("tenant_B");
      mockDb.tmComponent.findFirst.mockResolvedValue(null);

      const res = await appB.request(
        "/api/v1/threat-model/components/comp_1"
      );
      expect(res.status).toBe(404);

      const findCall = mockDb.tmComponent.findFirst.mock.calls[0]![0] as any;
      expect(findCall.where.threatModel.tenantId).toBe("tenant_B");
    });

    it("semantic search scoped to tenant", async () => {
      const appB = createTestApp("tenant_B");
      mockVectorSearch.mockResolvedValue([]);

      await appB.request(
        "/api/v1/threat-model/threats?query=authentication"
      );

      const opts = mockVectorSearch.mock.calls[0]![1] as any;
      expect(opts.tenantId).toBe("tenant_B");
    });
  });
});
