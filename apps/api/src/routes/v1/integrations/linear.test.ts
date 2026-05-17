/**
 * Tests for Linear OAuth integration routes and orchestration.
 *
 * All external dependencies (Linear API, Redis, DB, Queue) are mocked.
 * Tokens are never logged or exposed in responses.
 */
import { describe, it, expect, beforeEach, mock } from "bun:test";
import { Hono } from "hono";
import type { AppEnv } from "../../../lib/types";
import { linearRoutes } from "./linear";
import {
  initiateLinearOAuth,
  verifyAndConsumeState,
  _setRedis,
} from "../../../lib/linear-oauth";

// =========================================
// Mock setup
// =========================================

// Mock Redis
const mockRedis = {
  set: mock((_key: string, _value: string, _ex: string, _ttl: number) =>
    Promise.resolve("OK"),
  ),
  get: mock((_key: string) => Promise.resolve(null as string | null)),
  del: mock((_key: string) => Promise.resolve(1)),
};

// Mock DB
const mockDb = {
  integration: {
    findUnique: mock((_args: unknown) => Promise.resolve(null as unknown)),
    findMany: mock((_args: unknown) => Promise.resolve([] as unknown[])),
    upsert: mock((_args: unknown) =>
      Promise.resolve({
        id: "int_test123",
        tenantId: "tenant_123",
        provider: "LINEAR",
        status: "ACTIVE",
        externalId: "org_linear_123",
        metadata: { workspaceName: "Test Workspace" },
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-01"),
      }),
    ),
  },
};

// Mock events queue
const mockEventsQueue = {
  add: mock((_name: string, _payload: unknown) =>
    Promise.resolve({ id: "job_123" }),
  ),
};

// Mock Linear OAuth functions
const mockExchangeLinearCode = mock((_code: string) =>
  Promise.resolve({
    access_token: "lin_access_token_123",
    token_type: "Bearer",
    expires_in: 86399,
    scope: "read" as string | string[],
    refresh_token: "lin_refresh_token_456",
  }),
);

const mockGetLinearAuthorizationUrl = mock(
  (state: string) =>
    `https://linear.app/oauth/authorize?client_id=test_client&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fintegrations%2Flinear%2Fcallback&response_type=code&scope=read&state=${state}&prompt=consent`,
);

// Mock Linear client functions
const mockVerifyLinearAccess = mock((_token: string) =>
  Promise.resolve({
    id: "viewer_123",
    name: "Test User",
    email: "test@example.com",
    organization: {
      id: "org_linear_123",
      name: "Test Workspace",
    },
  }),
);

const mockRegisterLinearWebhooks = mock(
  (_token: string, _url: string, _types: string[]) =>
    Promise.resolve({
      id: "webhook_123",
      enabled: true,
      resourceTypes: ["Issue", "Comment", "Project"],
      secret: "whsec_test_secret_123",
    }),
);

// Apply mocks
mock.module("@loomii/db", () => ({ db: mockDb }));
mock.module("@loomii/queue", () => ({
  eventsQueue: mockEventsQueue,
  createRedisConnection: () => mockRedis,
  // Re-export other queue symbols to prevent "export not found" when other
  // modules in the same test process import @loomii/queue
  contextAssemblyQueue: { add: mock() },
  riskClassificationQueue: { add: mock() },
  embeddingQueue: { add: mock() },
  notionPollingQueue: { add: mock() },
  integrationHealthQueue: { add: mock() },
  reviewQueue: { add: mock() },
  threatModelQueue: { add: mock() },
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
  ALL_QUEUE_NAMES: [
    "context-assembly",
    "risk-classification",
    "embedding-generation",
    "notion-polling",
    "integration-health",
    "review-generation",
    "threat-model-update",
    "events",
  ],
}));
mock.module("@loomii/shared", () => ({
  encrypt: (text: string) => `encrypted:${text.slice(0, 8)}...`,
  decrypt: (text: string) => text.replace("encrypted:", ""),
}));
mock.module("../../../integrations/linear/oauth", () => ({
  getLinearAuthorizationUrl: mockGetLinearAuthorizationUrl,
  exchangeLinearCode: mockExchangeLinearCode,
  SCOPES: ["read"],
}));
mock.module("../../../lib/linear-client", () => ({
  verifyLinearAccess: mockVerifyLinearAccess,
  registerLinearWebhooks: mockRegisterLinearWebhooks,
  createLinearClient: mock(),
}));

// =========================================
// Test app setup
// =========================================

function createTestApp() {
  const app = new Hono<AppEnv>();

  // Simulate auth middleware
  app.use("*", async (c, next) => {
    c.set("tenantId", "tenant_123");
    c.set("userId", "user_123");
    c.set("requestId", "req_test");
    c.set("logger", {
      info: mock(),
      warn: mock(),
      error: mock(),
      debug: mock(),
    } as any);
    c.set("user", { id: "user_123", email: "test@test.com" } as any);
    c.set("role", "ADMIN" as any);
    await next();
  });

  app.route("/api/v1/integrations/linear", linearRoutes);
  return app;
}

// =========================================
// Tests
// =========================================

describe("Linear OAuth Routes", () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    app = createTestApp();
    // Reset mocks
    mockRedis.set.mockReset();
    mockRedis.get.mockReset();
    mockRedis.del.mockReset();
    mockDb.integration.findUnique.mockReset();
    mockDb.integration.upsert.mockReset();
    mockEventsQueue.add.mockReset();
    mockExchangeLinearCode.mockReset();
    mockVerifyLinearAccess.mockReset();
    mockRegisterLinearWebhooks.mockReset();

    // Set default mock returns
    mockDb.integration.findUnique.mockResolvedValue(null);
    mockDb.integration.upsert.mockResolvedValue({
      id: "int_test123",
      tenantId: "tenant_123",
      provider: "LINEAR",
      status: "ACTIVE",
      externalId: "org_linear_123",
      metadata: { workspaceName: "Test Workspace" },
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
    });
    mockEventsQueue.add.mockResolvedValue({ id: "job_123" });

    // Set required env vars
    process.env.FRONTEND_URL = "http://localhost:5173";
    process.env.LINEAR_REDIRECT_URI =
      "http://localhost:3000/integrations/linear/callback";
    process.env.LINEAR_CLIENT_ID = "test_client";
    process.env.LINEAR_CLIENT_SECRET = "test_secret";
    process.env.ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  });

  describe("POST /connect", () => {
    it("generates state and returns redirect URL with correct Linear OAuth params", async () => {
      _setRedis(mockRedis as any);
      mockRedis.set.mockResolvedValue("OK");

      const res = await app.request("/api/v1/integrations/linear/connect", {
        method: "POST",
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { redirectUrl: string };
      expect(body.redirectUrl).toBeDefined();
      expect(body.redirectUrl).toContain("https://linear.app/oauth/authorize");
      expect(body.redirectUrl).toContain("client_id=test_client");
      expect(body.redirectUrl).toContain("response_type=code");
      expect(body.redirectUrl).toContain("scope=");
      expect(body.redirectUrl).toContain("state=");
      expect(body.redirectUrl).toContain("prompt=consent");
    });

    it("stores state token in Redis with 10 minute TTL", async () => {
      _setRedis(mockRedis as any);
      mockRedis.set.mockResolvedValue("OK");

      await app.request("/api/v1/integrations/linear/connect", {
        method: "POST",
      });

      expect(mockRedis.set).toHaveBeenCalledTimes(1);
      const calls = mockRedis.set.mock.calls;
      const [key, value, ex, ttl] = calls[0]!;
      // Key should start with oauth:linear:state:
      expect(key).toMatch(/^oauth:linear:state:/);
      // Value should contain tenantId
      const storedData = JSON.parse(value);
      expect(storedData.tenantId).toBe("tenant_123");
      // TTL should be 600 seconds (10 minutes)
      expect(ex).toBe("EX");
      expect(ttl).toBe(600);
    });

    it("returns 409 if active Linear integration already exists", async () => {
      mockDb.integration.findUnique.mockResolvedValue({
        id: "int_existing",
        status: "ACTIVE",
        provider: "LINEAR",
      });

      const res = await app.request("/api/v1/integrations/linear/connect", {
        method: "POST",
      });

      expect(res.status).toBe(409);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe("INTEGRATION_EXISTS");
    });

    it("allows reconnection if integration exists but is not ACTIVE", async () => {
      _setRedis(mockRedis as any);
      mockRedis.set.mockResolvedValue("OK");
      mockDb.integration.findUnique.mockResolvedValue({
        id: "int_existing",
        status: "DISCONNECTED",
        provider: "LINEAR",
      });

      const res = await app.request("/api/v1/integrations/linear/connect", {
        method: "POST",
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { redirectUrl: string };
      expect(body.redirectUrl).toBeDefined();
    });
  });

  describe("GET /callback", () => {
    it("redirects with error on missing code param", async () => {
      _setRedis(mockRedis as any);
      const res = await app.request(
        "/api/v1/integrations/linear/callback?state=abc",
      );

      expect(res.status).toBe(302);
      const location = res.headers.get("Location")!;
      expect(location).toContain("status=error");
      expect(location).toContain("reason=missing_params");
    });

    it("redirects with error on missing state param", async () => {
      _setRedis(mockRedis as any);
      const res = await app.request(
        "/api/v1/integrations/linear/callback?code=abc",
      );

      expect(res.status).toBe(302);
      const location = res.headers.get("Location")!;
      expect(location).toContain("status=error");
      expect(location).toContain("reason=missing_params");
    });

    it("rejects invalid state (not found in Redis)", async () => {
      _setRedis(mockRedis as any);
      mockRedis.get.mockResolvedValue(null);

      const res = await app.request(
        "/api/v1/integrations/linear/callback?code=auth_code_123&state=invalid_state",
      );

      expect(res.status).toBe(302);
      const location = res.headers.get("Location")!;
      expect(location).toContain("status=error");
      expect(location).toContain("reason=invalid_state");
    });

    it("rejects expired state (TTL expired in Redis)", async () => {
      _setRedis(mockRedis as any);
      // After TTL, Redis.get returns null
      mockRedis.get.mockResolvedValue(null);

      const res = await app.request(
        "/api/v1/integrations/linear/callback?code=auth_code_123&state=expired_state",
      );

      expect(res.status).toBe(302);
      const location = res.headers.get("Location")!;
      expect(location).toContain("status=error");
      expect(location).toContain("reason=invalid_state");
    });

    it("successfully processes valid callback - creates integration record", async () => {
      _setRedis(mockRedis as any);
      const validState = "valid-state-uuid";
      mockRedis.get.mockResolvedValue(
        JSON.stringify({ tenantId: "tenant_123", createdAt: Date.now() }),
      );
      mockRedis.del.mockResolvedValue(1);

      mockExchangeLinearCode.mockResolvedValue({
        access_token: "lin_access_token_123",
        token_type: "Bearer",
        expires_in: 86399,
        scope: "read",
        refresh_token: "lin_refresh_token_456",
      });
      mockVerifyLinearAccess.mockResolvedValue({
        id: "viewer_123",
        name: "Test User",
        email: "test@example.com",
        organization: { id: "org_linear_123", name: "Test Workspace" },
      });
      mockRegisterLinearWebhooks.mockResolvedValue({
        id: "webhook_123",
        enabled: true,
        resourceTypes: ["Issue", "Comment", "Project"],
        secret: "whsec_test_secret_123",
      });

      const res = await app.request(
        `/api/v1/integrations/linear/callback?code=auth_code_123&state=${validState}`,
      );

      expect(res.status).toBe(302);
      const location = res.headers.get("Location")!;
      expect(location).toContain("status=success");
      expect(location).toContain("provider=linear");

      // Verify integration was upserted
      expect(mockDb.integration.upsert).toHaveBeenCalledTimes(1);
      const upsertCall = mockDb.integration.upsert.mock.calls[0]![0] as any;
      expect(upsertCall.where.tenantId_provider.tenantId).toBe("tenant_123");
      expect(upsertCall.where.tenantId_provider.provider).toBe("LINEAR");
      expect(upsertCall.create.status).toBe("ACTIVE");
    });

    it("tokens are encrypted before storage (not plaintext in DB)", async () => {
      _setRedis(mockRedis as any);
      mockRedis.get.mockResolvedValue(
        JSON.stringify({ tenantId: "tenant_123", createdAt: Date.now() }),
      );
      mockRedis.del.mockResolvedValue(1);

      mockExchangeLinearCode.mockResolvedValue({
        access_token: "lin_access_token_123",
        token_type: "Bearer",
        expires_in: 86399,
        scope: "read",
        refresh_token: "lin_refresh_token_456",
      });
      mockVerifyLinearAccess.mockResolvedValue({
        id: "viewer_123",
        name: "Test User",
        email: "test@example.com",
        organization: { id: "org_linear_123", name: "Test Workspace" },
      });
      mockRegisterLinearWebhooks.mockResolvedValue({
        id: "webhook_123",
        enabled: true,
        resourceTypes: ["Issue", "Comment", "Project"],
        secret: "whsec_test_secret_123",
      });

      await app.request(
        "/api/v1/integrations/linear/callback?code=auth_code_123&state=valid_state",
      );

      const upsertCall = mockDb.integration.upsert.mock.calls[0]![0] as any;
      // Access token should be encrypted (not plaintext)
      expect(upsertCall.create.accessToken).not.toBe("lin_access_token_123");
      expect(upsertCall.create.accessToken).toContain("encrypted:");
      // Refresh token should also be encrypted
      expect(upsertCall.create.refreshToken).not.toBe("lin_refresh_token_456");
      expect(upsertCall.create.refreshToken).toContain("encrypted:");
    });

    it("state token is single-use (deleted after verification)", async () => {
      _setRedis(mockRedis as any);
      mockRedis.get.mockResolvedValue(
        JSON.stringify({ tenantId: "tenant_123", createdAt: Date.now() }),
      );
      mockRedis.del.mockResolvedValue(1);

      mockExchangeLinearCode.mockResolvedValue({
        access_token: "lin_access_token_123",
        token_type: "Bearer",
        expires_in: 86399,
        scope: "read",
        refresh_token: "lin_refresh_token_456",
      });
      mockVerifyLinearAccess.mockResolvedValue({
        id: "viewer_123",
        name: "Test User",
        email: "test@example.com",
        organization: { id: "org_linear_123", name: "Test Workspace" },
      });
      mockRegisterLinearWebhooks.mockResolvedValue({
        id: "webhook_123",
        enabled: true,
        resourceTypes: ["Issue", "Comment", "Project"],
        secret: "whsec_test_secret_123",
      });

      await app.request(
        "/api/v1/integrations/linear/callback?code=auth_code_123&state=valid_state",
      );

      // Redis.del should have been called to consume the state
      expect(mockRedis.del).toHaveBeenCalledTimes(1);
      const delKey = mockRedis.del.mock.calls[0]![0];
      expect(delKey).toContain("oauth:linear:state:");
    });

    it("publishes integration.connected event to queue", async () => {
      _setRedis(mockRedis as any);
      mockRedis.get.mockResolvedValue(
        JSON.stringify({ tenantId: "tenant_123", createdAt: Date.now() }),
      );
      mockRedis.del.mockResolvedValue(1);

      mockExchangeLinearCode.mockResolvedValue({
        access_token: "lin_access_token_123",
        token_type: "Bearer",
        expires_in: 86399,
        scope: "read",
        refresh_token: "lin_refresh_token_456",
      });
      mockVerifyLinearAccess.mockResolvedValue({
        id: "viewer_123",
        name: "Test User",
        email: "test@example.com",
        organization: { id: "org_linear_123", name: "Test Workspace" },
      });
      mockRegisterLinearWebhooks.mockResolvedValue({
        id: "webhook_123",
        enabled: true,
        resourceTypes: ["Issue", "Comment", "Project"],
        secret: "whsec_test_secret_123",
      });

      await app.request(
        "/api/v1/integrations/linear/callback?code=auth_code_123&state=valid_state",
      );

      // Events queue should have the integration.connected event
      expect(mockEventsQueue.add).toHaveBeenCalledTimes(1);
      const addCalls = mockEventsQueue.add.mock.calls;
      const jobName = addCalls[0]![0];
      const payload = addCalls[0]![1] as any;
      expect(jobName).toBe("integration.connected");
      expect(payload.tenantId).toBe("tenant_123");
      expect(payload.eventType).toBe("integration.connected");
      expect(payload.data.provider).toBe("LINEAR");
      expect(payload.data.workspaceName).toBe("Test Workspace");
    });

    it("redirects to error page on token exchange failure", async () => {
      _setRedis(mockRedis as any);
      mockRedis.get.mockResolvedValue(
        JSON.stringify({ tenantId: "tenant_123", createdAt: Date.now() }),
      );
      mockRedis.del.mockResolvedValue(1);

      mockExchangeLinearCode.mockRejectedValue(
        new Error("Linear token exchange failed (400)"),
      );

      const res = await app.request(
        "/api/v1/integrations/linear/callback?code=bad_code&state=valid_state",
      );

      expect(res.status).toBe(302);
      const location = res.headers.get("Location")!;
      expect(location).toContain("status=error");
      expect(location).toContain("reason=exchange_failed");
    });
  });
});

describe("Linear OAuth State Management", () => {
  beforeEach(() => {
    mockRedis.set.mockReset();
    mockRedis.get.mockReset();
    mockRedis.del.mockReset();
    _setRedis(mockRedis as any);

    process.env.LINEAR_CLIENT_ID = "test_client";
    process.env.LINEAR_CLIENT_SECRET = "test_secret";
    process.env.LINEAR_REDIRECT_URI =
      "http://localhost:3000/integrations/linear/callback";
  });

  it("initiateLinearOAuth generates UUID state and stores in Redis", async () => {
    mockRedis.set.mockResolvedValue("OK");

    const result = await initiateLinearOAuth("tenant_abc");

    expect(result.state).toBeDefined();
    // UUID v4 format
    expect(result.state).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(result.redirectUrl).toContain("linear.app/oauth/authorize");

    // Verify Redis was called correctly
    expect(mockRedis.set).toHaveBeenCalledTimes(1);
    const calls = mockRedis.set.mock.calls;
    const [key, value, ex, ttl] = calls[0]!;
    expect(key).toContain("oauth:linear:state:");
    expect(value).toContain("tenant_abc");
    expect(ex).toBe("EX");
    expect(ttl).toBe(600);
  });

  it("verifyAndConsumeState returns tenantId for valid state", async () => {
    mockRedis.get.mockResolvedValue(
      JSON.stringify({ tenantId: "tenant_abc", createdAt: Date.now() }),
    );
    mockRedis.del.mockResolvedValue(1);

    const result = await verifyAndConsumeState("valid-state");

    expect(result).not.toBeNull();
    expect(result!.tenantId).toBe("tenant_abc");
    const delKey = mockRedis.del.mock.calls[0]![0];
    expect(delKey).toBe("oauth:linear:state:valid-state");
  });

  it("verifyAndConsumeState returns null for missing state", async () => {
    mockRedis.get.mockResolvedValue(null);

    const result = await verifyAndConsumeState("nonexistent");

    expect(result).toBeNull();
  });

  it("verifyAndConsumeState deletes state even on parse failure", async () => {
    mockRedis.get.mockResolvedValue("invalid json {{{");
    mockRedis.del.mockResolvedValue(1);

    const result = await verifyAndConsumeState("bad-data-state");

    expect(result).toBeNull();
    // State should still be deleted
    const delKey = mockRedis.del.mock.calls[0]![0];
    expect(delKey).toBe("oauth:linear:state:bad-data-state");
  });
});

describe("Token Security", () => {
  it("tokens never appear in JSON responses from /connect", async () => {
    _setRedis(mockRedis as any);
    mockRedis.set.mockResolvedValue("OK");
    mockDb.integration.findUnique.mockResolvedValue(null);

    process.env.LINEAR_CLIENT_ID = "test_client";
    process.env.LINEAR_CLIENT_SECRET = "test_secret";
    process.env.LINEAR_REDIRECT_URI =
      "http://localhost:3000/integrations/linear/callback";
    process.env.FRONTEND_URL = "http://localhost:5173";

    const app = createTestApp();
    const res = await app.request("/api/v1/integrations/linear/connect", {
      method: "POST",
    });

    const text = await res.text();
    // Ensure no token-like values appear
    expect(text).not.toContain("access_token");
    expect(text).not.toContain("refresh_token");
    expect(text).not.toContain("client_secret");
  });
});
