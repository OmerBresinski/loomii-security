/**
 * Tests for Review Event Publishing
 *
 * Tests cover:
 * - review.published -> eventsQueue (AC1)
 * - review.pending_approval -> eventsQueue (AC2)
 * - review.completed -> threatModelQueue + eventsQueue (AC3)
 * - review.failed -> eventsQueue (AC4)
 * - finding.status_changed -> eventsQueue (AC5)
 * - All payloads have required fields / no nulls (AC6)
 */
import "../test-setup";
import { describe, it, expect, beforeEach, mock } from "bun:test";

// =========================================
// Mock setup
// =========================================

const mockEventsQueueAdd = mock(async (_name: string, _data: any) => ({
  id: "event_job_123",
}));

const mockThreatModelQueueAdd = mock(async (_name: string, _data: any) => ({
  id: "tm_job_123",
}));

mock.module("@loomii/queue", () => ({
  eventsQueue: { add: mockEventsQueueAdd },
  threatModelQueue: { add: mockThreatModelQueueAdd },
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

mock.module("./logger", () => ({
  logger: {
    child: () => ({
      info: () => {},
      warn: () => {},
      error: () => {},
    }),
  },
}));

// Import after mocking
const {
  publishReviewPublished,
  publishReviewPendingApproval,
  publishReviewCompleted,
  publishReviewFailed,
  publishFindingStatusChanged,
} = await import("./review-events");

// =========================================
// Tests
// =========================================

describe("Review Events", () => {
  beforeEach(() => {
    mockEventsQueueAdd.mockClear();
    mockThreatModelQueueAdd.mockClear();
  });

  describe("publishReviewPublished", () => {
    it("publishes review.published to events queue (AC1)", async () => {
      await publishReviewPublished({
        tenantId: "tenant_1",
        reviewId: "review_123",
        contextBundleId: "ctx_456",
        severity: "MEDIUM",
        confidence: 75,
        findingCount: 3,
        publishedVia: "autonomous",
        durationMs: 12000,
        projectId: "proj_1",
        projectName: "Auth Service",
      });

      expect(mockEventsQueueAdd).toHaveBeenCalledTimes(1);
      const [name, payload] = mockEventsQueueAdd.mock.calls[0] as any;
      expect(name).toBe("review.published");
      expect(payload.tenantId).toBe("tenant_1");
      expect(payload.eventType).toBe("review.published");
      expect(payload.data.reviewId).toBe("review_123");
      expect(payload.data.contextBundleId).toBe("ctx_456");
      expect(payload.data.severity).toBe("MEDIUM");
      expect(payload.data.confidence).toBe(75);
      expect(payload.data.findingCount).toBe(3);
      expect(payload.data.publishedVia).toBe("autonomous");
      expect(payload.data.durationMs).toBe(12000);
      expect(payload.timestamp).toBeTruthy();
    });

    it("handles manual_approval publish", async () => {
      await publishReviewPublished({
        tenantId: "tenant_1",
        reviewId: "review_456",
        contextBundleId: "ctx_789",
        severity: "HIGH",
        confidence: 85,
        findingCount: 5,
        publishedVia: "manual_approval",
        projectId: null,
        projectName: null,
      });

      const [, payload] = mockEventsQueueAdd.mock.calls[0] as any;
      expect(payload.data.publishedVia).toBe("manual_approval");
      expect(payload.data.durationMs).toBeNull(); // Not provided for manual
    });
  });

  describe("publishReviewPendingApproval", () => {
    it("publishes review.pending_approval to events queue (AC2)", async () => {
      await publishReviewPendingApproval({
        tenantId: "tenant_1",
        reviewId: "review_789",
        contextBundleId: "ctx_abc",
        severity: "CRITICAL",
        confidence: 90,
        findingCount: 7,
        reason: "Critical risk level requires human approval",
      });

      expect(mockEventsQueueAdd).toHaveBeenCalledTimes(1);
      const [name, payload] = mockEventsQueueAdd.mock.calls[0] as any;
      expect(name).toBe("review.pending_approval");
      expect(payload.tenantId).toBe("tenant_1");
      expect(payload.eventType).toBe("review.pending_approval");
      expect(payload.data.reviewId).toBe("review_789");
      expect(payload.data.contextBundleId).toBe("ctx_abc");
      expect(payload.data.severity).toBe("CRITICAL");
      expect(payload.data.confidence).toBe(90);
      expect(payload.data.findingCount).toBe(7);
      expect(payload.data.reason).toBe("Critical risk level requires human approval");
      expect(payload.timestamp).toBeTruthy();
    });
  });

  describe("publishReviewCompleted", () => {
    it("publishes to both threat model queue AND events queue (AC3)", async () => {
      await publishReviewCompleted({
        tenantId: "tenant_1",
        reviewId: "review_complete",
        contextBundleId: "ctx_done",
        severity: "MEDIUM",
        mode: "AUTONOMOUS",
        findingCount: 4,
        findingSummary: {
          threats: 2,
          requirements: 1,
          mitigations: 1,
        },
        projectId: "proj_1",
        projectName: "Auth Service",
      });

      // Should publish to threat model queue
      expect(mockThreatModelQueueAdd).toHaveBeenCalledTimes(1);
      const [tmName, tmPayload] = mockThreatModelQueueAdd.mock.calls[0] as any;
      expect(tmName).toBe("review-completed");
      expect(tmPayload.tenantId).toBe("tenant_1");
      expect(tmPayload.changeType).toBe("updated");
      expect(tmPayload.designDocId).toBe("ctx_done");

      // Should also publish to events queue
      expect(mockEventsQueueAdd).toHaveBeenCalledTimes(1);
      const [evName, evPayload] = mockEventsQueueAdd.mock.calls[0] as any;
      expect(evName).toBe("review.completed");
      expect(evPayload.tenantId).toBe("tenant_1");
      expect(evPayload.eventType).toBe("review.completed");
      expect(evPayload.data.reviewId).toBe("review_complete");
      expect(evPayload.data.mode).toBe("AUTONOMOUS");
      expect(evPayload.data.findingCount).toBe(4);
      expect(evPayload.data.findingSummary.threats).toBe(2);
      expect(evPayload.data.findingSummary.requirements).toBe(1);
      expect(evPayload.data.findingSummary.mitigations).toBe(1);
    });

    it("publishes for ASSISTED mode reviews too", async () => {
      await publishReviewCompleted({
        tenantId: "tenant_2",
        reviewId: "review_assisted",
        contextBundleId: "ctx_high",
        severity: "HIGH",
        mode: "ASSISTED",
        findingCount: 6,
        findingSummary: {
          threats: 3,
          requirements: 2,
          mitigations: 1,
        },
        projectId: null,
        projectName: null,
      });

      // Threat model queue ALWAYS receives the event
      expect(mockThreatModelQueueAdd).toHaveBeenCalledTimes(1);
      expect(mockEventsQueueAdd).toHaveBeenCalledTimes(1);

      const [, evPayload] = mockEventsQueueAdd.mock.calls[0] as any;
      expect(evPayload.data.mode).toBe("ASSISTED");
    });

    it("still publishes to events queue even if threat model queue fails", async () => {
      mockThreatModelQueueAdd.mockRejectedValueOnce(new Error("Redis connection lost"));

      await publishReviewCompleted({
        tenantId: "tenant_1",
        reviewId: "review_partial",
        contextBundleId: "ctx_partial",
        severity: "MEDIUM",
        mode: "AUTONOMOUS",
        findingCount: 2,
        findingSummary: { threats: 1, requirements: 1, mitigations: 0 },
        projectId: null,
        projectName: null,
      });

      // Events queue should still have been called successfully
      expect(mockEventsQueueAdd).toHaveBeenCalledTimes(1);
      const [name] = mockEventsQueueAdd.mock.calls[0] as any;
      expect(name).toBe("review.completed");
    });

    it("still publishes to threat model queue even if events queue fails", async () => {
      mockEventsQueueAdd.mockRejectedValueOnce(new Error("Redis connection lost"));

      await publishReviewCompleted({
        tenantId: "tenant_1",
        reviewId: "review_partial2",
        contextBundleId: "ctx_partial2",
        severity: "HIGH",
        mode: "ASSISTED",
        findingCount: 3,
        findingSummary: { threats: 2, requirements: 1, mitigations: 0 },
        projectId: null,
        projectName: null,
      });

      // Threat model queue should still have been called successfully
      expect(mockThreatModelQueueAdd).toHaveBeenCalledTimes(1);
      const [name] = mockThreatModelQueueAdd.mock.calls[0] as any;
      expect(name).toBe("review-completed");
    });

    it("throws if both queues fail", async () => {
      mockThreatModelQueueAdd.mockRejectedValueOnce(new Error("Redis down"));
      mockEventsQueueAdd.mockRejectedValueOnce(new Error("Redis down"));

      await expect(
        publishReviewCompleted({
          tenantId: "tenant_1",
          reviewId: "review_total_fail",
          contextBundleId: "ctx_total_fail",
          severity: "CRITICAL",
          mode: "ASSISTED",
          findingCount: 5,
          findingSummary: { threats: 3, requirements: 1, mitigations: 1 },
          projectId: null,
          projectName: null,
        })
      ).rejects.toThrow("Failed to publish review.completed to both queues");
    });
  });

  describe("publishReviewFailed", () => {
    it("publishes review.failed to events queue (AC4)", async () => {
      await publishReviewFailed({
        tenantId: "tenant_1",
        contextBundleId: "ctx_fail",
        error: "LLM timeout after 90 seconds",
        durationMs: 90123,
        reviewId: "review_failed",
      });

      expect(mockEventsQueueAdd).toHaveBeenCalledTimes(1);
      const [name, payload] = mockEventsQueueAdd.mock.calls[0] as any;
      expect(name).toBe("review.failed");
      expect(payload.tenantId).toBe("tenant_1");
      expect(payload.eventType).toBe("review.failed");
      expect(payload.data.contextBundleId).toBe("ctx_fail");
      expect(payload.data.error).toBe("LLM timeout after 90 seconds");
      expect(payload.data.durationMs).toBe(90123);
      expect(payload.data.reviewId).toBe("review_failed");
      expect(payload.timestamp).toBeTruthy();
    });

    it("handles missing reviewId (failed before review creation)", async () => {
      await publishReviewFailed({
        tenantId: "tenant_1",
        contextBundleId: "ctx_early_fail",
        error: "Context bundle not found",
        durationMs: 50,
      });

      const [, payload] = mockEventsQueueAdd.mock.calls[0] as any;
      expect(payload.data.reviewId).toBeNull();
    });

    it("truncates long error messages to 500 chars", async () => {
      const longError = "x".repeat(1000);
      await publishReviewFailed({
        tenantId: "tenant_1",
        contextBundleId: "ctx_long_err",
        error: longError,
        durationMs: 5000,
      });

      const [, payload] = mockEventsQueueAdd.mock.calls[0] as any;
      expect(payload.data.error.length).toBe(500);
    });
  });

  describe("publishFindingStatusChanged", () => {
    it("publishes finding.status_changed to events queue (AC5)", async () => {
      await publishFindingStatusChanged({
        tenantId: "tenant_1",
        reviewId: "review_123",
        findingId: "finding_456",
        previousStatus: "OPEN",
        newStatus: "RESOLVED",
        changedBy: "user_789",
        finding: {
          title: "Missing authentication on payment endpoint",
          type: "THREAT",
          severity: "HIGH",
        },
      });

      expect(mockEventsQueueAdd).toHaveBeenCalledTimes(1);
      const [name, payload] = mockEventsQueueAdd.mock.calls[0] as any;
      expect(name).toBe("finding.status_changed");
      expect(payload.tenantId).toBe("tenant_1");
      expect(payload.eventType).toBe("finding.status_changed");
      expect(payload.data.reviewId).toBe("review_123");
      expect(payload.data.findingId).toBe("finding_456");
      expect(payload.data.previousStatus).toBe("OPEN");
      expect(payload.data.newStatus).toBe("RESOLVED");
      expect(payload.data.changedBy).toBe("user_789");
      expect(payload.data.finding.title).toBe("Missing authentication on payment endpoint");
      expect(payload.data.finding.type).toBe("THREAT");
      expect(payload.data.finding.severity).toBe("HIGH");
      expect(payload.timestamp).toBeTruthy();
    });

    it("handles DISMISSED status change", async () => {
      await publishFindingStatusChanged({
        tenantId: "tenant_1",
        reviewId: "review_123",
        findingId: "finding_789",
        previousStatus: "OPEN",
        newStatus: "DISMISSED",
        changedBy: "user_lead",
        finding: {
          title: "Low-risk informational finding",
          type: "REQUIREMENT",
          severity: "LOW",
        },
      });

      const [, payload] = mockEventsQueueAdd.mock.calls[0] as any;
      expect(payload.data.newStatus).toBe("DISMISSED");
    });
  });

  describe("payload completeness (AC6)", () => {
    it("review.published has no undefined required fields", async () => {
      await publishReviewPublished({
        tenantId: "t",
        reviewId: "r",
        contextBundleId: "c",
        severity: "LOW",
        confidence: 60,
        findingCount: 1,
        publishedVia: "autonomous",
        projectId: null,
        projectName: null,
      });

      const [, payload] = mockEventsQueueAdd.mock.calls[0] as any;
      expect(payload.tenantId).toBeDefined();
      expect(payload.eventType).toBeDefined();
      expect(payload.data.reviewId).toBeDefined();
      expect(payload.data.contextBundleId).toBeDefined();
      expect(payload.data.severity).toBeDefined();
      expect(payload.data.confidence).toBeDefined();
      expect(payload.data.findingCount).toBeDefined();
      expect(payload.data.publishedVia).toBeDefined();
      expect(payload.timestamp).toBeDefined();
    });

    it("review.completed has complete finding summary", async () => {
      await publishReviewCompleted({
        tenantId: "t",
        reviewId: "r",
        contextBundleId: "c",
        severity: "MEDIUM",
        mode: "AUTONOMOUS",
        findingCount: 0,
        findingSummary: { threats: 0, requirements: 0, mitigations: 0 },
        projectId: null,
        projectName: null,
      });

      const [, payload] = mockEventsQueueAdd.mock.calls[0] as any;
      expect(payload.data.findingSummary).toBeDefined();
      expect(typeof payload.data.findingSummary.threats).toBe("number");
      expect(typeof payload.data.findingSummary.requirements).toBe("number");
      expect(typeof payload.data.findingSummary.mitigations).toBe("number");
    });

    it("finding.status_changed includes full finding metadata", async () => {
      await publishFindingStatusChanged({
        tenantId: "t",
        reviewId: "r",
        findingId: "f",
        previousStatus: "OPEN",
        newStatus: "ACCEPTED",
        changedBy: "u",
        finding: { title: "Test", type: "MITIGATION", severity: "LOW" },
      });

      const [, payload] = mockEventsQueueAdd.mock.calls[0] as any;
      expect(payload.data.finding).toBeDefined();
      expect(payload.data.finding.title).toBeDefined();
      expect(payload.data.finding.type).toBeDefined();
      expect(payload.data.finding.severity).toBeDefined();
    });
  });
});
