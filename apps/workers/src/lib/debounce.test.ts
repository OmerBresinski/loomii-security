/**
 * Tests for Debounce Utility.
 *
 * Tests cover:
 * - Uses consistent jobId for same entity (AC2)
 * - Sets 60s delay on assembly job (AC4)
 * - Multiple enqueues for same entity -> replaces pending job (AC2)
 * - Different entities get different jobIds (AC5)
 * - getDebounceJobId generates correct format
 */
import "../test-setup";
import { describe, it, expect, beforeEach, mock } from "bun:test";

// =========================================
// Mock setup
// =========================================

const mockQueueAdd = mock(async (_name: string, _data: any, _opts: any) => ({
  id: "job_123",
  name: "match",
}));

const mockGetJob = mock(async (_jobId: string) => null as any);

const mockProjectMatchingQueue = {
  add: mockQueueAdd,
  getJob: mockGetJob,
};

mock.module("@loomii/queue", () => ({
  projectMatchingQueue: mockProjectMatchingQueue,
  QUEUE_NAMES: {
    CONTEXT_ASSEMBLY: "context-assembly",
    RISK_CLASSIFICATION: "risk-classification",
    EMBEDDING_GENERATION: "embedding-generation",
    NOTION_POLLING: "notion-polling",
    INTEGRATION_HEALTH: "integration-health",
    REVIEW_GENERATION: "review-generation",
    THREAT_MODEL_UPDATE: "threat-model-update",
    SUMMARY_GENERATION: "summary-generation",
    PROJECT_MATCHING: "project-matching",
    EVENTS: "events",
  },
}));

// Import after mocking
const { enqueueWithDebounce, getDebounceJobId, DEBOUNCE_DELAY_MS } =
  await import("./debounce");

// =========================================
// Tests
// =========================================

describe("Debouncing", () => {
  beforeEach(() => {
    mockQueueAdd.mockClear();
    mockGetJob.mockClear();
  });

  it("uses consistent jobId for same entity", async () => {
    const payload = {
      eventId: "evt_1",
      tenantId: "tenant_1",
      sourceType: "linear" as const,
      sourceId: "LOO-123",
      content: "test content",
    };

    await enqueueWithDebounce(payload);

    expect(mockQueueAdd).toHaveBeenCalledTimes(1);
    const opts = mockQueueAdd.mock.calls[0][2];
    expect(opts.jobId).toBe("match:tenant_1:LOO-123");
  });

  it("sets 60s delay on matching job", async () => {
    const payload = {
      eventId: "evt_1",
      tenantId: "tenant_1",
      sourceType: "notion" as const,
      sourceId: "page_abc",
      content: "test content",
    };

    await enqueueWithDebounce(payload);

    const opts = mockQueueAdd.mock.calls[0][2];
    expect(opts.delay).toBe(60_000);
  });

  it("removes existing delayed job before re-adding (replaces payload)", async () => {
    const mockRemove = mock(async () => {});
    const mockGetState = mock(async () => "delayed");

    // Simulate existing job in delayed state
    mockGetJob.mockImplementation(async () => ({
      id: "job_existing",
      remove: mockRemove,
      getState: mockGetState,
    }));

    const payload = {
      eventId: "evt_2",
      tenantId: "tenant_1",
      sourceType: "linear" as const,
      sourceId: "LOO-123",
      content: "updated content",
    };

    await enqueueWithDebounce(payload);

    // Should have removed the existing job
    expect(mockRemove).toHaveBeenCalledTimes(1);
    // And added a new one with the updated payload
    expect(mockQueueAdd).toHaveBeenCalledTimes(1);
    expect(mockQueueAdd.mock.calls[0][1].eventId).toBe("evt_2");
  });

  it("does NOT remove active jobs (only delayed/waiting)", async () => {
    const mockRemove = mock(async () => {});
    const mockGetState = mock(async () => "active");

    mockGetJob.mockImplementation(async () => ({
      id: "job_active",
      remove: mockRemove,
      getState: mockGetState,
    }));

    const payload = {
      eventId: "evt_3",
      tenantId: "tenant_1",
      sourceType: "linear" as const,
      sourceId: "LOO-123",
      content: "test content",
    };

    await enqueueWithDebounce(payload);

    // Should NOT remove an active job
    expect(mockRemove).not.toHaveBeenCalled();
    // But should still try to add the new one
    expect(mockQueueAdd).toHaveBeenCalledTimes(1);
  });

  it("different entities get different jobIds", async () => {
    // No existing jobs
    mockGetJob.mockImplementation(async () => null);

    await enqueueWithDebounce({
      eventId: "evt_1",
      tenantId: "tenant_1",
      sourceType: "linear" as const,
      sourceId: "LOO-100",
      content: "content a",
    });

    await enqueueWithDebounce({
      eventId: "evt_2",
      tenantId: "tenant_1",
      sourceType: "linear" as const,
      sourceId: "LOO-200",
      content: "content b",
    });

    const opts1 = mockQueueAdd.mock.calls[0][2];
    const opts2 = mockQueueAdd.mock.calls[1][2];

    expect(opts1.jobId).toBe("match:tenant_1:LOO-100");
    expect(opts2.jobId).toBe("match:tenant_1:LOO-200");
    expect(opts1.jobId).not.toBe(opts2.jobId);
  });

  it("different tenants for same entity get different jobIds", async () => {
    mockGetJob.mockImplementation(async () => null);

    await enqueueWithDebounce({
      eventId: "evt_1",
      tenantId: "tenant_A",
      sourceType: "linear" as const,
      sourceId: "LOO-100",
      content: "content",
    });

    await enqueueWithDebounce({
      eventId: "evt_2",
      tenantId: "tenant_B",
      sourceType: "linear" as const,
      sourceId: "LOO-100",
      content: "content",
    });

    const opts1 = mockQueueAdd.mock.calls[0][2];
    const opts2 = mockQueueAdd.mock.calls[1][2];

    expect(opts1.jobId).toBe("match:tenant_A:LOO-100");
    expect(opts2.jobId).toBe("match:tenant_B:LOO-100");
  });

  it("allows custom delay override for testing", async () => {
    mockGetJob.mockImplementation(async () => null);

    await enqueueWithDebounce(
      {
        eventId: "evt_1",
        tenantId: "tenant_1",
        sourceType: "linear" as const,
        sourceId: "LOO-100",
        content: "content",
      },
      { delayMs: 5000 }
    );

    const opts = mockQueueAdd.mock.calls[0][2];
    expect(opts.delay).toBe(5000);
  });

  describe("getDebounceJobId", () => {
    it("generates correct format", () => {
      expect(getDebounceJobId("tenant_1", "LOO-123")).toBe("match:tenant_1:LOO-123");
    });

    it("handles Notion page IDs", () => {
      expect(getDebounceJobId("tenant_1", "abc123-def456")).toBe(
        "match:tenant_1:abc123-def456"
      );
    });
  });

  it("DEBOUNCE_DELAY_MS is 60 seconds", () => {
    expect(DEBOUNCE_DELAY_MS).toBe(60_000);
  });
});
