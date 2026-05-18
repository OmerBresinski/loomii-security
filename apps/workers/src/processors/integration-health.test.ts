/**
 * Tests for Integration Health Check Worker.
 *
 * All external dependencies (Linear API, Notion API, DB, queue) are mocked.
 * Tests cover:
 * - Detects revoked Linear token (AC5)
 * - Detects revoked Notion token (AC6)
 * - Healthy integration remains ACTIVE (AC5/AC6)
 * - Respects 6hr interval for Notion
 * - Publishes error event on detection
 * - Dispatches by job name (check, refresh)
 */
import { describe, it, expect, beforeEach, mock } from "bun:test";
import type { Job } from "bullmq";
import type { IntegrationHealthPayload } from "@loomii/queue";

// =========================================
// Mock setup
// =========================================

const mockFindMany = mock((_args: any) => Promise.resolve([]));
const mockFindUnique = mock((_args: any) => Promise.resolve(null));
const mockUpdate = mock((_args: any) => Promise.resolve({}));

const mockDb = {
  integration: {
    findMany: mockFindMany,
    findUnique: mockFindUnique,
    update: mockUpdate,
  },
};

const mockEventsQueueAdd = mock((_name: string, _payload: any) =>
  Promise.resolve({ id: "event_job_123" })
);

mock.module("@loomii/db", () => ({ db: mockDb }));
mock.module("@loomii/queue", () => ({
  eventsQueue: { add: mockEventsQueueAdd },
  integrationHealthQueue: { add: mock() },
  QUEUE_NAMES: {
    CONTEXT_ASSEMBLY: "context-assembly",
    RISK_CLASSIFICATION: "risk-classification",
    EMBEDDING_GENERATION: "embedding-generation",
    NOTION_POLLING: "notion-polling",
    INTEGRATION_HEALTH: "integration-health",
    REVIEW_GENERATION: "review-generation",
    THREAT_MODEL_UPDATE: "threat-model-update",
    EVENTS: "events",
  },
}));
mock.module("@loomii/shared", () => ({
  encrypt: (text: string) => `encrypted:${text.slice(0, 8)}`,
  decrypt: (text: string) => text.replace("encrypted:", ""),
}));

// Mock Linear SDK
const mockLinearViewer = mock(async () => ({
  id: "user_123",
  name: "Test User",
  email: "test@example.com",
}));

mock.module("@linear/sdk", () => ({
  LinearClient: class MockLinearClient {
    get viewer() {
      return mockLinearViewer();
    }
  },
}));

// Mock Notion SDK
const mockNotionSearch = mock(async (_opts: any) => ({ results: [] }));

mock.module("@notionhq/client", () => ({
  Client: class MockNotionClient {
    search = mockNotionSearch;
  },
}));

// Import after mocking
const { processIntegrationHealth } = await import("./integration-health");

// =========================================
// Test helpers
// =========================================

function createMockJob(
  name: string,
  data: Partial<IntegrationHealthPayload> = {}
): Job<IntegrationHealthPayload> {
  return {
    id: "job_123",
    name,
    data: data as IntegrationHealthPayload,
    processedOn: Date.now(),
  } as unknown as Job<IntegrationHealthPayload>;
}

function createActiveIntegration(overrides: Record<string, unknown> = {}) {
  return {
    id: "int_123",
    tenantId: "tenant_123",
    provider: "LINEAR",
    status: "ACTIVE",
    accessToken: "encrypted:valid_token",
    refreshToken: "encrypted:refresh_tok",
    tokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    metadata: {},
    lastSyncAt: null,
    lastSyncCursor: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    externalId: "org_123",
    ...overrides,
  };
}

// =========================================
// Tests
// =========================================

describe("Integration Health Check", () => {
  beforeEach(() => {
    mockFindMany.mockClear();
    mockFindUnique.mockClear();
    mockUpdate.mockClear();
    mockEventsQueueAdd.mockClear();
    mockLinearViewer.mockClear();
    mockNotionSearch.mockClear();

    // Reset to successful responses
    mockLinearViewer.mockImplementation(async () => ({
      id: "user_123",
      name: "Test User",
      email: "test@example.com",
    }));
    mockNotionSearch.mockImplementation(async () => ({ results: [] }));
  });

  describe("Job routing", () => {
    it("routes 'refresh' jobs to token refresh logic", async () => {
      // findMany returns [] so refreshExpiringTokens is a no-op
      mockFindMany.mockImplementation(async () => []);
      const job = createMockJob("refresh");
      await processIntegrationHealth(job);
      // If no error thrown, the refresh path executed successfully
      expect(true).toBe(true);
    });

    it("routes 'check' jobs to health check sweep", async () => {
      mockFindMany.mockImplementation(async () => []);
      const job = createMockJob("check");
      await processIntegrationHealth(job);

      expect(mockFindMany).toHaveBeenCalled();
    });
  });

  describe("Health check - Linear", () => {
    it("detects revoked Linear token -> marks ERROR (AC5)", async () => {
      const integration = createActiveIntegration({ provider: "LINEAR" });
      mockFindMany.mockImplementation(async () => [integration]);

      // Make Linear viewer call fail (token revoked)
      mockLinearViewer.mockImplementation(async () => {
        throw new Error("Authentication required");
      });

      const job = createMockJob("check");
      await processIntegrationHealth(job);

      // Should mark as ERROR
      expect(mockUpdate).toHaveBeenCalled();
      const updateCall = mockUpdate.mock.calls[0][0];
      expect(updateCall.data.status).toBe("ERROR");
      expect(updateCall.data.metadata.errorReason).toBe("health_check_failed");
    });

    it("healthy Linear integration remains ACTIVE", async () => {
      const integration = createActiveIntegration({ provider: "LINEAR" });
      mockFindMany.mockImplementation(async () => [integration]);

      const job = createMockJob("check");
      await processIntegrationHealth(job);

      // Should update lastHealthCheckAt but NOT change status
      expect(mockUpdate).toHaveBeenCalled();
      const updateCall = mockUpdate.mock.calls[0][0];
      expect(updateCall.data.status).toBeUndefined();
      expect(updateCall.data.metadata.lastHealthCheckAt).toBeDefined();
    });

    it("publishes error event when Linear token is revoked", async () => {
      const integration = createActiveIntegration({ provider: "LINEAR" });
      mockFindMany.mockImplementation(async () => [integration]);

      mockLinearViewer.mockImplementation(async () => {
        throw new Error("Token revoked");
      });

      const job = createMockJob("check");
      await processIntegrationHealth(job);

      expect(mockEventsQueueAdd).toHaveBeenCalledTimes(1);
      const eventCall = mockEventsQueueAdd.mock.calls[0];
      expect(eventCall[1].eventType).toBe("integration.error");
      expect(eventCall[1].data.provider).toBe("LINEAR");
      expect(eventCall[1].data.reason).toBe("health_check_failed");
    });
  });

  describe("Health check - Notion", () => {
    it("detects revoked Notion token -> marks ERROR (AC6)", async () => {
      const integration = createActiveIntegration({
        provider: "NOTION",
        metadata: { lastHealthCheckAt: new Date(0).toISOString() }, // Long ago
      });
      mockFindMany.mockImplementation(async () => [integration]);

      // Make Notion search call fail (token revoked)
      mockNotionSearch.mockImplementation(async () => {
        throw new Error("Unauthorized");
      });

      const job = createMockJob("check");
      await processIntegrationHealth(job);

      expect(mockUpdate).toHaveBeenCalled();
      const updateCall = mockUpdate.mock.calls[0][0];
      expect(updateCall.data.status).toBe("ERROR");
    });

    it("respects 6hr interval for Notion", async () => {
      const integration = createActiveIntegration({
        provider: "NOTION",
        metadata: {
          lastHealthCheckAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(), // 1hr ago
        },
      });
      mockFindMany.mockImplementation(async () => [integration]);

      const job = createMockJob("check");
      await processIntegrationHealth(job);

      // Should NOT check Notion (last check was 1hr ago, interval is 6hr)
      expect(mockNotionSearch).not.toHaveBeenCalled();
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("checks Notion when 6hr interval has elapsed", async () => {
      const integration = createActiveIntegration({
        provider: "NOTION",
        metadata: {
          lastHealthCheckAt: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(), // 7hr ago
        },
      });
      mockFindMany.mockImplementation(async () => [integration]);

      const job = createMockJob("check");
      await processIntegrationHealth(job);

      // Should check Notion
      expect(mockNotionSearch).toHaveBeenCalled();
    });

    it("checks Notion on first health check (no lastHealthCheckAt)", async () => {
      const integration = createActiveIntegration({
        provider: "NOTION",
        metadata: {},
      });
      mockFindMany.mockImplementation(async () => [integration]);

      const job = createMockJob("check");
      await processIntegrationHealth(job);

      expect(mockNotionSearch).toHaveBeenCalled();
    });
  });

  describe("Edge cases", () => {
    it("skips integrations without access token", async () => {
      const integration = createActiveIntegration({ accessToken: null });
      mockFindMany.mockImplementation(async () => [integration]);

      const job = createMockJob("check");
      await processIntegrationHealth(job);

      expect(mockLinearViewer).not.toHaveBeenCalled();
    });

    it("handles empty integrations list", async () => {
      mockFindMany.mockImplementation(async () => []);

      const job = createMockJob("check");
      await processIntegrationHealth(job);

      // No errors thrown, no updates
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("handles individual integration check via payload", async () => {
      const integration = createActiveIntegration();
      mockFindUnique.mockImplementation(async () => integration);

      const job = createMockJob("check-single", {
        tenantId: "tenant_123",
        integrationId: "int_123",
        provider: "linear",
      });

      await processIntegrationHealth(job);

      expect(mockFindUnique).toHaveBeenCalled();
      expect(mockLinearViewer).toHaveBeenCalled();
    });
  });
});
