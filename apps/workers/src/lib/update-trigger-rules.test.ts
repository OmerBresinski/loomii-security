/**
 * Tests for Update Trigger Rules
 *
 * Tests cover:
 * - STRIDE findings -> UPDATE (AC1)
 * - Structural keyword -> UPDATE (AC1)
 * - Risk=CRITICAL -> UPDATE
 * - Risk=HIGH -> UPDATE
 * - No match -> SKIP (AC2)
 * - Trigger evaluation is fast (<100ms)
 */
import { describe, it, expect } from "bun:test";
import { shouldUpdateModel, type TriggerInput } from "./update-trigger-rules";

describe("Update Trigger Rules", () => {
  describe("Rule 1: STRIDE findings", () => {
    it("triggers update when THREAT findings with strideCategory exist", () => {
      const review: TriggerInput = {
        severity: "MEDIUM",
        summary: "Updated user profile page layout",
        findings: [
          { type: "THREAT", strideCategory: "SPOOFING" },
          { type: "REQUIREMENT", strideCategory: null },
        ],
      };

      const result = shouldUpdateModel(review);
      expect(result.update).toBe(true);
      expect(result.rule).toBe("stride_findings");
      expect(result.reason).toContain("STRIDE");
    });

    it("does not trigger for THREAT findings without strideCategory", () => {
      const review: TriggerInput = {
        severity: "LOW",
        summary: "Minor CSS change",
        findings: [
          { type: "THREAT", strideCategory: null },
        ],
      };

      const result = shouldUpdateModel(review);
      expect(result.update).toBe(false);
    });

    it("does not trigger for non-THREAT findings with strideCategory", () => {
      const review: TriggerInput = {
        severity: "LOW",
        summary: "Minor fix",
        findings: [
          { type: "REQUIREMENT", strideCategory: "TAMPERING" },
        ],
      };

      const result = shouldUpdateModel(review);
      expect(result.update).toBe(false);
    });

    it("counts multiple STRIDE findings in reason", () => {
      const review: TriggerInput = {
        severity: "MEDIUM",
        summary: "Auth changes",
        findings: [
          { type: "THREAT", strideCategory: "SPOOFING" },
          { type: "THREAT", strideCategory: "ELEVATION_OF_PRIVILEGE" },
          { type: "MITIGATION" },
        ],
      };

      const result = shouldUpdateModel(review);
      expect(result.update).toBe(true);
      expect(result.reason).toContain("2");
    });
  });

  describe("Rule 2: Structural keywords", () => {
    it("triggers on 'new endpoint' in summary", () => {
      const review: TriggerInput = {
        severity: "MEDIUM",
        summary: "Added a new endpoint for user payments",
        findings: [{ type: "REQUIREMENT" }],
      };

      const result = shouldUpdateModel(review);
      expect(result.update).toBe(true);
      expect(result.rule).toBe("structural_keywords");
      expect(result.matchedKeyword).toBe("new endpoint");
    });

    it("triggers on 'new service' in summary", () => {
      const review: TriggerInput = {
        severity: "LOW",
        summary: "Deployed a new service for notifications",
        findings: [{ type: "REQUIREMENT" }],
      };

      const result = shouldUpdateModel(review);
      expect(result.update).toBe(true);
      expect(result.matchedKeyword).toBe("new service");
    });

    it("triggers on 'new database' in summary", () => {
      const review: TriggerInput = {
        severity: "MEDIUM",
        summary: "Introduced a new database for analytics",
        findings: [{ type: "REQUIREMENT" }],
      };

      const result = shouldUpdateModel(review);
      expect(result.update).toBe(true);
      expect(result.matchedKeyword).toBe("new database");
    });

    it("triggers on 'authentication change' in summary", () => {
      const review: TriggerInput = {
        severity: "MEDIUM",
        summary: "Major authentication change from JWT to OAuth2",
        findings: [{ type: "REQUIREMENT" }],
      };

      const result = shouldUpdateModel(review);
      expect(result.update).toBe(true);
      expect(result.matchedKeyword).toBe("authentication change");
    });

    it("is case-insensitive", () => {
      const review: TriggerInput = {
        severity: "LOW",
        summary: "Added a New API for reporting",
        findings: [{ type: "REQUIREMENT" }],
      };

      const result = shouldUpdateModel(review);
      expect(result.update).toBe(true);
      expect(result.matchedKeyword).toBe("new api");
    });

    it("does not trigger on partial keyword match", () => {
      const review: TriggerInput = {
        severity: "LOW",
        summary: "Updated the renewal process",
        findings: [{ type: "REQUIREMENT" }],
      };

      const result = shouldUpdateModel(review);
      // "renewal" contains "new" but not "new service", "new api", etc.
      expect(result.update).toBe(false);
    });

    it("handles null summary gracefully", () => {
      const review: TriggerInput = {
        severity: "LOW",
        summary: null,
        findings: [{ type: "REQUIREMENT" }],
      };

      const result = shouldUpdateModel(review);
      expect(result.update).toBe(false);
    });
  });

  describe("Rule 3: High risk", () => {
    it("triggers on CRITICAL risk", () => {
      const review: TriggerInput = {
        severity: "CRITICAL",
        summary: "Fixed a typo",
        findings: [{ type: "REQUIREMENT" }],
      };

      const result = shouldUpdateModel(review);
      expect(result.update).toBe(true);
      expect(result.rule).toBe("high_risk");
      expect(result.reason).toContain("CRITICAL");
    });

    it("triggers on HIGH risk", () => {
      const review: TriggerInput = {
        severity: "HIGH",
        summary: "Updated configuration",
        findings: [{ type: "REQUIREMENT" }],
      };

      const result = shouldUpdateModel(review);
      expect(result.update).toBe(true);
      expect(result.rule).toBe("high_risk");
      expect(result.reason).toContain("HIGH");
    });

    it("does not trigger on MEDIUM risk alone", () => {
      const review: TriggerInput = {
        severity: "MEDIUM",
        summary: "Refactored utility function",
        findings: [{ type: "REQUIREMENT" }],
      };

      const result = shouldUpdateModel(review);
      expect(result.update).toBe(false);
    });

    it("does not trigger on LOW risk alone", () => {
      const review: TriggerInput = {
        severity: "LOW",
        summary: "Updated readme",
        findings: [{ type: "REQUIREMENT" }],
      };

      const result = shouldUpdateModel(review);
      expect(result.update).toBe(false);
    });
  });

  describe("No match -> SKIP", () => {
    it("skips when no rules match", () => {
      const review: TriggerInput = {
        severity: "LOW",
        summary: "Fixed typo in footer text",
        findings: [{ type: "REQUIREMENT", strideCategory: null }],
      };

      const result = shouldUpdateModel(review);
      expect(result.update).toBe(false);
      expect(result.rule).toBe("no_match");
      expect(result.reason).toContain("No structural changes");
    });

    it("skips with empty findings", () => {
      const review: TriggerInput = {
        severity: "LOW",
        summary: "Bumped dependency version",
        findings: [],
      };

      const result = shouldUpdateModel(review);
      expect(result.update).toBe(false);
    });
  });

  describe("Rule priority (first match wins)", () => {
    it("STRIDE rule takes priority over structural keywords", () => {
      const review: TriggerInput = {
        severity: "LOW",
        summary: "Added a new endpoint with auth issues",
        findings: [{ type: "THREAT", strideCategory: "SPOOFING" }],
      };

      const result = shouldUpdateModel(review);
      // STRIDE rule matches first, even though keyword would also match
      expect(result.rule).toBe("stride_findings");
    });

    it("structural keywords take priority over high risk", () => {
      const review: TriggerInput = {
        severity: "CRITICAL",
        summary: "Added new database for secrets",
        findings: [{ type: "REQUIREMENT" }],
      };

      const result = shouldUpdateModel(review);
      // Keywords match before risk level is checked
      expect(result.rule).toBe("structural_keywords");
    });
  });

  describe("Performance", () => {
    it("evaluates in under 1ms (well under 100ms SLA)", () => {
      const review: TriggerInput = {
        severity: "MEDIUM",
        summary: "A complex review with lots of text about various system changes that might or might not include structural keywords",
        findings: Array.from({ length: 20 }, (_, i) => ({
          type: i % 3 === 0 ? "THREAT" : "REQUIREMENT",
          strideCategory: null,
        })),
      };

      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        shouldUpdateModel(review);
      }
      const elapsed = performance.now() - start;

      // 1000 evaluations should complete in well under 100ms
      expect(elapsed).toBeLessThan(100);
    });
  });
});
