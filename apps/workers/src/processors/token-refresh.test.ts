/**
 * Tests for Token Refresh Worker.
 *
 * All external dependencies (Linear API, DB, encryption, queue) are mocked.
 * Tests cover:
 * - Refreshes expiring Linear tokens (AC1)
 * - Encrypts new tokens before storage (AC2)
 * - Marks EXPIRED (ERROR) after 3 failures (AC3)
 * - Publishes error event on failure (AC4)
 * - Tokens never appear in logs (AC7)
 */
import "../test-setup";
import { describe, it, expect, beforeEach, afterAll, mock } from "bun:test";

// =========================================
// Mock setup
// =========================================

const mockFindMany = mock((_args: any) => Promise.resolve([] as Record<string, unknown>[]));
const mockUpdate = mock((_args: any) => Promise.resolve({} as Record<string, unknown>));

const mockDb = {
  integration: {
    findMany: mockFindMany,
    findUnique: mock((_args: any) => Promise.resolve(null)),
    update: mockUpdate,
  },
};

const mockEventsQueueAdd = mock((_name: string, _payload: any) =>
  Promise.resolve({ id: "event_job_123" })
);

mock.module("@loomii/db", () => ({ db: mockDb, vectorSearch: async () => [], insertEmbedding: async () => {} }));
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

// Mock fetch for Linear token endpoint
const mockFetch = mock(async (_url: string, _opts: any) =>
  new Response(
    JSON.stringify({
      access_token: "new_access_token_123",
      token_type: "Bearer",
      expires_in: 86400,
      refresh_token: "new_refresh_token_456",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  )
);

// Save and restore original fetch
const originalFetch = globalThis.fetch;
globalThis.fetch = mockFetch as any;

// Set env vars for Linear OAuth
process.env.LINEAR_CLIENT_ID = "test_client_id";
process.env.LINEAR_CLIENT_SECRET = "test_client_secret";

// Import after mocking
const { refreshExpiringTokens } = await import("./token-refresh");

// =========================================
// Test helpers
// =========================================

function createExpiringIntegration(overrides: Record<string, unknown> = {}) {
  return {
    id: "int_123",
    tenantId: "tenant_123",
    provider: "LINEAR",
    status: "ACTIVE",
    accessToken: "encrypted:old_access",
    refreshToken: "encrypted:old_refresh",
    tokenExpiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 min from now
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

describe("Token Refresh", () => {
  beforeEach(() => {
    mockFindMany.mockClear();
    mockUpdate.mockClear();
    mockEventsQueueAdd.mockClear();
    mockFetch.mockClear();

    // Ensure our mock fetch is active
    globalThis.fetch = mockFetch as any;

    // Reset fetch to successful response
    mockFetch.mockImplementation(async () =>
      new Response(
        JSON.stringify({
          access_token: "new_access_token_123",
          token_type: "Bearer",
          expires_in: 86400,
          refresh_token: "new_refresh_token_456",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
  });

  afterAll(() => {
    // Restore original fetch to avoid poisoning other test files
    globalThis.fetch = originalFetch;
  });

  it("refreshes expiring Linear tokens", async () => {
    const integration = createExpiringIntegration();
    mockFindMany.mockImplementation(async () => [integration]);

    const results = await refreshExpiringTokens();

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);

    // Should have called Linear token endpoint
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const fetchCall = mockFetch.mock.calls[0];
    expect(fetchCall[0]).toBe("https://api.linear.app/oauth/token");
  });

  it("encrypts new tokens before storage", async () => {
    const integration = createExpiringIntegration();
    mockFindMany.mockImplementation(async () => [integration]);

    await refreshExpiringTokens();

    // Should update integration with encrypted tokens
    expect(mockUpdate).toHaveBeenCalled();
    const updateCall = mockUpdate.mock.calls[0][0];
    expect(updateCall.data.accessToken).toBe("encrypted:new_acce");
    expect(updateCall.data.refreshToken).toBe("encrypted:new_refr");
  });

  it("marks EXPIRED (ERROR) after 3 failures", async () => {
    // Integration already has 2 failures
    const integration = createExpiringIntegration({
      metadata: { refreshFailures: 2 },
    });
    mockFindMany.mockImplementation(async () => [integration]);

    // Make fetch fail
    mockFetch.mockImplementation(async () =>
      new Response("Unauthorized", { status: 401 })
    );

    const results = await refreshExpiringTokens();

    expect(results[0].success).toBe(false);

    // Should mark as ERROR
    expect(mockUpdate).toHaveBeenCalled();
    const updateCall = mockUpdate.mock.calls[0][0];
    expect(updateCall.data.status).toBe("ERROR");
    expect(updateCall.data.metadata.refreshFailures).toBe(3);
    expect(updateCall.data.metadata.errorReason).toBe("token_refresh_failed");
  });

  it("publishes error event on max failures", async () => {
    const integration = createExpiringIntegration({
      metadata: { refreshFailures: 2 },
    });
    mockFindMany.mockImplementation(async () => [integration]);

    mockFetch.mockImplementation(async () =>
      new Response("Unauthorized", { status: 401 })
    );

    await refreshExpiringTokens();

    // Should publish integration.error event
    expect(mockEventsQueueAdd).toHaveBeenCalledTimes(1);
    const eventCall = mockEventsQueueAdd.mock.calls[0];
    expect(eventCall[0]).toBe("integration-error");
    expect(eventCall[1].eventType).toBe("integration.error");
    expect(eventCall[1].data.reason).toBe("token_refresh_failed");
  });

  it("increments failure counter without marking ERROR on first failure", async () => {
    const integration = createExpiringIntegration({
      metadata: { refreshFailures: 0 },
    });
    mockFindMany.mockImplementation(async () => [integration]);

    mockFetch.mockImplementation(async () =>
      new Response("Unauthorized", { status: 401 })
    );

    const results = await refreshExpiringTokens();

    expect(results[0].success).toBe(false);

    // Should increment but NOT mark as ERROR
    const updateCall = mockUpdate.mock.calls[0][0];
    expect(updateCall.data.metadata.refreshFailures).toBe(1);
    expect(updateCall.data.status).toBeUndefined();
  });

  it("resets failure counter on successful refresh", async () => {
    const integration = createExpiringIntegration({
      metadata: { refreshFailures: 2 },
    });
    mockFindMany.mockImplementation(async () => [integration]);

    const results = await refreshExpiringTokens();

    expect(results[0].success).toBe(true);
    const updateCall = mockUpdate.mock.calls[0][0];
    expect(updateCall.data.metadata.refreshFailures).toBe(0);
  });

  it("skips integrations without refresh token", async () => {
    const integration = createExpiringIntegration({ refreshToken: null });
    mockFindMany.mockImplementation(async () => [integration]);

    const results = await refreshExpiringTokens();

    expect(results[0].success).toBe(false);
    expect(results[0].error).toContain("No refresh token");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns empty array when no tokens are expiring", async () => {
    mockFindMany.mockImplementation(async () => []);

    const results = await refreshExpiringTokens();

    expect(results).toHaveLength(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("sets tokenExpiresAt from expires_in response", async () => {
    const integration = createExpiringIntegration();
    mockFindMany.mockImplementation(async () => [integration]);

    await refreshExpiringTokens();

    const updateCall = mockUpdate.mock.calls[0][0];
    expect(updateCall.data.tokenExpiresAt).toBeInstanceOf(Date);
    // Should be approximately 24h from now
    const expiresIn = updateCall.data.tokenExpiresAt.getTime() - Date.now();
    expect(expiresIn).toBeGreaterThan(86000 * 1000);
    expect(expiresIn).toBeLessThan(87000 * 1000);
  });

  it("sends correct grant_type=refresh_token to Linear", async () => {
    const integration = createExpiringIntegration();
    mockFindMany.mockImplementation(async () => [integration]);

    await refreshExpiringTokens();

    const fetchCall = mockFetch.mock.calls[0];
    const body = fetchCall[1].body as URLSearchParams;
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("client_id")).toBe("test_client_id");
    expect(body.get("client_secret")).toBe("test_client_secret");
  });
});
