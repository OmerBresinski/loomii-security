/**
 * Tests for Linear Webhook Endpoint (Receive + Verify + Enqueue).
 *
 * All external dependencies (DB, Queue, crypto) are mocked.
 * Tests cover:
 * - Signature verification (valid, invalid, missing)
 * - Event storage for relevant types
 * - Ignoring irrelevant event types
 * - Duplicate detection
 * - Context assembly enqueueing
 * - Response time requirement (<500ms)
 * - Route accessible without auth
 */
import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createHmac } from "crypto";
import { Hono } from "hono";
import { linearWebhookRoute } from "./linear";

// =========================================
// Mock setup
// =========================================

const WEBHOOK_SECRET = "whsec_test_secret_for_linear_webhooks";

const mockDb = {
  integration: {
    findFirst: mock((_args: any) => Promise.resolve(null as any)),
  },
  event: {
    upsert: mock((_args: any) => Promise.resolve({} as any)),
  },
};

const mockContextAssemblyQueue = {
  add: mock((_name: string, _payload: any, _opts?: any) =>
    Promise.resolve({ id: "job_123" })
  ),
};

const mockDecrypt = mock((_text: string) => WEBHOOK_SECRET);

// Apply mocks
mock.module("@loomii/db", () => ({ db: mockDb }));
mock.module("@loomii/queue", () => ({
  contextAssemblyQueue: mockContextAssemblyQueue,
  createRedisConnection: () => ({}),
  eventsQueue: { add: mock() },
  notionPollingQueue: { add: mock() },
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
  ALL_QUEUE_NAMES: [],
}));
mock.module("@loomii/shared", () => ({
  encrypt: (text: string) => `encrypted:${text.slice(0, 8)}...`,
  decrypt: mockDecrypt,
}));

// =========================================
// Helpers
// =========================================

function createTestApp() {
  const app = new Hono();
  app.route("/webhooks/linear", linearWebhookRoute);
  return app;
}

function signPayload(body: string, secret: string = WEBHOOK_SECRET): string {
  const hmac = createHmac("sha256", secret);
  hmac.update(body);
  return hmac.digest("hex");
}

function createWebhookPayload(overrides: Partial<{
  action: string;
  type: string;
  data: Record<string, unknown>;
  organizationId: string;
  createdAt: string;
}> = {}) {
  return {
    action: overrides.action ?? "create",
    type: overrides.type ?? "Issue",
    data: overrides.data ?? { id: "issue-123", title: "Test Issue" },
    organizationId: overrides.organizationId ?? "org_linear_123",
    createdAt: overrides.createdAt ?? new Date().toISOString(),
  };
}

async function sendWebhook(
  app: ReturnType<typeof createTestApp>,
  body: string,
  signature?: string
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (signature !== undefined) {
    headers["linear-signature"] = signature;
  }

  return app.request("/webhooks/linear", {
    method: "POST",
    headers,
    body,
  });
}

// =========================================
// Tests
// =========================================

describe("Linear Webhook Endpoint", () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    app = createTestApp();
    // Reset mocks
    mockDb.integration.findFirst.mockReset();
    mockDb.event.upsert.mockReset();
    mockContextAssemblyQueue.add.mockReset();
    mockDecrypt.mockReset();

    // Default mock returns
    mockDecrypt.mockReturnValue(WEBHOOK_SECRET);
    mockDb.integration.findFirst.mockResolvedValue({
      id: "int_123",
      tenantId: "tenant_123",
      metadata: { webhookSecret: "encrypted:whsec..." },
    });
    mockContextAssemblyQueue.add.mockResolvedValue({ id: "job_123" });
  });

  describe("Signature Verification", () => {
    it("accepts valid signature and processes event", async () => {
      const payload = createWebhookPayload();
      const body = JSON.stringify(payload);
      const signature = signPayload(body);

      const now = new Date();
      mockDb.event.upsert.mockResolvedValue({
        id: "evt_123",
        createdAt: now,
        updatedAt: now,
      });

      const res = await sendWebhook(app, body, signature);

      expect(res.status).toBe(200);
      const json = (await res.json()) as { ok: boolean };
      expect(json.ok).toBe(true);
    });

    it("rejects invalid signature with 400", async () => {
      const payload = createWebhookPayload();
      const body = JSON.stringify(payload);
      const invalidSignature = "deadbeef".repeat(8);

      const res = await sendWebhook(app, body, invalidSignature);

      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe("Invalid signature");

      // No event should be stored
      expect(mockDb.event.upsert).not.toHaveBeenCalled();
      // No job should be enqueued
      expect(mockContextAssemblyQueue.add).not.toHaveBeenCalled();
    });

    it("rejects missing signature with 400", async () => {
      const payload = createWebhookPayload();
      const body = JSON.stringify(payload);

      // Send without signature header
      const res = await sendWebhook(app, body, "");

      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe("Invalid signature");
    });

    it("rejects tampered body with 400", async () => {
      const payload = createWebhookPayload();
      const originalBody = JSON.stringify(payload);
      const signature = signPayload(originalBody);

      // Tamper with the body after signing
      const tamperedPayload = { ...payload, action: "delete" };
      const tamperedBody = JSON.stringify(tamperedPayload);

      const res = await sendWebhook(app, tamperedBody, signature);

      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe("Invalid signature");
    });
  });

  describe("Event Type Filtering", () => {
    it("stores event for Issue.create", async () => {
      const payload = createWebhookPayload({
        action: "create",
        type: "Issue",
        data: { id: "issue-456", title: "New Issue" },
      });
      const body = JSON.stringify(payload);
      const signature = signPayload(body);

      const now = new Date();
      mockDb.event.upsert.mockResolvedValue({
        id: "evt_123",
        createdAt: now,
        updatedAt: now,
      });

      const res = await sendWebhook(app, body, signature);

      expect(res.status).toBe(200);
      expect(mockDb.event.upsert).toHaveBeenCalledTimes(1);

      const upsertCall = mockDb.event.upsert.mock.calls[0]![0] as any;
      expect(upsertCall.create.type).toBe("issue.created");
      expect(upsertCall.create.source).toBe("LINEAR");
      expect(upsertCall.create.externalId).toBe("issue-456");
    });

    it("stores event for Issue.update", async () => {
      const payload = createWebhookPayload({
        action: "update",
        type: "Issue",
        data: { id: "issue-789", title: "Updated Issue" },
      });
      const body = JSON.stringify(payload);
      const signature = signPayload(body);

      const now = new Date();
      mockDb.event.upsert.mockResolvedValue({
        id: "evt_123",
        createdAt: now,
        updatedAt: now,
      });

      const res = await sendWebhook(app, body, signature);

      expect(res.status).toBe(200);
      expect(mockDb.event.upsert).toHaveBeenCalledTimes(1);
      const upsertCall = mockDb.event.upsert.mock.calls[0]![0] as any;
      expect(upsertCall.create.type).toBe("issue.updated");
    });

    it("stores event for Comment.create", async () => {
      const payload = createWebhookPayload({
        action: "create",
        type: "Comment",
        data: { id: "comment-123", body: "Test comment" },
      });
      const body = JSON.stringify(payload);
      const signature = signPayload(body);

      const now = new Date();
      mockDb.event.upsert.mockResolvedValue({
        id: "evt_123",
        createdAt: now,
        updatedAt: now,
      });

      const res = await sendWebhook(app, body, signature);

      expect(res.status).toBe(200);
      expect(mockDb.event.upsert).toHaveBeenCalledTimes(1);
      const upsertCall = mockDb.event.upsert.mock.calls[0]![0] as any;
      expect(upsertCall.create.type).toBe("comment.created");
    });

    it("stores event for Project.update", async () => {
      const payload = createWebhookPayload({
        action: "update",
        type: "Project",
        data: { id: "project-123", name: "Updated Project" },
      });
      const body = JSON.stringify(payload);
      const signature = signPayload(body);

      const now = new Date();
      mockDb.event.upsert.mockResolvedValue({
        id: "evt_123",
        createdAt: now,
        updatedAt: now,
      });

      const res = await sendWebhook(app, body, signature);

      expect(res.status).toBe(200);
      expect(mockDb.event.upsert).toHaveBeenCalledTimes(1);
      const upsertCall = mockDb.event.upsert.mock.calls[0]![0] as any;
      expect(upsertCall.create.type).toBe("project.updated");
    });

    it("ignores irrelevant event types with 200 (no storage)", async () => {
      const payload = createWebhookPayload({
        action: "remove",
        type: "Issue",
        data: { id: "issue-deleted" },
      });
      const body = JSON.stringify(payload);
      const signature = signPayload(body);

      const res = await sendWebhook(app, body, signature);

      expect(res.status).toBe(200);
      const json = (await res.json()) as { ok: boolean };
      expect(json.ok).toBe(true);
      // Nothing should be stored or enqueued
      expect(mockDb.event.upsert).not.toHaveBeenCalled();
      expect(mockContextAssemblyQueue.add).not.toHaveBeenCalled();
    });

    it("ignores Comment.update with 200", async () => {
      const payload = createWebhookPayload({
        action: "update",
        type: "Comment",
        data: { id: "comment-123" },
      });
      const body = JSON.stringify(payload);
      const signature = signPayload(body);

      const res = await sendWebhook(app, body, signature);

      expect(res.status).toBe(200);
      expect(mockDb.event.upsert).not.toHaveBeenCalled();
    });
  });

  describe("Deduplication", () => {
    it("detects duplicate events and does NOT enqueue context assembly", async () => {
      const payload = createWebhookPayload({
        action: "update",
        type: "Issue",
        data: { id: "issue-dup" },
      });
      const body = JSON.stringify(payload);
      const signature = signPayload(body);

      // Simulate duplicate: updatedAt is much later than createdAt
      mockDb.event.upsert.mockResolvedValue({
        id: "evt_existing",
        createdAt: new Date("2026-05-17T20:00:00.000Z"),
        updatedAt: new Date("2026-05-17T22:00:00.000Z"),
      });

      const res = await sendWebhook(app, body, signature);

      expect(res.status).toBe(200);
      // Event was upserted (updated existing)
      expect(mockDb.event.upsert).toHaveBeenCalledTimes(1);
      // But context assembly should NOT be enqueued
      expect(mockContextAssemblyQueue.add).not.toHaveBeenCalled();
    });

    it("enqueues context assembly for new (non-duplicate) events", async () => {
      const payload = createWebhookPayload({
        action: "create",
        type: "Issue",
        data: { id: "issue-new-123" },
      });
      const body = JSON.stringify(payload);
      const signature = signPayload(body);

      // New event: createdAt === updatedAt
      const now = new Date();
      mockDb.event.upsert.mockResolvedValue({
        id: "evt_new_456",
        createdAt: now,
        updatedAt: now,
      });

      const res = await sendWebhook(app, body, signature);

      expect(res.status).toBe(200);
      expect(mockContextAssemblyQueue.add).toHaveBeenCalledTimes(1);

      const [jobName, jobPayload, opts] =
        mockContextAssemblyQueue.add.mock.calls[0]!;
      expect(jobName).toBe("assemble");
      expect((jobPayload as any).eventId).toBe("evt_new_456");
      expect((jobPayload as any).tenantId).toBe("tenant_123");
      expect((jobPayload as any).sourceType).toBe("linear");
      expect((jobPayload as any).sourceId).toBe("issue-new-123");
      // Debounce: jobId prevents duplicate jobs, 60s delay
      expect((opts as any).jobId).toBe("assemble:tenant_123:issue-new-123");
      expect((opts as any).delay).toBe(60_000);
    });
  });

  describe("Response Time", () => {
    it("responds within 500ms", async () => {
      const payload = createWebhookPayload();
      const body = JSON.stringify(payload);
      const signature = signPayload(body);

      const now = new Date();
      mockDb.event.upsert.mockResolvedValue({
        id: "evt_123",
        createdAt: now,
        updatedAt: now,
      });

      const start = Date.now();
      const res = await sendWebhook(app, body, signature);
      const elapsed = Date.now() - start;

      expect(res.status).toBe(200);
      expect(elapsed).toBeLessThan(500);
    });
  });

  describe("Public Access (No Auth)", () => {
    it("accessible without auth token", async () => {
      const payload = createWebhookPayload();
      const body = JSON.stringify(payload);
      const signature = signPayload(body);

      const now = new Date();
      mockDb.event.upsert.mockResolvedValue({
        id: "evt_123",
        createdAt: now,
        updatedAt: now,
      });

      // No Authorization header
      const res = await app.request("/webhooks/linear", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "linear-signature": signature,
        },
        body,
      });

      expect(res.status).toBe(200);
    });
  });

  describe("Edge Cases", () => {
    it("returns 400 for invalid JSON body", async () => {
      const res = await app.request("/webhooks/linear", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "linear-signature": "some-signature",
        },
        body: "not valid json {{{",
      });

      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe("Invalid JSON body");
    });

    it("returns 400 for missing organizationId", async () => {
      const body = JSON.stringify({
        action: "create",
        type: "Issue",
        data: { id: "issue-123" },
        // No organizationId
      });
      const signature = signPayload(body);

      const res = await sendWebhook(app, body, signature);

      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe("Missing organizationId");
    });

    it("returns 404 when no matching integration found", async () => {
      mockDb.integration.findFirst.mockResolvedValue(null);

      const payload = createWebhookPayload({
        organizationId: "org_unknown",
      });
      const body = JSON.stringify(payload);
      const signature = signPayload(body);

      const res = await sendWebhook(app, body, signature);

      expect(res.status).toBe(404);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe("Integration not found");
    });
  });
});

describe("Webhook Signature Verification (unit)", () => {
  it("verifyWebhookSignature returns true for valid signature", async () => {
    // Import the actual function (it uses crypto, not mocked)
    const { verifyWebhookSignature } = await import(
      "../../lib/webhook-verify"
    );

    const body = '{"test":"data"}';
    const secret = "my-secret";
    const hmac = createHmac("sha256", secret);
    hmac.update(body);
    const signature = hmac.digest("hex");

    expect(verifyWebhookSignature(body, signature, secret)).toBe(true);
  });

  it("verifyWebhookSignature returns false for invalid signature", async () => {
    const { verifyWebhookSignature } = await import(
      "../../lib/webhook-verify"
    );

    const body = '{"test":"data"}';
    const secret = "my-secret";

    expect(
      verifyWebhookSignature(body, "invalid_hex_signature", secret)
    ).toBe(false);
  });

  it("verifyWebhookSignature returns false for empty signature", async () => {
    const { verifyWebhookSignature } = await import(
      "../../lib/webhook-verify"
    );

    expect(verifyWebhookSignature("body", "", "secret")).toBe(false);
  });

  it("verifyWebhookSignature returns false for empty secret", async () => {
    const { verifyWebhookSignature } = await import(
      "../../lib/webhook-verify"
    );

    expect(verifyWebhookSignature("body", "abcd1234", "")).toBe(false);
  });
});
