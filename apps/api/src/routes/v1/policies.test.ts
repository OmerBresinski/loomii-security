/**
 * Tests for Policy API
 *
 * Tests cover:
 * - AC1: Upload content -> policy created, embeddings enqueued
 * - AC2: List returns built-in + custom for tenant
 * - AC3: Disable policy -> updated
 * - AC4: Delete built-in -> 403
 * - AC5: Delete custom -> success, embeddings cleaned up
 * - AC6: Developer attempts upload -> 403
 */
import { describe, it, expect, beforeEach, mock } from "bun:test";
import { Hono } from "hono";
import type { AppEnv } from "../../lib/types";

// =========================================
// Mock setup
// =========================================

const mockPolicyCreate = mock(async (args: any) => ({
  id: "policy_new",
  name: args.data.name,
  framework: args.data.framework,
  identifier: args.data.identifier,
  keywords: args.data.keywords,
  isEnabled: true,
  isBuiltIn: false,
  createdAt: new Date(),
}));

const mockPolicyFindMany = mock(async (_args?: any) => [] as any[]);
const mockPolicyFindFirst = mock(async (_args?: any) => null as any);
const mockPolicyFindUnique = mock(async (_args?: any) => null as any);
const mockPolicyOverrideUpsert = mock(async (_args?: any) => ({} as any));
const mockPolicyOverrideFindMany = mock(async (_args?: any) => [] as any[]);
const mockPolicyOverrideDeleteMany = mock(async (_args?: any) => ({ count: 0 }));
const mockPolicyUpdate = mock(async (_args?: any) => ({
  id: "policy_updated",
  name: "Updated Policy",
  framework: "CUSTOM",
  identifier: "custom_abc",
  keywords: [] as string[],
  isEnabled: true,
  isBuiltIn: false,
  createdAt: new Date(),
  updatedAt: new Date(),
}));
const mockPolicyDelete = mock(async (_args?: any) => ({} as any));
const mockEmbeddingDeleteMany = mock(async (_args?: any) => ({ count: 0 }));

mock.module("@loomii/db", () => ({
  db: {
    policy: {
      create: mockPolicyCreate,
      findMany: mockPolicyFindMany,
      findFirst: mockPolicyFindFirst,
      findUnique: mockPolicyFindUnique,
      update: mockPolicyUpdate,
      delete: mockPolicyDelete,
    },
    policyOverride: {
      upsert: mockPolicyOverrideUpsert,
      findMany: mockPolicyOverrideFindMany,
      deleteMany: mockPolicyOverrideDeleteMany,
    },
    embedding: {
      deleteMany: mockEmbeddingDeleteMany,
    },
  },
}));

const mockEmbeddingQueueAdd = mock(async () => ({ id: "job_1" }));

mock.module("@loomii/queue", () => ({
  embeddingQueue: { add: mockEmbeddingQueueAdd },
  QUEUE_NAMES: {},
}));

// Import after mocking
const { policyRoutes } = await import("./policies");

// =========================================
// Test app setup
// =========================================

function createTestApp(role: string = "ADMIN") {
  const app = new Hono<AppEnv>();

  // Simulate auth middleware setting context
  app.use("/*", async (c, next) => {
    c.set("tenantId", "tenant_123");
    c.set("role", role as any);
    c.set("requestId", "req_test");
    c.set("userId", "user_1");
    c.set("logger", { info: () => {}, warn: () => {}, error: () => {}, child: () => ({}) } as any);
    c.set("user", { id: "user_1", email: "test@example.com" } as any);
    await next();
  });

  app.route("/policies", policyRoutes);
  return app;
}

// =========================================
// Tests
// =========================================

describe("Policy API", () => {
  beforeEach(() => {
    mockPolicyCreate.mockReset();
    mockPolicyFindMany.mockReset();
    mockPolicyFindFirst.mockReset();
    mockPolicyFindUnique.mockReset();
    mockPolicyUpdate.mockReset();
    mockPolicyDelete.mockReset();
    mockPolicyOverrideUpsert.mockReset();
    mockPolicyOverrideFindMany.mockReset();
    mockPolicyOverrideDeleteMany.mockReset();
    mockEmbeddingDeleteMany.mockReset();
    mockEmbeddingQueueAdd.mockReset();

    // Reset defaults
    mockPolicyFindFirst.mockResolvedValue(null); // No duplicates by default
    mockPolicyOverrideFindMany.mockResolvedValue([]); // No overrides by default
    mockPolicyCreate.mockImplementation(async (args: any) => ({
      id: "policy_new",
      name: args.data.name,
      framework: args.data.framework,
      identifier: args.data.identifier,
      keywords: args.data.keywords,
      isEnabled: true,
      isBuiltIn: false,
      createdAt: new Date(),
    }));
    mockPolicyFindMany.mockResolvedValue([
      {
        id: "policy_built_in",
        name: "A01:2021 - Broken Access Control",
        framework: "OWASP_TOP_10_2021",
        identifier: "A01",
        keywords: ["access control"],
        isEnabled: true,
        isBuiltIn: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "policy_custom",
        name: "Custom Auth Policy",
        framework: "CUSTOM",
        identifier: "custom_abc",
        keywords: ["auth"],
        isEnabled: true,
        isBuiltIn: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
  });

  describe("POST /policies (create)", () => {
    it("creates custom policy and enqueues embedding (AC1)", async () => {
      const app = createTestApp();
      const res = await app.request("/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Internal Security Policy",
          content: "# Internal Security Policy\n\nAll services must use mTLS for internal communication.",
          keywords: ["mtls", "internal"],
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.policy.name).toBe("Internal Security Policy");
      expect(data.policy.isBuiltIn).toBe(false);

      // Policy created in DB
      expect(mockPolicyCreate).toHaveBeenCalledTimes(1);
      const createArgs = mockPolicyCreate.mock.calls[0]![0] as any;
      expect(createArgs.data.tenantId).toBe("tenant_123");
      expect(createArgs.data.framework).toBe("CUSTOM");
      expect(createArgs.data.isBuiltIn).toBe(false);

      // Embedding enqueued
      expect(mockEmbeddingQueueAdd).toHaveBeenCalledTimes(1);
    });

    it("validates required fields", async () => {
      const app = createTestApp();
      const res = await app.request("/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "" }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects content over 50KB", async () => {
      const app = createTestApp();
      const res = await app.request("/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Large Policy",
          content: "x".repeat(51201),
        }),
      });

      expect(res.status).toBe(400);
    });

    it("RBAC: developer blocked (AC6)", async () => {
      const app = createTestApp("DEVELOPER");
      const res = await app.request("/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Test",
          content: "Test content that is long enough to pass validation rules.",
        }),
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error.code).toBe("FORBIDDEN");
    });

    it("RBAC: SECURITY_LEAD allowed", async () => {
      const app = createTestApp("SECURITY_LEAD");
      const res = await app.request("/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Security Lead Policy",
          content: "# Policy created by security lead with sufficient content.",
        }),
      });

      expect(res.status).toBe(201);
    });

    it("rejects duplicate policy name for same tenant", async () => {
      mockPolicyFindFirst.mockResolvedValue({ id: "existing_policy" });

      const app = createTestApp();
      const res = await app.request("/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Already Exists",
          content: "# This policy name is already taken by this tenant.",
        }),
      });

      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error.code).toBe("CONFLICT");
    });
  });

  describe("GET /policies (list)", () => {
    it("lists built-in + custom policies for tenant (AC2)", async () => {
      const app = createTestApp();
      const res = await app.request("/policies");

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.policies).toHaveLength(2);

      // Built-in listed
      const builtIn = data.policies.find((p: any) => p.isBuiltIn);
      expect(builtIn).toBeDefined();
      expect(builtIn.name).toContain("Broken Access Control");

      // Custom listed
      const custom = data.policies.find((p: any) => !p.isBuiltIn);
      expect(custom).toBeDefined();
    });

    it("queries with correct OR filter (built-in + tenant)", async () => {
      const app = createTestApp();
      await app.request("/policies");

      const findArgs = mockPolicyFindMany.mock.calls[0]![0] as any;
      expect(findArgs.where.OR).toBeDefined();
      expect(findArgs.where.OR).toContainEqual({ tenantId: null });
      expect(findArgs.where.OR).toContainEqual({ tenantId: "tenant_123" });
    });

    it("merges tenant overrides into built-in policy status (AC3)", async () => {
      mockPolicyOverrideFindMany.mockResolvedValue([
        { policyId: "policy_built_in", isEnabled: false },
      ]);

      const app = createTestApp();
      const res = await app.request("/policies");

      expect(res.status).toBe(200);
      const data = await res.json();
      const builtIn = data.policies.find((p: any) => p.id === "policy_built_in");
      expect(builtIn.isEnabled).toBe(false); // Overridden to false
    });
  });

  describe("PATCH /policies/:id (update)", () => {
    it("toggles policy enabled/disabled (AC3)", async () => {
      mockPolicyFindUnique.mockResolvedValue({
        id: "policy_custom",
        tenantId: "tenant_123",
        isBuiltIn: false,
      });

      const app = createTestApp();
      const res = await app.request("/policies/policy_custom", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isEnabled: false }),
      });

      expect(res.status).toBe(200);
      expect(mockPolicyUpdate).toHaveBeenCalledTimes(1);
    });

    it("re-embeds on content update", async () => {
      mockPolicyFindUnique.mockResolvedValue({
        id: "policy_custom",
        tenantId: "tenant_123",
        isBuiltIn: false,
      });

      const app = createTestApp();
      await app.request("/policies/policy_custom", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "# Updated policy content that is long enough to pass." }),
      });

      expect(mockEmbeddingQueueAdd).toHaveBeenCalledTimes(1);
    });

    it("returns 404 for non-existent policy", async () => {
      mockPolicyFindUnique.mockResolvedValue(null);

      const app = createTestApp();
      const res = await app.request("/policies/not_real", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isEnabled: false }),
      });

      expect(res.status).toBe(404);
    });

    it("blocks content update on built-in policy", async () => {
      mockPolicyFindUnique.mockResolvedValue({
        id: "policy_built_in",
        tenantId: null,
        isBuiltIn: true,
      });

      const app = createTestApp();
      const res = await app.request("/policies/policy_built_in", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "Trying to change built-in" }),
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error.message).toContain("cannot be modified");
    });

    it("creates per-tenant override when toggling built-in policy (AC1)", async () => {
      mockPolicyFindUnique.mockResolvedValue({
        id: "policy_built_in",
        name: "A01:2021 - Broken Access Control",
        tenantId: null,
        isBuiltIn: true,
        framework: "OWASP",
        identifier: "A01",
        keywords: [],
        isEnabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const app = createTestApp();
      const res = await app.request("/policies/policy_built_in", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isEnabled: false }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.policy.isEnabled).toBe(false);

      // Override was created (not the global policy row)
      expect(mockPolicyOverrideUpsert).toHaveBeenCalledTimes(1);
      const upsertArgs = mockPolicyOverrideUpsert.mock.calls[0]![0] as any;
      expect(upsertArgs.where.tenantId_policyId.tenantId).toBe("tenant_123");
      expect(upsertArgs.where.tenantId_policyId.policyId).toBe("policy_built_in");
      expect(upsertArgs.create.isEnabled).toBe(false);

      // Global policy was NOT updated
      expect(mockPolicyUpdate).not.toHaveBeenCalled();
    });

    it("rejects empty update body", async () => {
      mockPolicyFindUnique.mockResolvedValue({
        id: "policy_custom",
        tenantId: "tenant_123",
        isBuiltIn: false,
      });

      const app = createTestApp();
      const res = await app.request("/policies/policy_custom", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.message).toContain("At least one field");
    });
  });

  describe("DELETE /policies/:id", () => {
    it("blocks deletion of built-in policy (AC4)", async () => {
      mockPolicyFindUnique.mockResolvedValue({
        id: "policy_built_in",
        tenantId: null,
        isBuiltIn: true,
      });

      const app = createTestApp();
      const res = await app.request("/policies/policy_built_in", {
        method: "DELETE",
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error.message).toContain("Built-in");
    });

    it("deletes custom policy and cleans embeddings (AC5)", async () => {
      mockPolicyFindUnique.mockResolvedValue({
        id: "policy_custom",
        tenantId: "tenant_123",
        isBuiltIn: false,
      });

      const app = createTestApp();
      const res = await app.request("/policies/policy_custom", {
        method: "DELETE",
      });

      expect(res.status).toBe(204);

      // Embeddings cleaned up
      expect(mockEmbeddingDeleteMany).toHaveBeenCalledTimes(1);
      const deleteArgs = mockEmbeddingDeleteMany.mock.calls[0]![0] as any;
      expect(deleteArgs.where.documentId).toBe("policy_custom");

      // Policy deleted
      expect(mockPolicyDelete).toHaveBeenCalledTimes(1);
    });

    it("returns 404 for another tenant's policy", async () => {
      mockPolicyFindUnique.mockResolvedValue({
        id: "policy_other",
        tenantId: "other_tenant",
        isBuiltIn: false,
      });

      const app = createTestApp();
      const res = await app.request("/policies/policy_other", {
        method: "DELETE",
      });

      expect(res.status).toBe(404);
      expect(mockPolicyDelete).not.toHaveBeenCalled();
    });
  });

  describe("DELETE /policies/:id/override (restore default)", () => {
    it("deletes the override for a built-in policy (AC4)", async () => {
      mockPolicyFindUnique.mockResolvedValue({
        id: "policy_built_in",
        isBuiltIn: true,
      });

      const app = createTestApp();
      const res = await app.request("/policies/policy_built_in/override", {
        method: "DELETE",
      });

      expect(res.status).toBe(204);
      expect(mockPolicyOverrideDeleteMany).toHaveBeenCalledTimes(1);
      const deleteArgs = mockPolicyOverrideDeleteMany.mock.calls[0]![0] as any;
      expect(deleteArgs.where.tenantId).toBe("tenant_123");
      expect(deleteArgs.where.policyId).toBe("policy_built_in");
    });

    it("returns 400 for custom policies (no overrides)", async () => {
      mockPolicyFindUnique.mockResolvedValue({
        id: "policy_custom",
        isBuiltIn: false,
      });

      const app = createTestApp();
      const res = await app.request("/policies/policy_custom/override", {
        method: "DELETE",
      });

      expect(res.status).toBe(400);
    });

    it("returns 404 for non-existent policy", async () => {
      mockPolicyFindUnique.mockResolvedValue(null);

      const app = createTestApp();
      const res = await app.request("/policies/not_real/override", {
        method: "DELETE",
      });

      expect(res.status).toBe(404);
    });
  });
});
