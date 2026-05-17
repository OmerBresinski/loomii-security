import { describe, test, expect } from "bun:test";
import { ReviewSchema, ListReviewsQuerySchema, CreateReviewRequestSchema } from "./reviews";

describe("ReviewSchema", () => {
  test("validates correct review object", () => {
    const validReview = {
      id: "clxxxxxxxxxxxxxxxxxxxxxxxxx",
      eventId: "clyyyyyyyyyyyyyyyyyyyyyyyyy",
      status: "COMPLETED",
      riskLevel: "HIGH",
      title: "Potential SQL Injection in Auth Module",
      summary: "The auth module concatenates user input directly into SQL queries.",
      content: { pages: ["page1"], issues: ["issue1"] },
      reviewOutput: { findings: [], recommendations: [] },
      createdAt: "2026-05-16T20:00:00.000Z",
      updatedAt: "2026-05-16T21:00:00.000Z",
    };
    const result = ReviewSchema.safeParse(validReview);
    expect(result.success).toBe(true);
  });

  test("validates review with null optional fields", () => {
    const validReview = {
      id: "clxxxxxxxxxxxxxxxxxxxxxxxxx",
      eventId: "clyyyyyyyyyyyyyyyyyyyyyyyyy",
      status: "ASSEMBLING",
      riskLevel: null,
      title: null,
      summary: null,
      content: null,
      reviewOutput: null,
      createdAt: "2026-05-16T20:00:00.000Z",
      updatedAt: "2026-05-16T21:00:00.000Z",
    };
    const result = ReviewSchema.safeParse(validReview);
    expect(result.success).toBe(true);
  });

  test("rejects review missing required fields", () => {
    const invalid = {
      id: "clxxxxxxxxxxxxxxxxxxxxxxxxx",
      // missing eventId, status, etc.
    };
    const result = ReviewSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  test("rejects review with invalid status", () => {
    const invalid = {
      id: "clxxxxxxxxxxxxxxxxxxxxxxxxx",
      eventId: "clyyyyyyyyyyyyyyyyyyyyyyyyy",
      status: "INVALID_STATUS",
      riskLevel: null,
      title: null,
      summary: null,
      content: null,
      reviewOutput: null,
      createdAt: "2026-05-16T20:00:00.000Z",
      updatedAt: "2026-05-16T21:00:00.000Z",
    };
    const result = ReviewSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  test("rejects review with invalid riskLevel", () => {
    const invalid = {
      id: "clxxxxxxxxxxxxxxxxxxxxxxxxx",
      eventId: "clyyyyyyyyyyyyyyyyyyyyyyyyy",
      status: "COMPLETED",
      riskLevel: "SUPER_HIGH",
      title: null,
      summary: null,
      content: null,
      reviewOutput: null,
      createdAt: "2026-05-16T20:00:00.000Z",
      updatedAt: "2026-05-16T21:00:00.000Z",
    };
    const result = ReviewSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  test("rejects review with invalid datetime format", () => {
    const invalid = {
      id: "clxxxxxxxxxxxxxxxxxxxxxxxxx",
      eventId: "clyyyyyyyyyyyyyyyyyyyyyyyyy",
      status: "COMPLETED",
      riskLevel: "HIGH",
      title: "Test",
      summary: null,
      content: null,
      reviewOutput: null,
      createdAt: "not-a-date",
      updatedAt: "2026-05-16T21:00:00.000Z",
    };
    const result = ReviewSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe("ListReviewsQuerySchema", () => {
  test("validates with defaults", () => {
    const result = ListReviewsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(20);
    }
  });

  test("accepts valid query with filters", () => {
    const result = ListReviewsQuerySchema.safeParse({
      status: "COMPLETED",
      riskLevel: "CRITICAL",
      limit: "50",
      cursor: "some-cursor-id",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(50);
      expect(result.data.status).toBe("COMPLETED");
      expect(result.data.riskLevel).toBe("CRITICAL");
    }
  });

  test("coerces string limit to number", () => {
    const result = ListReviewsQuerySchema.safeParse({ limit: "10" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(10);
    }
  });

  test("rejects limit over 100", () => {
    const result = ListReviewsQuerySchema.safeParse({ limit: "200" });
    expect(result.success).toBe(false);
  });
});

describe("CreateReviewRequestSchema", () => {
  test("validates correct request", () => {
    const result = CreateReviewRequestSchema.safeParse({
      eventId: "clxxxxxxxxxxxxxxxxxxxxxxxxx",
    });
    expect(result.success).toBe(true);
  });

  test("rejects missing eventId", () => {
    const result = CreateReviewRequestSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
