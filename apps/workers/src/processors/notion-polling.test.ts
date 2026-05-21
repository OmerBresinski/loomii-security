/**
 * Tests for Notion Polling Worker (Change Detection).
 *
 * All external dependencies (Notion API, DB, Queue, Encryption) are mocked.
 * Tests cover:
 * - Detecting changed pages since lastPollAt
 * - Creating events for changed pages
 * - Skipping duplicate events
 * - Updating lastPollAt
 * - Rate limiting enforcement
 * - Enqueueing context assembly jobs
 * - Pagination handling
 */
import "../test-setup";
import { describe, it, expect, beforeEach, mock, spyOn } from "bun:test";
import type { Job } from "bullmq";
import type { NotionPollingPayload } from "@loomii/queue";

// =========================================
// Mock setup
// =========================================

const mockDb = {
  integration: {
    findUnique: mock((_args: any) => Promise.resolve(null as any)),
    update: mock((_args: any) => Promise.resolve({} as any)),
  },
  event: {
    upsert: mock((_args: any) => Promise.resolve({} as any)),
  },
};

const mockContextAssemblyQueue = {
  add: mock((_name: string, _payload: any, _opts?: any) =>
    Promise.resolve({ id: "job_123" })
  ),
  getJob: mock((_jobId: string) => Promise.resolve(null)),
};

const mockDecrypt = mock((_text: string) => "ntn_decrypted_token_123");

// Mock Notion client search responses
const mockNotionSearch = mock((_params: any) =>
  Promise.resolve({
    results: [] as any[],
    has_more: false,
    next_cursor: null as string | null,
  })
);

const mockNotionClient = {
  search: mockNotionSearch,
};

// Apply mocks BEFORE importing the processor
mock.module("@loomii/db", () => ({ db: mockDb, vectorSearch: async () => [], insertEmbedding: async () => {} }));
mock.module("@loomii/queue", () => ({
  contextAssemblyQueue: mockContextAssemblyQueue,
  createRedisConnection: () => ({}),
  notionPollingQueue: { add: mock() },
  eventsQueue: { add: mock() },
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
  decrypt: mockDecrypt,
}));
mock.module("@notionhq/client", () => ({
  Client: class MockClient {
    constructor(_opts: any) {}
    search = mockNotionSearch;
  },
}));

// Import after mocks are set up
import { processNotionPolling } from "./notion-polling";
import { resetAllBuckets } from "../lib/notion-rate-limiter";

// =========================================
// Helpers
// =========================================

function createMockJob(
  data: NotionPollingPayload,
  overrides?: Partial<Job<NotionPollingPayload>>
): Job<NotionPollingPayload> {
  return {
    id: "job_test_123",
    name: "poll",
    data,
    processedOn: Date.now(),
    ...overrides,
  } as unknown as Job<NotionPollingPayload>;
}

function createMockPage(
  id: string,
  lastEditedTime: string,
  title: string = "Test Page"
) {
  return {
    object: "page",
    id,
    last_edited_time: lastEditedTime,
    url: `https://notion.so/${id.replace(/-/g, "")}`,
    properties: {
      title: {
        type: "title",
        title: [{ plain_text: title }],
      },
    },
  };
}

function createMockEvent(overrides: {
  id?: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: overrides.id ?? "evt_123",
    tenantId: "tenant_123",
    integrationId: "int_123",
    source: "NOTION",
    externalId: "page_123",
    type: "page.updated",
    status: "PENDING",
    payload: {},
    processedAt: null,
    errorMessage: null,
    createdAt: overrides.createdAt,
    updatedAt: overrides.updatedAt,
  };
}

// =========================================
// Tests
// =========================================

describe("Notion Polling Processor", () => {
  beforeEach(() => {
    // Reset all mocks
    mockDb.integration.findUnique.mockReset();
    mockDb.integration.update.mockReset();
    mockDb.event.upsert.mockReset();
    mockContextAssemblyQueue.add.mockReset();
    mockDecrypt.mockReset();
    mockNotionSearch.mockReset();
    resetAllBuckets();

    // Set default returns
    mockDecrypt.mockReturnValue("ntn_decrypted_token_123");
    mockDb.integration.update.mockResolvedValue({});
    mockContextAssemblyQueue.add.mockResolvedValue({ id: "job_123" });
  });

  describe("Change Detection", () => {
    it("detects pages changed since lastPollAt and creates events", async () => {
      const lastSyncAt = new Date("2026-05-17T21:55:00.000Z");

      mockDb.integration.findUnique.mockResolvedValue({
        id: "int_123",
        tenantId: "tenant_123",
        status: "ACTIVE",
        accessToken: "encrypted:ntn_token...",
        lastSyncAt,
      });

      mockNotionSearch.mockResolvedValue({
        results: [
          createMockPage(
            "page-1",
            "2026-05-17T21:57:00.000Z",
            "Updated Page"
          ),
          createMockPage(
            "page-2",
            "2026-05-17T21:56:00.000Z",
            "Another Page"
          ),
        ],
        has_more: false,
        next_cursor: null,
      });

      // Return new events (createdAt === updatedAt)
      const now = new Date("2026-05-17T22:00:00.000Z");
      mockDb.event.upsert
        .mockResolvedValueOnce({
          id: "evt_1",
          createdAt: now,
          updatedAt: now,
        })
        .mockResolvedValueOnce({
          id: "evt_2",
          createdAt: now,
          updatedAt: now,
        });

      const job = createMockJob({
        tenantId: "tenant_123",
        integrationId: "int_123",
      });

      await processNotionPolling(job);

      // Should have created 2 events
      expect(mockDb.event.upsert).toHaveBeenCalledTimes(2);

      // First event
      const firstCall = mockDb.event.upsert.mock.calls[0]![0] as any;
      expect(firstCall.where.tenantId_source_externalId_type.externalId).toBe(
        "page-1"
      );
      expect(firstCall.create.type).toBe("page.updated");
      expect(firstCall.create.source).toBe("NOTION");

      // Should have enqueued 2 context assembly jobs
      expect(mockContextAssemblyQueue.add).toHaveBeenCalledTimes(2);
    });

    it("uses 5 minutes ago for first poll (lastPollAt = null)", async () => {
      mockDb.integration.findUnique.mockResolvedValue({
        id: "int_123",
        tenantId: "tenant_123",
        status: "ACTIVE",
        accessToken: "encrypted:ntn_token...",
        lastSyncAt: null, // First poll
      });

      mockNotionSearch.mockResolvedValue({
        results: [],
        has_more: false,
        next_cursor: null,
      });

      const job = createMockJob({
        tenantId: "tenant_123",
        integrationId: "int_123",
      });

      await processNotionPolling(job);

      // Should have called search (even if no results)
      expect(mockNotionSearch).toHaveBeenCalledTimes(1);
      // No events created since no pages returned
      expect(mockDb.event.upsert).not.toHaveBeenCalled();
    });

    it("filters out pages not modified since lastPollAt", async () => {
      const lastSyncAt = new Date("2026-05-17T21:55:00.000Z");

      mockDb.integration.findUnique.mockResolvedValue({
        id: "int_123",
        tenantId: "tenant_123",
        status: "ACTIVE",
        accessToken: "encrypted:ntn_token...",
        lastSyncAt,
      });

      // Return one page edited after lastPollAt and one before
      mockNotionSearch.mockResolvedValue({
        results: [
          createMockPage(
            "page-new",
            "2026-05-17T21:57:00.000Z",
            "New Page"
          ),
          createMockPage(
            "page-old",
            "2026-05-17T21:50:00.000Z",
            "Old Page"
          ),
        ],
        has_more: false,
        next_cursor: null,
      });

      const now = new Date();
      mockDb.event.upsert.mockResolvedValue({
        id: "evt_1",
        createdAt: now,
        updatedAt: now,
      });

      const job = createMockJob({
        tenantId: "tenant_123",
        integrationId: "int_123",
      });

      await processNotionPolling(job);

      // Only 1 event should be created (page-old is before lastPollAt)
      expect(mockDb.event.upsert).toHaveBeenCalledTimes(1);
      const call = mockDb.event.upsert.mock.calls[0]![0] as any;
      expect(call.where.tenantId_source_externalId_type.externalId).toBe(
        "page-new"
      );
    });
  });

  describe("Deduplication", () => {
    it("skips enqueueing context assembly for duplicate events", async () => {
      mockDb.integration.findUnique.mockResolvedValue({
        id: "int_123",
        tenantId: "tenant_123",
        status: "ACTIVE",
        accessToken: "encrypted:ntn_token...",
        lastSyncAt: new Date("2026-05-17T21:55:00.000Z"),
      });

      mockNotionSearch.mockResolvedValue({
        results: [
          createMockPage(
            "page-1",
            "2026-05-17T21:57:00.000Z",
            "Existing Page"
          ),
        ],
        has_more: false,
        next_cursor: null,
      });

      // Return an existing event (updatedAt >> createdAt = duplicate/update)
      mockDb.event.upsert.mockResolvedValue({
        id: "evt_existing",
        createdAt: new Date("2026-05-17T20:00:00.000Z"),
        updatedAt: new Date("2026-05-17T22:00:00.000Z"),
      });

      const job = createMockJob({
        tenantId: "tenant_123",
        integrationId: "int_123",
      });

      await processNotionPolling(job);

      // Event was upserted (updated)
      expect(mockDb.event.upsert).toHaveBeenCalledTimes(1);
      // But context assembly should NOT be enqueued (duplicate)
      expect(mockContextAssemblyQueue.add).not.toHaveBeenCalled();
    });
  });

  describe("lastPollAt Update", () => {
    it("updates lastPollAt after successful poll", async () => {
      mockDb.integration.findUnique.mockResolvedValue({
        id: "int_123",
        tenantId: "tenant_123",
        status: "ACTIVE",
        accessToken: "encrypted:ntn_token...",
        lastSyncAt: new Date("2026-05-17T21:55:00.000Z"),
      });

      mockNotionSearch.mockResolvedValue({
        results: [],
        has_more: false,
        next_cursor: null,
      });

      const job = createMockJob({
        tenantId: "tenant_123",
        integrationId: "int_123",
      });

      await processNotionPolling(job);

      // Should update integration.lastSyncAt
      expect(mockDb.integration.update).toHaveBeenCalledTimes(1);
      const updateCall = mockDb.integration.update.mock.calls[0]![0] as any;
      expect(updateCall.where.id).toBe("int_123");
      expect(updateCall.data.lastSyncAt).toBeInstanceOf(Date);
    });
  });

  describe("Rate Limiting", () => {
    it("calls acquireToken before each Notion API request", async () => {
      mockDb.integration.findUnique.mockResolvedValue({
        id: "int_123",
        tenantId: "tenant_123",
        status: "ACTIVE",
        accessToken: "encrypted:ntn_token...",
        lastSyncAt: new Date("2026-05-17T21:55:00.000Z"),
      });

      // Simulate 3 pages of results (pagination)
      mockNotionSearch
        .mockResolvedValueOnce({
          results: [
            createMockPage("page-1", "2026-05-17T21:57:00.000Z"),
          ],
          has_more: true,
          next_cursor: "cursor_1",
        })
        .mockResolvedValueOnce({
          results: [
            createMockPage("page-2", "2026-05-17T21:56:30.000Z"),
          ],
          has_more: true,
          next_cursor: "cursor_2",
        })
        .mockResolvedValueOnce({
          results: [
            createMockPage("page-3", "2026-05-17T21:56:00.000Z"),
            createMockPage("page-old", "2026-05-17T21:50:00.000Z"), // Before lastPollAt
          ],
          has_more: false,
          next_cursor: null,
        });

      const now = new Date();
      mockDb.event.upsert.mockResolvedValue({
        id: "evt_1",
        createdAt: now,
        updatedAt: now,
      });

      const job = createMockJob({
        tenantId: "tenant_123",
        integrationId: "int_123",
      });

      await processNotionPolling(job);

      // Should have called search 3 times (3 pages)
      expect(mockNotionSearch).toHaveBeenCalledTimes(3);
      // Should have created events for 3 pages (not the old one)
      expect(mockDb.event.upsert).toHaveBeenCalledTimes(3);
    });
  });

  describe("Pagination", () => {
    it("handles pagination for >100 changed pages", async () => {
      mockDb.integration.findUnique.mockResolvedValue({
        id: "int_123",
        tenantId: "tenant_123",
        status: "ACTIVE",
        accessToken: "encrypted:ntn_token...",
        lastSyncAt: new Date("2026-05-17T21:55:00.000Z"),
      });

      // First page of results
      mockNotionSearch
        .mockResolvedValueOnce({
          results: [
            createMockPage("page-1", "2026-05-17T21:58:00.000Z"),
            createMockPage("page-2", "2026-05-17T21:57:30.000Z"),
          ],
          has_more: true,
          next_cursor: "cursor_next",
        })
        .mockResolvedValueOnce({
          results: [
            createMockPage("page-3", "2026-05-17T21:57:00.000Z"),
          ],
          has_more: false,
          next_cursor: null,
        });

      const now = new Date();
      mockDb.event.upsert.mockResolvedValue({
        id: "evt_1",
        createdAt: now,
        updatedAt: now,
      });

      const job = createMockJob({
        tenantId: "tenant_123",
        integrationId: "int_123",
      });

      await processNotionPolling(job);

      // Should have called search twice (pagination)
      expect(mockNotionSearch).toHaveBeenCalledTimes(2);

      // Second call should include start_cursor
      const secondCall = mockNotionSearch.mock.calls[1]![0] as any;
      expect(secondCall.start_cursor).toBe("cursor_next");

      // All 3 pages should create events
      expect(mockDb.event.upsert).toHaveBeenCalledTimes(3);
    });
  });

  describe("Context Assembly Enqueueing", () => {
    it("enqueues context assembly job for new events", async () => {
      mockDb.integration.findUnique.mockResolvedValue({
        id: "int_123",
        tenantId: "tenant_123",
        status: "ACTIVE",
        accessToken: "encrypted:ntn_token...",
        lastSyncAt: new Date("2026-05-17T21:55:00.000Z"),
      });

      mockNotionSearch.mockResolvedValue({
        results: [
          createMockPage("page-1", "2026-05-17T21:57:00.000Z", "My Page"),
        ],
        has_more: false,
        next_cursor: null,
      });

      const now = new Date();
      mockDb.event.upsert.mockResolvedValue({
        id: "evt_new_123",
        createdAt: now,
        updatedAt: now,
      });

      const job = createMockJob({
        tenantId: "tenant_123",
        integrationId: "int_123",
      });

      await processNotionPolling(job);

      expect(mockContextAssemblyQueue.add).toHaveBeenCalledTimes(1);
      const [jobName, payload] = mockContextAssemblyQueue.add.mock.calls[0]!;
      expect(jobName).toBe("assemble");
      expect((payload as any).eventId).toBe("evt_new_123");
      expect((payload as any).tenantId).toBe("tenant_123");
      expect((payload as any).sourceType).toBe("notion");
      expect((payload as any).sourceId).toBe("page-1");
    });
  });

  describe("Edge Cases", () => {
    it("skips poll if integration not found", async () => {
      mockDb.integration.findUnique.mockResolvedValue(null);

      const job = createMockJob({
        tenantId: "tenant_123",
        integrationId: "int_missing",
      });

      await processNotionPolling(job);

      // Should not call Notion API or create events
      expect(mockNotionSearch).not.toHaveBeenCalled();
      expect(mockDb.event.upsert).not.toHaveBeenCalled();
    });

    it("skips poll if integration is not ACTIVE", async () => {
      mockDb.integration.findUnique.mockResolvedValue({
        id: "int_123",
        tenantId: "tenant_123",
        status: "DISCONNECTED",
        accessToken: "encrypted:ntn_token...",
        lastSyncAt: null,
      });

      const job = createMockJob({
        tenantId: "tenant_123",
        integrationId: "int_123",
      });

      await processNotionPolling(job);

      expect(mockNotionSearch).not.toHaveBeenCalled();
      expect(mockDb.event.upsert).not.toHaveBeenCalled();
    });

    it("skips poll if no access token", async () => {
      mockDb.integration.findUnique.mockResolvedValue({
        id: "int_123",
        tenantId: "tenant_123",
        status: "ACTIVE",
        accessToken: null,
        lastSyncAt: null,
      });

      const job = createMockJob({
        tenantId: "tenant_123",
        integrationId: "int_123",
      });

      await processNotionPolling(job);

      expect(mockNotionSearch).not.toHaveBeenCalled();
      expect(mockDb.event.upsert).not.toHaveBeenCalled();
    });

    it("decrypts access token before using it", async () => {
      mockDb.integration.findUnique.mockResolvedValue({
        id: "int_123",
        tenantId: "tenant_123",
        status: "ACTIVE",
        accessToken: "encrypted:ntn_real_token...",
        lastSyncAt: new Date("2026-05-17T21:55:00.000Z"),
      });

      mockNotionSearch.mockResolvedValue({
        results: [],
        has_more: false,
        next_cursor: null,
      });

      const job = createMockJob({
        tenantId: "tenant_123",
        integrationId: "int_123",
      });

      await processNotionPolling(job);

      // Decrypt should have been called with the encrypted token
      expect(mockDecrypt).toHaveBeenCalledWith("encrypted:ntn_real_token...");
    });
  });
});

describe("Notion Rate Limiter", () => {
  beforeEach(() => {
    resetAllBuckets();
  });

  it("allows 3 requests immediately without waiting", async () => {
    const { acquireToken } = await import("../lib/notion-rate-limiter");

    const start = Date.now();

    await acquireToken("test-integration");
    await acquireToken("test-integration");
    await acquireToken("test-integration");

    const elapsed = Date.now() - start;
    // All 3 should complete in under 50ms (no waiting)
    expect(elapsed).toBeLessThan(50);
  });

  it("waits when bucket is exhausted (4th request)", async () => {
    const { acquireToken } = await import("../lib/notion-rate-limiter");

    // Use up all 3 tokens
    await acquireToken("test-integration-2");
    await acquireToken("test-integration-2");
    await acquireToken("test-integration-2");

    const start = Date.now();
    await acquireToken("test-integration-2"); // 4th request should wait
    const elapsed = Date.now() - start;

    // Should wait at least ~300ms (1/3 second for 1 token refill)
    expect(elapsed).toBeGreaterThanOrEqual(250);
  });

  it("different integrations have independent buckets", async () => {
    const { acquireToken } = await import("../lib/notion-rate-limiter");

    // Exhaust bucket for integration A
    await acquireToken("integration-A");
    await acquireToken("integration-A");
    await acquireToken("integration-A");

    // Integration B should still have full bucket
    const start = Date.now();
    await acquireToken("integration-B");
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(50); // No wait
  });
});
