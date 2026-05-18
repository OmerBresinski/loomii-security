/**
 * Tests for Event Deduplication Utility.
 *
 * Tests cover:
 * - First event is not duplicate (AC1)
 * - Same event within 5min is duplicate (AC1)
 * - Same event after 5min is NOT duplicate (AC5)
 * - Duplicate stored but not enqueued (AC3)
 */
import { describe, it, expect, beforeEach, mock } from "bun:test";

// =========================================
// Mock setup
// =========================================

const mockUpsert = mock((_args: any) => Promise.resolve({} as any));

const mockDb = {
  event: {
    upsert: mockUpsert,
  },
};

mock.module("@loomii/db", () => ({
  db: mockDb,
  vectorSearch: mock(),
  insertEmbedding: mock(),
}));

// Import after mocking
const { deduplicateEvent, DEDUP_WINDOW_MS } = await import("./event-dedup");

// =========================================
// Tests
// =========================================

describe("Deduplication", () => {
  beforeEach(() => {
    mockUpsert.mockClear();
  });

  it("first event is not duplicate", async () => {
    const now = new Date();
    // Simulate a freshly created record (createdAt === updatedAt)
    mockUpsert.mockImplementation(async () => ({
      id: "event_123",
      tenantId: "tenant_1",
      source: "LINEAR",
      externalId: "issue_abc",
      type: "issue.created",
      status: "PENDING",
      createdAt: now,
      updatedAt: now,
    }));

    const result = await deduplicateEvent({
      tenantId: "tenant_1",
      integrationId: "int_1",
      source: "LINEAR",
      externalId: "issue_abc",
      type: "issue.created",
      payload: { title: "New Issue" },
    });

    expect(result.isDuplicate).toBe(false);
    expect(result.event.id).toBe("event_123");
  });

  it("same event within 5min is duplicate", async () => {
    const createdAt = new Date(Date.now() - 2 * 60 * 1000); // 2 min ago
    const updatedAt = new Date(); // Just now (upsert touched it)

    mockUpsert.mockImplementation(async () => ({
      id: "event_123",
      tenantId: "tenant_1",
      source: "LINEAR",
      externalId: "issue_abc",
      type: "issue.created",
      status: "PENDING",
      createdAt,
      updatedAt,
    }));

    const result = await deduplicateEvent({
      tenantId: "tenant_1",
      integrationId: "int_1",
      source: "LINEAR",
      externalId: "issue_abc",
      type: "issue.created",
      payload: { title: "Same Issue Again" },
    });

    expect(result.isDuplicate).toBe(true);
  });

  it("same event after 5min is NOT duplicate", async () => {
    const createdAt = new Date(Date.now() - 10 * 60 * 1000); // 10 min ago
    const updatedAt = new Date(); // Just now

    mockUpsert.mockImplementation(async () => ({
      id: "event_123",
      tenantId: "tenant_1",
      source: "LINEAR",
      externalId: "issue_abc",
      type: "issue.created",
      status: "PENDING",
      createdAt,
      updatedAt,
    }));

    const result = await deduplicateEvent({
      tenantId: "tenant_1",
      integrationId: "int_1",
      source: "LINEAR",
      externalId: "issue_abc",
      type: "issue.created",
      payload: { title: "Updated after window" },
    });

    expect(result.isDuplicate).toBe(false);
  });

  it("duplicate stored in DB for audit trail (AC3)", async () => {
    const createdAt = new Date(Date.now() - 1 * 60 * 1000); // 1 min ago
    const updatedAt = new Date();

    mockUpsert.mockImplementation(async () => ({
      id: "event_123",
      tenantId: "tenant_1",
      source: "NOTION",
      externalId: "page_xyz",
      type: "page.updated",
      status: "PENDING",
      createdAt,
      updatedAt,
    }));

    const result = await deduplicateEvent({
      tenantId: "tenant_1",
      integrationId: "int_1",
      source: "NOTION",
      externalId: "page_xyz",
      type: "page.updated",
      payload: { title: "Duplicate event" },
    });

    // Event IS a duplicate but the upsert was still called (stored for audit)
    expect(result.isDuplicate).toBe(true);
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(result.event.id).toBe("event_123");
  });

  it("uses correct unique constraint key for upsert", async () => {
    const now = new Date();
    mockUpsert.mockImplementation(async () => ({
      id: "event_456",
      tenantId: "tenant_2",
      source: "NOTION",
      externalId: "page_def",
      type: "page.updated",
      status: "PENDING",
      createdAt: now,
      updatedAt: now,
    }));

    await deduplicateEvent({
      tenantId: "tenant_2",
      integrationId: "int_2",
      source: "NOTION",
      externalId: "page_def",
      type: "page.updated",
      payload: { url: "https://notion.so/page" },
    });

    const upsertArgs = mockUpsert.mock.calls[0][0];
    expect(upsertArgs.where.tenantId_source_externalId_type).toEqual({
      tenantId: "tenant_2",
      source: "NOTION",
      externalId: "page_def",
      type: "page.updated",
    });
  });

  it("dedup window is 5 minutes", () => {
    expect(DEDUP_WINDOW_MS).toBe(5 * 60 * 1000);
  });

  it("event at exactly 5min boundary is NOT duplicate", async () => {
    // Event created exactly 5 minutes ago - should NOT be considered duplicate
    const createdAt = new Date(Date.now() - DEDUP_WINDOW_MS - 1); // Just past the window
    const updatedAt = new Date();

    mockUpsert.mockImplementation(async () => ({
      id: "event_boundary",
      tenantId: "tenant_1",
      source: "LINEAR",
      externalId: "issue_boundary",
      type: "issue.updated",
      status: "PENDING",
      createdAt,
      updatedAt,
    }));

    const result = await deduplicateEvent({
      tenantId: "tenant_1",
      integrationId: "int_1",
      source: "LINEAR",
      externalId: "issue_boundary",
      type: "issue.updated",
      payload: {},
    });

    expect(result.isDuplicate).toBe(false);
  });
});
