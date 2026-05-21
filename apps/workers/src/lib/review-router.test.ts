/**
 * Tests for Review Router
 *
 * Tests cover all routing rules from the TDD:
 * - CRITICAL -> ASSISTED (AC4)
 * - HIGH -> ASSISTED
 * - MEDIUM + confidence >= 60 -> AUTONOMOUS (AC5)
 * - MEDIUM + confidence < 60 -> ASSISTED
 * - LOW + confidence >= 60 -> AUTONOMOUS
 * - LOW + confidence < 60 -> ASSISTED
 * - Edge cases: confidence exactly at threshold
 */
import { describe, it, expect } from "bun:test";
import { routeReview } from "./review-router";

describe("Review Router", () => {
  describe("CRITICAL risk", () => {
    it("routes to ASSISTED regardless of high confidence", () => {
      const result = routeReview("CRITICAL", 95);
      expect(result.mode).toBe("ASSISTED");
      expect(result.status).toBe("IN_REVIEW");
      expect(result.reviewMode).toBe("MANUAL");
    });

    it("routes to ASSISTED with low confidence", () => {
      const result = routeReview("CRITICAL", 30);
      expect(result.mode).toBe("ASSISTED");
      expect(result.status).toBe("IN_REVIEW");
      expect(result.reviewMode).toBe("MANUAL");
    });

    it("routes to ASSISTED with confidence at threshold", () => {
      const result = routeReview("CRITICAL", 60);
      expect(result.mode).toBe("ASSISTED");
      expect(result.status).toBe("IN_REVIEW");
      expect(result.reviewMode).toBe("MANUAL");
    });
  });

  describe("HIGH risk", () => {
    it("routes to ASSISTED regardless of high confidence", () => {
      const result = routeReview("HIGH", 90);
      expect(result.mode).toBe("ASSISTED");
      expect(result.status).toBe("IN_REVIEW");
      expect(result.reviewMode).toBe("MANUAL");
    });

    it("routes to ASSISTED with low confidence", () => {
      const result = routeReview("HIGH", 20);
      expect(result.mode).toBe("ASSISTED");
      expect(result.status).toBe("IN_REVIEW");
      expect(result.reviewMode).toBe("MANUAL");
    });
  });

  describe("MEDIUM risk", () => {
    it("routes to AUTONOMOUS with confidence >= 60", () => {
      const result = routeReview("MEDIUM", 80);
      expect(result.mode).toBe("AUTONOMOUS");
      expect(result.status).toBe("PUBLISHED");
      expect(result.reviewMode).toBe("AUTOMATED");
    });

    it("routes to AUTONOMOUS at exactly confidence = 60", () => {
      const result = routeReview("MEDIUM", 60);
      expect(result.mode).toBe("AUTONOMOUS");
      expect(result.status).toBe("PUBLISHED");
      expect(result.reviewMode).toBe("AUTOMATED");
    });

    it("routes to ASSISTED with confidence < 60", () => {
      const result = routeReview("MEDIUM", 59);
      expect(result.mode).toBe("ASSISTED");
      expect(result.status).toBe("IN_REVIEW");
      expect(result.reviewMode).toBe("MANUAL");
    });

    it("routes to ASSISTED with very low confidence", () => {
      const result = routeReview("MEDIUM", 10);
      expect(result.mode).toBe("ASSISTED");
      expect(result.status).toBe("IN_REVIEW");
      expect(result.reviewMode).toBe("MANUAL");
    });
  });

  describe("LOW risk", () => {
    it("routes to AUTONOMOUS with confidence >= 60", () => {
      const result = routeReview("LOW", 75);
      expect(result.mode).toBe("AUTONOMOUS");
      expect(result.status).toBe("PUBLISHED");
      expect(result.reviewMode).toBe("AUTOMATED");
    });

    it("routes to AUTONOMOUS at exactly confidence = 60", () => {
      const result = routeReview("LOW", 60);
      expect(result.mode).toBe("AUTONOMOUS");
      expect(result.status).toBe("PUBLISHED");
      expect(result.reviewMode).toBe("AUTOMATED");
    });

    it("routes to ASSISTED with confidence < 60", () => {
      const result = routeReview("LOW", 59);
      expect(result.mode).toBe("ASSISTED");
      expect(result.status).toBe("IN_REVIEW");
      expect(result.reviewMode).toBe("MANUAL");
    });
  });

  describe("reason messages", () => {
    it("includes risk level in reason for critical", () => {
      const result = routeReview("CRITICAL", 80);
      expect(result.reason).toContain("Critical");
    });

    it("includes risk level in reason for high", () => {
      const result = routeReview("HIGH", 80);
      expect(result.reason).toContain("High");
    });

    it("includes confidence in reason for autonomous", () => {
      const result = routeReview("MEDIUM", 75);
      expect(result.reason).toContain("75");
    });

    it("includes confidence in reason for low confidence assisted", () => {
      const result = routeReview("LOW", 45);
      expect(result.reason).toContain("45");
    });
  });

  describe("edge cases", () => {
    it("handles confidence = 0", () => {
      const result = routeReview("LOW", 0);
      expect(result.mode).toBe("ASSISTED");
    });

    it("handles confidence = 100", () => {
      const result = routeReview("LOW", 100);
      expect(result.mode).toBe("AUTONOMOUS");
    });
  });
});
