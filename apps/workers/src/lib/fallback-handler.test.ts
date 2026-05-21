/**
 * Tests for Fallback Handler
 *
 * Uses the dependency-injected `generateWithFallbackAgents` directly to avoid
 * Bun's global mock.module contamination issues when running alongside other tests.
 *
 * Tests cover:
 * - AC1: Primary fails once -> retries after 5s
 * - AC2: Primary fails twice -> switches to Haiku
 * - AC3: Haiku succeeds -> review saved with modelUsed=haiku
 * - AC4: All 4 attempts fail -> throws error
 * - AC6: Records correct modelUsed
 * - 5s delay between attempts
 */
import { describe, it, expect, beforeEach, mock } from "bun:test";
import type { ReviewOutput } from "@loomii/shared/schemas";

// =========================================
// Mock only the minimal deps needed
// =========================================

mock.module("@loomii/queue", () => ({
  eventsQueue: { add: mock(async () => ({ id: "ev_1" })) },
  threatModelQueue: { add: mock(async () => ({ id: "tm_1" })) },
  QUEUE_NAMES: {},
}));

mock.module("@loomii/db", () => ({
  db: {},
  vectorSearch: async () => [],
}));

// Mock only the logger (no agent mocks needed since we use DI)
const _mockLogger: any = { info: () => {}, warn: () => {}, error: () => {}, child: () => _mockLogger };
mock.module("./logger", () => ({ logger: _mockLogger }));
mock.module("../lib/logger", () => ({ logger: _mockLogger }));

// Import the DI version (no __setSleep needed - sleep is passed via agents)
const { generateWithFallbackAgents } = await import("./fallback-handler");

// =========================================
// Test fixtures
// =========================================

const mockSleep = mock(async (_ms: number) => {});

// =========================================
// Test fixtures
// =========================================

const VALID_REVIEW_OUTPUT: ReviewOutput = {
  summary: "This change introduces a payment endpoint that requires security review.",
  hasSecurityImplications: true,
  severity: "MEDIUM",
  confidence: 75,
  findings: [
    {
      type: "THREAT",
      title: "Missing authentication on payment endpoint",
      description: "The new /api/payments endpoint does not implement authentication middleware, allowing unauthorized access.",
      severity: "HIGH",
      confidence: 85,
      strideCategory: "SPOOFING",
      policyReference: "A01:2021 - Broken Access Control",
      relatedFindingIndices: [],
    },
  ],
};

const DEFAULT_INPUT = {
  tenantId: "tenant_1",
  bundleContent: '{"type": "test"}',
  riskLevel: "MEDIUM",
  bundleTitle: "Test change",
};

function createMockAgents(
  primaryGenerate: Function,
  fallbackGenerate: Function
) {
  return {
    primary: { generate: primaryGenerate },
    primaryTools: {},
    primaryModelId: "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
    fallback: { generate: fallbackGenerate },
    fallbackTools: {},
    fallbackModelId: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
    sleepFn: mockSleep,
  };
}

// =========================================
// Tests
// =========================================

describe("Fallback Handler", () => {
  beforeEach(() => {
    mockSleep.mockReset();
    mockSleep.mockResolvedValue(undefined);
  });

  it("primary success -> no fallback, no delays", async () => {
    const primary = mock(async () => ({ object: VALID_REVIEW_OUTPUT, text: "" }));
    const fallback = mock(async () => ({ object: null, text: "" }));
    const agents = createMockAgents(primary, fallback);

    const result = await generateWithFallbackAgents(DEFAULT_INPUT, agents);

    expect(result.attemptNumber).toBe(1);
    expect(result.usedFallback).toBe(false);
    expect(result.modelUsed).toContain("sonnet");
    expect(mockSleep).not.toHaveBeenCalled();
    expect(fallback).not.toHaveBeenCalled();
  });

  it("primary fails, retry succeeds after 5s delay (AC1)", async () => {
    const primary = mock()
      .mockResolvedValueOnce({ object: null, text: "" })
      .mockResolvedValueOnce({ object: VALID_REVIEW_OUTPUT, text: "" });
    const fallback = mock(async () => ({ object: null, text: "" }));
    const agents = createMockAgents(primary, fallback);

    const result = await generateWithFallbackAgents(DEFAULT_INPUT, agents);

    expect(result.attemptNumber).toBe(2);
    expect(result.usedFallback).toBe(false);
    expect(result.modelUsed).toContain("sonnet");
    expect(mockSleep).toHaveBeenCalledTimes(1);
    expect(mockSleep).toHaveBeenCalledWith(5000);
  });

  it("primary fails twice, switches to Haiku (AC2)", async () => {
    const primary = mock(async () => ({ object: null, text: "" }));
    const fallback = mock(async () => ({ object: VALID_REVIEW_OUTPUT, text: "" }));
    const agents = createMockAgents(primary, fallback);

    const result = await generateWithFallbackAgents(DEFAULT_INPUT, agents);

    expect(result.attemptNumber).toBe(3);
    expect(result.usedFallback).toBe(true);
    expect(result.modelUsed).toContain("haiku");
    expect(primary).toHaveBeenCalledTimes(2);
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it("Haiku succeeds -> correct modelUsed (AC3, AC6)", async () => {
    const primary = mock(async () => ({ object: null, text: "" }));
    const fallback = mock(async () => ({ object: VALID_REVIEW_OUTPUT, text: "" }));
    const agents = createMockAgents(primary, fallback);

    const result = await generateWithFallbackAgents(DEFAULT_INPUT, agents);

    expect(result.modelUsed).toBe("us.anthropic.claude-haiku-4-5-20251001-v1:0");
    expect(result.usedFallback).toBe(true);
  });

  it("all 4 attempts fail -> throws error (AC4)", async () => {
    const primary = mock(async () => ({ object: null, text: "" }));
    const fallback = mock(async () => ({ object: null, text: "" }));
    const agents = createMockAgents(primary, fallback);

    await expect(
      generateWithFallbackAgents(DEFAULT_INPUT, agents)
    ).rejects.toThrow("All 4 LLM attempts failed");

    expect(primary).toHaveBeenCalledTimes(2);
    expect(fallback).toHaveBeenCalledTimes(2);
    expect(mockSleep).toHaveBeenCalledTimes(2);
  });

  it("5s delay between primary attempts", async () => {
    const primary = mock()
      .mockResolvedValueOnce({ object: null, text: "" })
      .mockResolvedValueOnce({ object: VALID_REVIEW_OUTPUT, text: "" });
    const fallback = mock(async () => ({ object: null, text: "" }));
    const agents = createMockAgents(primary, fallback);

    await generateWithFallbackAgents(DEFAULT_INPUT, agents);

    expect(mockSleep).toHaveBeenCalledWith(5000);
  });

  it("5s delay between fallback attempts", async () => {
    const primary = mock(async () => ({ object: null, text: "" }));
    const fallback = mock()
      .mockResolvedValueOnce({ object: null, text: "" })
      .mockResolvedValueOnce({ object: VALID_REVIEW_OUTPUT, text: "" });
    const agents = createMockAgents(primary, fallback);

    const result = await generateWithFallbackAgents(DEFAULT_INPUT, agents);

    expect(result.attemptNumber).toBe(4);
    expect(mockSleep).toHaveBeenCalledTimes(2);
    expect(mockSleep).toHaveBeenNthCalledWith(1, 5000);
    expect(mockSleep).toHaveBeenNthCalledWith(2, 5000);
  });

  it("handles thrown errors from agent (not just null)", async () => {
    const primary = mock(async () => { throw new Error("Connection refused"); });
    const fallback = mock(async () => ({ object: VALID_REVIEW_OUTPUT, text: "" }));
    const agents = createMockAgents(primary, fallback);

    const result = await generateWithFallbackAgents(DEFAULT_INPUT, agents);

    expect(result.usedFallback).toBe(true);
    expect(result.attemptNumber).toBe(3);
  });

  it("handles Zod validation failures gracefully", async () => {
    const invalidOutput = { ...VALID_REVIEW_OUTPUT, summary: "" }; // Too short
    const primary = mock(async () => ({ object: invalidOutput, text: "" }));
    const fallback = mock(async () => ({ object: VALID_REVIEW_OUTPUT, text: "" }));
    const agents = createMockAgents(primary, fallback);

    const result = await generateWithFallbackAgents(DEFAULT_INPUT, agents);

    expect(result.usedFallback).toBe(true);
  });

  it("records primary modelUsed when primary succeeds", async () => {
    const primary = mock(async () => ({ object: VALID_REVIEW_OUTPUT, text: "" }));
    const fallback = mock(async () => ({ object: null, text: "" }));
    const agents = createMockAgents(primary, fallback);

    const result = await generateWithFallbackAgents(DEFAULT_INPUT, agents);

    expect(result.modelUsed).toBe("us.anthropic.claude-sonnet-4-5-20250929-v1:0");
  });
});
