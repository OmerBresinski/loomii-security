/**
 * Tests for Notion OAuth integration routes and orchestration.
 *
 * All external dependencies (Notion API, Redis, DB, Queue) are mocked.
 * Tokens are never logged or exposed in responses.
 */
import { describe, it, expect, beforeEach, mock } from "bun:test";
import { Hono } from "hono";
import type { AppEnv } from "../../../lib/types";
import { notionRoutes } from "./notion";
import {
  initiateNotionOAuth,
  verifyAndConsumeNotionState,
  _setRedis,
} from "../../../lib/notion-oauth";

// =========================================
// Mock setup
// =========================================

// Mock Redis
const mockRedis = {
  set: mock((_key: string, _value: string, _ex: string, _ttl: number) =>
    Promise.resolve("OK")
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
        id: "int_notion_123",
        tenantId: "tenant_123",
        provider: "NOTION",
        status: "ACTIVE",
        externalId: "bot_notion_123",
        metadata: { workspaceName: "Test Notion Workspace" },
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-01"),
      })
    ),
  },
};

// Mock events queue
const mockEventsQueue = {
  add: mock((_name: string, _payload: unknown) =>
    Promise.resolve({ id: "job_123" })
  ),
};

// Mock notion polling queue
const mockNotionPollingQueue = {
  add: mock((_name: string, _payload: unknown, _opts?: unknown) =>
    Promise.resolve({ id: "poll_job_123" })
  ),
};

// Mock Notion OAuth functions
const mockExchangeNotionCode = mock((_code: string) =>
  Promise.resolve({
    access_token: "ntn_test_access_token_123",
    token_type: "bearer",
    bot_id: "bot_notion_123",
    workspace_id: "ws_notion_123",
    workspace_name: "Test Notion Workspace",
    workspace_icon: null,
    duplicated_template_id: null,
    owner: {
      type: "user",
      user: {
        id: "user_notion_123",
        name: "Test User",
        avatar_url: null,
      },
    },
  })
);

const mockGetNotionAuthorizationUrl = mock(
  (state: string) =>
    `https://api.notion.com/v1/oauth/authorize?client_id=test_notion_client&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fintegrations%2Fnotion%2Fcallback&response_type=code&owner=user&state=${state}`
);

// Mock Notion client functions
const mockVerifyNotionAccess = mock((_token: string) =>
  Promise.resolve({
    botId: "bot_notion_123",
    workspaceId: "ws_notion_123",
    workspaceName: "Test Notion Workspace",
    ownerType: "bot",
    ownerUserId: undefined,
    ownerUserName: "Loomii Integration",
  })
);

// Apply mocks
mock.module("@loomii/db", () => ({ db: mockDb }));
mock.module("@loomii/queue", () => ({
  eventsQueue: mockEventsQueue,
  notionPollingQueue: mockNotionPollingQueue,
  createRedisConnection: () => mockRedis,
  contextAssemblyQueue: { add: mock() },
  riskClassificationQueue: { add: mock() },
  embeddingQueue: { add: mock() },
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
mock.module("../../../integrations/notion/oauth", () => ({
  getNotionAuthorizationUrl: mockGetNotionAuthorizationUrl,
  exchangeNotionCode: mockExchangeNotionCode,
  NOTION_AUTHORIZE_URL: "https://api.notion.com/v1/oauth/authorize",
  NOTION_TOKEN_URL: "https://api.notion.com/v1/oauth/token",
}));
mock.module("../../../lib/notion-client", () => ({
  verifyNotionAccess: mockVerifyNotionAccess,
  createNotionClient: mock(),
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

  app.route("/api/v1/integrations/notion", notionRoutes);
  return app;
}

// =========================================
// Tests
// =========================================

describe("Notion OAuth Routes", () => {
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
    mockNotionPollingQueue.add.mockReset();
    mockExchangeNotionCode.mockReset();
    mockVerifyNotionAccess.mockReset();

    // Set default mock returns
    mockDb.integration.findUnique.mockResolvedValue(null);
    mockDb.integration.upsert.mockResolvedValue({
      id: "int_notion_123",
      tenantId: "tenant_123",
      provider: "NOTION",
      status: "ACTIVE",
      externalId: "bot_notion_123",
      metadata: { workspaceName: "Test Notion Workspace" },
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
    });
    mockEventsQueue.add.mockResolvedValue({ id: "job_123" });
    mockNotionPollingQueue.add.mockResolvedValue({ id: "poll_job_123" });

    // Set required env vars
    process.env.FRONTEND_URL = "http://localhost:5173";
    process.env.NOTION_CLIENT_ID = "test_notion_client";
    process.env.NOTION_CLIENT_SECRET = "test_notion_secret";
    process.env.NOTION_REDIRECT_URI =
      "http://localhost:3000/integrations/notion/callback";
    process.env.ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  });

  describe("POST /connect", () => {
    it("returns redirect URL with correct Notion OAuth params", async () => {
      _setRedis(mockRedis as any);
      mockRedis.set.mockResolvedValue("OK");

      const res = await app.request("/api/v1/integrations/notion/connect", {
        method: "POST",
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { redirectUrl: string };
      expect(body.redirectUrl).toBeDefined();
      expect(body.redirectUrl).toContain(
        "https://api.notion.com/v1/oauth/authorize"
      );
      expect(body.redirectUrl).toContain("client_id=test_notion_client");
      expect(body.redirectUrl).toContain("response_type=code");
      expect(body.redirectUrl).toContain("owner=user");
      expect(body.redirectUrl).toContain("state=");
    });

    it("stores state token in Redis with 10 minute TTL", async () => {
      _setRedis(mockRedis as any);
      mockRedis.set.mockResolvedValue("OK");

      await app.request("/api/v1/integrations/notion/connect", {
        method: "POST",
      });

      expect(mockRedis.set).toHaveBeenCalledTimes(1);
      const calls = mockRedis.set.mock.calls;
      const [key, value, ex, ttl] = calls[0]!;
      // Key should start with oauth:notion:state:
      expect(key).toMatch(/^oauth:notion:state:/);
      // Value should contain tenantId
      const storedData = JSON.parse(value);
      expect(storedData.tenantId).toBe("tenant_123");
      // TTL should be 600 seconds (10 minutes)
      expect(ex).toBe("EX");
      expect(ttl).toBe(600);
    });

    it("returns 409 if active Notion integration already exists", async () => {
      mockDb.integration.findUnique.mockResolvedValue({
        id: "int_existing",
        status: "ACTIVE",
        provider: "NOTION",
      });

      const res = await app.request("/api/v1/integrations/notion/connect", {
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
        provider: "NOTION",
      });

      const res = await app.request("/api/v1/integrations/notion/connect", {
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
        "/api/v1/integrations/notion/callback?state=abc"
      );

      expect(res.status).toBe(302);
      const location = res.headers.get("Location")!;
      expect(location).toContain("status=error");
      expect(location).toContain("reason=missing_params");
    });

    it("redirects with error on missing state param", async () => {
      _setRedis(mockRedis as any);
      const res = await app.request(
        "/api/v1/integrations/notion/callback?code=abc"
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
        "/api/v1/integrations/notion/callback?code=auth_code_123&state=invalid_state"
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
        "/api/v1/integrations/notion/callback?code=auth_code_123&state=expired_state"
      );

      expect(res.status).toBe(302);
      const location = res.headers.get("Location")!;
      expect(location).toContain("status=error");
      expect(location).toContain("reason=invalid_state");
    });

    it("successfully processes valid callback - creates integration record", async () => {
      _setRedis(mockRedis as any);
      mockRedis.get.mockResolvedValue(
        JSON.stringify({ tenantId: "tenant_123", createdAt: Date.now() })
      );
      mockRedis.del.mockResolvedValue(1);

      mockExchangeNotionCode.mockResolvedValue({
        access_token: "ntn_test_access_token_123",
        token_type: "bearer",
        bot_id: "bot_notion_123",
        workspace_id: "ws_notion_123",
        workspace_name: "Test Notion Workspace",
        workspace_icon: null,
        duplicated_template_id: null,
        owner: { type: "user", user: { id: "user_notion_123", name: "Test User", avatar_url: null } },
      });
      mockVerifyNotionAccess.mockResolvedValue({
        botId: "bot_notion_123",
        workspaceId: "ws_notion_123",
        workspaceName: "Test Notion Workspace",
        ownerType: "bot",
        ownerUserId: undefined,
        ownerUserName: "Loomii Integration",
      });

      const res = await app.request(
        "/api/v1/integrations/notion/callback?code=auth_code_123&state=valid_state"
      );

      expect(res.status).toBe(302);
      const location = res.headers.get("Location")!;
      expect(location).toContain("status=success");
      expect(location).toContain("provider=notion");

      // Verify integration was upserted
      expect(mockDb.integration.upsert).toHaveBeenCalledTimes(1);
      const upsertCall = mockDb.integration.upsert.mock.calls[0]![0] as any;
      expect(upsertCall.where.tenantId_provider.tenantId).toBe("tenant_123");
      expect(upsertCall.where.tenantId_provider.provider).toBe("NOTION");
      expect(upsertCall.create.status).toBe("ACTIVE");
    });

    it("token encrypted before storage (not plaintext in DB)", async () => {
      _setRedis(mockRedis as any);
      mockRedis.get.mockResolvedValue(
        JSON.stringify({ tenantId: "tenant_123", createdAt: Date.now() })
      );
      mockRedis.del.mockResolvedValue(1);

      mockExchangeNotionCode.mockResolvedValue({
        access_token: "ntn_test_access_token_123",
        token_type: "bearer",
        bot_id: "bot_notion_123",
        workspace_id: "ws_notion_123",
        workspace_name: "Test Notion Workspace",
        workspace_icon: null,
        duplicated_template_id: null,
        owner: { type: "user", user: { id: "user_notion_123", name: "Test User", avatar_url: null } },
      });
      mockVerifyNotionAccess.mockResolvedValue({
        botId: "bot_notion_123",
        workspaceId: "ws_notion_123",
        workspaceName: "Test Notion Workspace",
        ownerType: "bot",
        ownerUserId: undefined,
        ownerUserName: "Loomii Integration",
      });

      await app.request(
        "/api/v1/integrations/notion/callback?code=auth_code_123&state=valid_state"
      );

      const upsertCall = mockDb.integration.upsert.mock.calls[0]![0] as any;
      // Access token should be encrypted (not plaintext)
      expect(upsertCall.create.accessToken).not.toBe(
        "ntn_test_access_token_123"
      );
      expect(upsertCall.create.accessToken).toContain("encrypted:");
      // No refresh token for Notion
      expect(upsertCall.create.refreshToken).toBeNull();
      // No expiry for Notion tokens
      expect(upsertCall.create.tokenExpiresAt).toBeNull();
    });

    it("registers BullMQ repeatable polling job (every 2 minutes)", async () => {
      _setRedis(mockRedis as any);
      mockRedis.get.mockResolvedValue(
        JSON.stringify({ tenantId: "tenant_123", createdAt: Date.now() })
      );
      mockRedis.del.mockResolvedValue(1);

      mockExchangeNotionCode.mockResolvedValue({
        access_token: "ntn_test_access_token_123",
        token_type: "bearer",
        bot_id: "bot_notion_123",
        workspace_id: "ws_notion_123",
        workspace_name: "Test Notion Workspace",
        workspace_icon: null,
        duplicated_template_id: null,
        owner: { type: "user", user: { id: "user_notion_123", name: "Test User", avatar_url: null } },
      });
      mockVerifyNotionAccess.mockResolvedValue({
        botId: "bot_notion_123",
        workspaceId: "ws_notion_123",
        workspaceName: "Test Notion Workspace",
        ownerType: "bot",
        ownerUserId: undefined,
        ownerUserName: "Loomii Integration",
      });

      await app.request(
        "/api/v1/integrations/notion/callback?code=auth_code_123&state=valid_state"
      );

      // Notion polling queue should have a repeatable job
      expect(mockNotionPollingQueue.add).toHaveBeenCalledTimes(1);
      const addCalls = mockNotionPollingQueue.add.mock.calls;
      const [jobName, payload, opts] = addCalls[0]!;
      expect(jobName).toBe("poll");
      expect((payload as any).tenantId).toBe("tenant_123");
      expect((payload as any).integrationId).toBe("int_notion_123");
      // Verify repeat interval is 2 minutes (120000ms)
      expect((opts as any).repeat.every).toBe(120_000);
      // Verify jobId prevents duplicates
      expect((opts as any).jobId).toBe("notion-poll-tenant_123");
    });

    it("publishes integration.connected event to queue", async () => {
      _setRedis(mockRedis as any);
      mockRedis.get.mockResolvedValue(
        JSON.stringify({ tenantId: "tenant_123", createdAt: Date.now() })
      );
      mockRedis.del.mockResolvedValue(1);

      mockExchangeNotionCode.mockResolvedValue({
        access_token: "ntn_test_access_token_123",
        token_type: "bearer",
        bot_id: "bot_notion_123",
        workspace_id: "ws_notion_123",
        workspace_name: "Test Notion Workspace",
        workspace_icon: null,
        duplicated_template_id: null,
        owner: { type: "user", user: { id: "user_notion_123", name: "Test User", avatar_url: null } },
      });
      mockVerifyNotionAccess.mockResolvedValue({
        botId: "bot_notion_123",
        workspaceId: "ws_notion_123",
        workspaceName: "Test Notion Workspace",
        ownerType: "bot",
        ownerUserId: undefined,
        ownerUserName: "Loomii Integration",
      });

      await app.request(
        "/api/v1/integrations/notion/callback?code=auth_code_123&state=valid_state"
      );

      // Events queue should have the integration.connected event
      expect(mockEventsQueue.add).toHaveBeenCalledTimes(1);
      const addCalls = mockEventsQueue.add.mock.calls;
      const [jobName, payload] = addCalls[0]!;
      expect(jobName).toBe("integration.connected");
      expect((payload as any).tenantId).toBe("tenant_123");
      expect((payload as any).eventType).toBe("integration.connected");
      expect((payload as any).data.provider).toBe("NOTION");
      expect((payload as any).data.workspaceName).toBe(
        "Test Notion Workspace"
      );
    });

    it("state token is single-use (deleted after verification)", async () => {
      _setRedis(mockRedis as any);
      mockRedis.get.mockResolvedValue(
        JSON.stringify({ tenantId: "tenant_123", createdAt: Date.now() })
      );
      mockRedis.del.mockResolvedValue(1);

      mockExchangeNotionCode.mockResolvedValue({
        access_token: "ntn_test_access_token_123",
        token_type: "bearer",
        bot_id: "bot_notion_123",
        workspace_id: "ws_notion_123",
        workspace_name: "Test Notion Workspace",
        workspace_icon: null,
        duplicated_template_id: null,
        owner: { type: "user", user: { id: "user_notion_123", name: "Test User", avatar_url: null } },
      });
      mockVerifyNotionAccess.mockResolvedValue({
        botId: "bot_notion_123",
        workspaceId: "ws_notion_123",
        workspaceName: "Test Notion Workspace",
        ownerType: "bot",
        ownerUserId: undefined,
        ownerUserName: "Loomii Integration",
      });

      await app.request(
        "/api/v1/integrations/notion/callback?code=auth_code_123&state=valid_state"
      );

      // Redis.del should have been called to consume the state
      expect(mockRedis.del).toHaveBeenCalledTimes(1);
      const delKey = mockRedis.del.mock.calls[0]![0];
      expect(delKey).toContain("oauth:notion:state:");
    });

    it("redirects to error page on token exchange failure", async () => {
      _setRedis(mockRedis as any);
      mockRedis.get.mockResolvedValue(
        JSON.stringify({ tenantId: "tenant_123", createdAt: Date.now() })
      );
      mockRedis.del.mockResolvedValue(1);

      mockExchangeNotionCode.mockRejectedValue(
        new Error("Notion token exchange failed (400)")
      );

      const res = await app.request(
        "/api/v1/integrations/notion/callback?code=bad_code&state=valid_state"
      );

      expect(res.status).toBe(302);
      const location = res.headers.get("Location")!;
      expect(location).toContain("status=error");
      expect(location).toContain("reason=exchange_failed");
    });
  });
});

describe("Notion OAuth State Management", () => {
  beforeEach(() => {
    mockRedis.set.mockReset();
    mockRedis.get.mockReset();
    mockRedis.del.mockReset();
    _setRedis(mockRedis as any);

    process.env.NOTION_CLIENT_ID = "test_notion_client";
    process.env.NOTION_CLIENT_SECRET = "test_notion_secret";
    process.env.NOTION_REDIRECT_URI =
      "http://localhost:3000/integrations/notion/callback";
  });

  it("initiateNotionOAuth generates UUID state and stores in Redis", async () => {
    mockRedis.set.mockResolvedValue("OK");

    const result = await initiateNotionOAuth("tenant_abc");

    expect(result.state).toBeDefined();
    // UUID v4 format
    expect(result.state).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(result.redirectUrl).toContain("api.notion.com/v1/oauth/authorize");

    // Verify Redis was called correctly
    expect(mockRedis.set).toHaveBeenCalledTimes(1);
    const calls = mockRedis.set.mock.calls;
    const [key, value, ex, ttl] = calls[0]!;
    expect(key).toContain("oauth:notion:state:");
    expect(value).toContain("tenant_abc");
    expect(ex).toBe("EX");
    expect(ttl).toBe(600);
  });

  it("verifyAndConsumeNotionState returns tenantId for valid state", async () => {
    mockRedis.get.mockResolvedValue(
      JSON.stringify({ tenantId: "tenant_abc", createdAt: Date.now() })
    );
    mockRedis.del.mockResolvedValue(1);

    const result = await verifyAndConsumeNotionState("valid-state");

    expect(result).not.toBeNull();
    expect(result!.tenantId).toBe("tenant_abc");
    const delKey = mockRedis.del.mock.calls[0]![0];
    expect(delKey).toBe("oauth:notion:state:valid-state");
  });

  it("verifyAndConsumeNotionState returns null for missing state", async () => {
    mockRedis.get.mockResolvedValue(null);

    const result = await verifyAndConsumeNotionState("nonexistent");

    expect(result).toBeNull();
  });

  it("verifyAndConsumeNotionState deletes state even on parse failure", async () => {
    mockRedis.get.mockResolvedValue("invalid json {{{");
    mockRedis.del.mockResolvedValue(1);

    const result = await verifyAndConsumeNotionState("bad-data-state");

    expect(result).toBeNull();
    // State should still be deleted
    const delKey = mockRedis.del.mock.calls[0]![0];
    expect(delKey).toBe("oauth:notion:state:bad-data-state");
  });
});

describe("Token Security", () => {
  it("tokens never appear in JSON responses from /connect", async () => {
    _setRedis(mockRedis as any);
    mockRedis.set.mockResolvedValue("OK");
    mockDb.integration.findUnique.mockResolvedValue(null);

    process.env.NOTION_CLIENT_ID = "test_notion_client";
    process.env.NOTION_CLIENT_SECRET = "test_notion_secret";
    process.env.NOTION_REDIRECT_URI =
      "http://localhost:3000/integrations/notion/callback";
    process.env.FRONTEND_URL = "http://localhost:5173";

    const app = createTestApp();
    const res = await app.request("/api/v1/integrations/notion/connect", {
      method: "POST",
    });

    const text = await res.text();
    // Ensure no token-like values appear
    expect(text).not.toContain("access_token");
    expect(text).not.toContain("refresh_token");
    expect(text).not.toContain("client_secret");
    expect(text).not.toContain("ntn_");
  });
});
