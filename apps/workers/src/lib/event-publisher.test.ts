/**
 * Tests for Event Publishing Module.
 *
 * Tests cover:
 * - HIGH -> review-generation queue only (AC1)
 * - LOW -> events queue only, no review (AC2)
 * - CRITICAL -> both review + alert (AC3)
 * - Events contain complete payloads (AC4)
 * - Priority ordering correct (AC5)
 * - Integration events publish correctly
 * - Assembly failed events publish correctly
 */
import "../test-setup";
import { describe, it, expect, beforeEach, mock } from "bun:test";

// =========================================
// Mock setup
// =========================================

const mockReviewQueueAdd = mock(async (_name: string, _data: any, _opts?: any) => ({
  id: "review_job_123",
}));

const mockEventsQueueAdd = mock(async (_name: string, _data: any) => ({
  id: "event_job_123",
}));

mock.module("@loomii/queue", () => ({
  reviewQueue: { add: mockReviewQueueAdd },
  eventsQueue: { add: mockEventsQueueAdd },
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

// Import after mocking
const {
  publishRiskEvents,
  publishIntegrationEvent,
  publishAssemblyFailed,
  RISK_PRIORITY,
} = await import("./event-publisher");

// =========================================
// Tests
// =========================================

describe("Event Publisher", () => {
  beforeEach(() => {
    mockReviewQueueAdd.mockClear();
    mockEventsQueueAdd.mockClear();
  });

  describe("publishRiskEvents", () => {
    it("HIGH -> review-generation queue only (AC1)", async () => {
      const result = await publishRiskEvents({
        bundleId: "bundle_123",
        riskLevel: "HIGH",
        tenantId: "tenant_1",
        reasoning: "New API endpoint exposed",
      });

      // Should publish to review-generation
      expect(mockReviewQueueAdd).toHaveBeenCalledTimes(1);
      // Should NOT publish to events queue
      expect(mockEventsQueueAdd).not.toHaveBeenCalled();

      expect(result.published).toEqual(["review-generation"]);
      expect(result.failed).toHaveLength(0);
    });

    it("LOW -> events queue only, no review (AC2)", async () => {
      const result = await publishRiskEvents({
        bundleId: "bundle_456",
        riskLevel: "LOW",
        tenantId: "tenant_1",
        reasoning: "Minor UI change",
      });

      // Should NOT publish to review-generation
      expect(mockReviewQueueAdd).not.toHaveBeenCalled();
      // Should publish to events queue
      expect(mockEventsQueueAdd).toHaveBeenCalledTimes(1);
      expect(mockEventsQueueAdd.mock.calls[0][0]).toBe("classified-low");

      expect(result.published).toEqual(["events:classified-low"]);
      expect(result.failed).toHaveLength(0);
    });

    it("CRITICAL -> both review + alert (AC3)", async () => {
      const result = await publishRiskEvents({
        bundleId: "bundle_789",
        riskLevel: "CRITICAL",
        tenantId: "tenant_1",
        reasoning: "Auth bypass vulnerability",
      });

      // Should publish to BOTH queues
      expect(mockReviewQueueAdd).toHaveBeenCalledTimes(1);
      expect(mockEventsQueueAdd).toHaveBeenCalledTimes(1);
      expect(mockEventsQueueAdd.mock.calls[0][0]).toBe("critical-alert");

      expect(result.published).toContain("review-generation");
      expect(result.published).toContain("events:critical-alert");
      expect(result.failed).toHaveLength(0);
    });

    it("MEDIUM -> review-generation queue only", async () => {
      const result = await publishRiskEvents({
        bundleId: "bundle_med",
        riskLevel: "MEDIUM",
        tenantId: "tenant_1",
      });

      expect(mockReviewQueueAdd).toHaveBeenCalledTimes(1);
      expect(mockEventsQueueAdd).not.toHaveBeenCalled();
      expect(result.published).toEqual(["review-generation"]);
    });

    it("events contain complete payloads - no nulls in required fields (AC4)", async () => {
      await publishRiskEvents({
        bundleId: "bundle_complete",
        riskLevel: "CRITICAL",
        tenantId: "tenant_1",
        reasoning: "Full payload test",
        sourceId: "LOO-100",
        sourceType: "linear_ticket",
      });

      // Check review queue payload
      const reviewPayload = mockReviewQueueAdd.mock.calls[0][1];
      expect(reviewPayload.tenantId).toBe("tenant_1");
      expect(reviewPayload.contextId).toBe("bundle_complete");
      expect(reviewPayload.reviewType).toBe("design-review");

      // Check events queue payload
      const eventPayload = mockEventsQueueAdd.mock.calls[0][1];
      expect(eventPayload.tenantId).toBe("tenant_1");
      expect(eventPayload.eventType).toBe("risk.critical");
      expect(eventPayload.timestamp).toBeDefined();
      expect(eventPayload.data.bundleId).toBe("bundle_complete");
      expect(eventPayload.data.riskLevel).toBe("CRITICAL");
      expect(eventPayload.data.reasoning).toBe("Full payload test");
      expect(eventPayload.data.sourceId).toBe("LOO-100");
      expect(eventPayload.data.sourceType).toBe("linear_ticket");
    });

    it("priority ordering correct - CRITICAL=1, HIGH=2, MEDIUM=3 (AC5)", async () => {
      // CRITICAL
      await publishRiskEvents({
        bundleId: "b1",
        riskLevel: "CRITICAL",
        tenantId: "t1",
      });
      const criticalOpts = mockReviewQueueAdd.mock.calls[0][2];
      expect(criticalOpts.priority).toBe(1);

      mockReviewQueueAdd.mockClear();

      // HIGH
      await publishRiskEvents({
        bundleId: "b2",
        riskLevel: "HIGH",
        tenantId: "t1",
      });
      const highOpts = mockReviewQueueAdd.mock.calls[0][2];
      expect(highOpts.priority).toBe(2);

      mockReviewQueueAdd.mockClear();

      // MEDIUM
      await publishRiskEvents({
        bundleId: "b3",
        riskLevel: "MEDIUM",
        tenantId: "t1",
      });
      const mediumOpts = mockReviewQueueAdd.mock.calls[0][2];
      expect(mediumOpts.priority).toBe(3);
    });

    it("RISK_PRIORITY constants are correct", () => {
      expect(RISK_PRIORITY.CRITICAL).toBe(1);
      expect(RISK_PRIORITY.HIGH).toBe(2);
      expect(RISK_PRIORITY.MEDIUM).toBe(3);
      expect(RISK_PRIORITY.LOW).toBe(4);
    });

    it("handles missing optional fields gracefully", async () => {
      await publishRiskEvents({
        bundleId: "bundle_minimal",
        riskLevel: "LOW",
        tenantId: "tenant_1",
        // No reasoning, sourceId, or sourceType
      });

      const eventPayload = mockEventsQueueAdd.mock.calls[0][1];
      expect(eventPayload.data.reasoning).toBeNull();
      expect(eventPayload.data.sourceId).toBeNull();
      expect(eventPayload.data.sourceType).toBeNull();
    });

    it("reports failures when queue add throws", async () => {
      mockReviewQueueAdd.mockRejectedValueOnce(new Error("Redis connection failed"));

      const result = await publishRiskEvents({
        bundleId: "b_fail",
        riskLevel: "HIGH",
        tenantId: "t1",
      });

      expect(result.published).toHaveLength(0);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].queue).toBe("review-generation");
      expect(result.failed[0].error).toContain("Redis connection failed");
    });
  });

  describe("publishIntegrationEvent", () => {
    it("publishes integration.connected event", async () => {
      await publishIntegrationEvent("integration.connected", {
        tenantId: "tenant_1",
        integrationId: "int_123",
        provider: "LINEAR",
      });

      expect(mockEventsQueueAdd).toHaveBeenCalledTimes(1);
      const call = mockEventsQueueAdd.mock.calls[0];
      expect(call[0]).toBe("integration.connected");

      const payload = call[1];
      expect(payload.tenantId).toBe("tenant_1");
      expect(payload.eventType).toBe("integration.connected");
      expect(payload.data.integrationId).toBe("int_123");
      expect(payload.data.provider).toBe("LINEAR");
      expect(payload.timestamp).toBeDefined();
    });

    it("publishes integration.error with reason", async () => {
      await publishIntegrationEvent("integration.error", {
        tenantId: "tenant_1",
        integrationId: "int_456",
        provider: "NOTION",
        reason: "Token revoked",
        metadata: { lastHealthCheck: "2026-05-18T10:00:00Z" },
      });

      const payload = mockEventsQueueAdd.mock.calls[0][1];
      expect(payload.eventType).toBe("integration.error");
      expect(payload.data.reason).toBe("Token revoked");
      expect(payload.data.lastHealthCheck).toBe("2026-05-18T10:00:00Z");
    });

    it("handles missing optional fields", async () => {
      await publishIntegrationEvent("integration.disconnected", {
        tenantId: "tenant_1",
        integrationId: "int_789",
        provider: "LINEAR",
      });

      const payload = mockEventsQueueAdd.mock.calls[0][1];
      expect(payload.data.reason).toBeNull();
    });
  });

  describe("publishAssemblyFailed", () => {
    it("publishes assembly.failed event", async () => {
      await publishAssemblyFailed({
        eventId: "evt_123",
        tenantId: "tenant_1",
        error: "Timeout after 2 minutes",
        sourceType: "linear",
        sourceId: "LOO-100",
      });

      expect(mockEventsQueueAdd).toHaveBeenCalledTimes(1);
      const call = mockEventsQueueAdd.mock.calls[0];
      expect(call[0]).toBe("assembly-failed");

      const payload = call[1];
      expect(payload.tenantId).toBe("tenant_1");
      expect(payload.eventType).toBe("assembly.failed");
      expect(payload.data.eventId).toBe("evt_123");
      expect(payload.data.error).toBe("Timeout after 2 minutes");
      expect(payload.data.sourceType).toBe("linear");
      expect(payload.data.sourceId).toBe("LOO-100");
      expect(payload.timestamp).toBeDefined();
    });

    it("handles missing optional fields", async () => {
      await publishAssemblyFailed({
        eventId: "evt_456",
        tenantId: "tenant_1",
        error: "Unknown failure",
      });

      const payload = mockEventsQueueAdd.mock.calls[0][1];
      expect(payload.data.sourceType).toBeNull();
      expect(payload.data.sourceId).toBeNull();
    });
  });
});
