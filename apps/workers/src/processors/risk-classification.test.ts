/**
 * Tests for Risk Classification Worker.
 *
 * All external dependencies (Mastra Agent/Bedrock, DB, Queue) are mocked.
 * Tests cover:
 * - Auth changes classified as CRITICAL (AC1)
 * - UI fixes classified as LOW (AC2)
 * - New endpoints classified as HIGH (AC3)
 * - LLM failure defaults to HIGH (AC4)
 * - Classification completes within SLA (AC5)
 * - ContextBundle updated with riskLevel + reasoning (AC6)
 * - Events published based on risk level
 */
import "../test-setup";
import { describe, it, expect, beforeEach, mock } from "bun:test";
import type { Job } from "bullmq";
import type { RiskClassificationPayload } from "@loomii/queue";

// =========================================
// Mock setup
// =========================================

const mockDb = {
  contextBundle: {
    findUnique: mock((_args: any) => Promise.resolve(null as any)),
    update: mock((_args: any) => Promise.resolve({} as any)),
  },
};

const mockReviewQueue = {
  add: mock((_name: string, _payload: any) =>
    Promise.resolve({ id: "review_job_123" })
  ),
};

const mockEventsQueue = {
  add: mock((_name: string, _payload: any) =>
    Promise.resolve({ id: "event_job_123" })
  ),
};

// Mock the Mastra agent's generate function
const mockAgentGenerate = mock((_prompt: any, _opts: any): Promise<any> =>
  Promise.resolve({
    object: { level: "HIGH", reasoning: "Test reasoning" },
    text: "",
  })
);

// Apply mocks BEFORE importing the processor
mock.module("@loomii/db", () => ({
  db: mockDb,
  BundleStatus: { ASSEMBLING: "ASSEMBLING", READY: "READY", REVIEWING: "REVIEWING", COMPLETED: "COMPLETED", FAILED: "FAILED" },
  vectorSearch: async () => [],
  insertEmbedding: async () => {},
}));
mock.module("@loomii/queue", () => ({
  reviewQueue: mockReviewQueue,
  eventsQueue: mockEventsQueue,
  contextAssemblyQueue: { add: mock() },
  riskClassificationQueue: { add: mock() },
  embeddingQueue: { add: mock() },
  notionPollingQueue: { add: mock() },
  integrationHealthQueue: { add: mock() },
  threatModelQueue: { add: mock() },
  createRedisConnection: () => ({}),
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
  decrypt: (text: string) => text,
}));

// Import after mocks - use dynamic import to ensure mocks are applied first
const { processRiskClassification, __setAgent } = await import("./risk-classification");

// Inject mock agent (avoids mocking @mastra/core/agent globally which leaks to E2E tests)
__setAgent({ generate: mockAgentGenerate });

// =========================================
// Helpers
// =========================================

function createMockJob(
  data: RiskClassificationPayload,
  overrides?: Partial<Job<RiskClassificationPayload>>
): Job<RiskClassificationPayload> {
  return {
    id: "job_test_risk_123",
    name: "classify",
    data,
    processedOn: Date.now(),
    ...overrides,
  } as unknown as Job<RiskClassificationPayload>;
}

function createMockBundle(overrides?: Partial<{
  id: string;
  tenantId: string;
  eventId: string;
  status: string;
  title: string | null;
  content: Record<string, unknown>;
}>) {
  return {
    id: "bundle_123",
    tenantId: "tenant_123",
    eventId: "evt_123",
    status: "READY",
    riskLevel: null,
    title: "Test Change",
    content: {
      source: "linear",
      sourceId: "issue_123",
      assembledAt: "2026-05-17T22:00:00Z",
      primary: {
        ticket: {
          title: "Test Change",
          description: "Some change description",
        },
        comments: [],
      },
      crossReferences: { notionDocs: [], linearIssues: [] },
      missingItems: [],
    },
    summary: null,
    reviewOutput: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// =========================================
// Tests
// =========================================

describe("Risk Classification Processor", () => {
  beforeEach(() => {
    mockDb.contextBundle.findUnique.mockReset();
    mockDb.contextBundle.update.mockReset();
    mockReviewQueue.add.mockReset();
    mockEventsQueue.add.mockReset();
    mockAgentGenerate.mockReset();

    // Default implementations
    mockDb.contextBundle.update.mockResolvedValue({});
    mockReviewQueue.add.mockResolvedValue({ id: "review_job" });
    mockEventsQueue.add.mockResolvedValue({ id: "event_job" });
  });

  describe("AC1: Auth changes classified as CRITICAL", () => {
    it("classifies authentication changes as CRITICAL", async () => {
      const bundle = createMockBundle({
        title: "Add OAuth login with Google",
        content: {
          source: "linear",
          sourceId: "issue_123",
          assembledAt: "2026-05-17T22:00:00Z",
          primary: {
            ticket: {
              title: "Add OAuth login with Google",
              description: "Implement Google OAuth 2.0 for user authentication. Add session management and token refresh.",
            },
            comments: [{ body: "We need to handle token storage securely" }],
          },
          crossReferences: { notionDocs: [], linearIssues: [] },
          missingItems: [],
        },
      });

      mockDb.contextBundle.findUnique.mockResolvedValue(bundle);
      mockAgentGenerate.mockResolvedValue({
        object: {
          level: "CRITICAL",
          reasoning: "Authentication flow change involving OAuth, session management, and token handling - all critical security concerns.",
        },
      });

      const job = createMockJob({
        tenantId: "tenant_123",
        contextId: "bundle_123",
        designDocId: "issue_123",
      });

      await processRiskClassification(job);

      // Should update bundle with CRITICAL
      expect(mockDb.contextBundle.update).toHaveBeenCalledTimes(1);
      const updateCall = mockDb.contextBundle.update.mock.calls[0]![0] as any;
      expect(updateCall.data.riskLevel).toBe("CRITICAL");
      expect(updateCall.data.status).toBe("COMPLETED");

      // Should enqueue review AND critical alert
      expect(mockReviewQueue.add).toHaveBeenCalledTimes(1);
      expect(mockEventsQueue.add).toHaveBeenCalledTimes(1);
      const [eventName] = mockEventsQueue.add.mock.calls[0]!;
      expect(eventName).toBe("critical-alert");
    });
  });

  describe("AC2: UI fixes classified as LOW", () => {
    it("classifies button alignment fix as LOW", async () => {
      const bundle = createMockBundle({
        title: "Fix button alignment",
        content: {
          source: "linear",
          sourceId: "issue_456",
          assembledAt: "2026-05-17T22:00:00Z",
          primary: {
            ticket: {
              title: "Fix button alignment",
              description: "The submit button on the settings page is misaligned on mobile. Fix CSS margin.",
            },
            comments: [],
          },
          crossReferences: { notionDocs: [], linearIssues: [] },
          missingItems: [],
        },
      });

      mockDb.contextBundle.findUnique.mockResolvedValue(bundle);
      mockAgentGenerate.mockResolvedValue({
        object: {
          level: "LOW",
          reasoning: "Pure UI/CSS change with no security implications - button alignment fix.",
        },
      });

      const job = createMockJob({
        tenantId: "tenant_123",
        contextId: "bundle_123",
        designDocId: "issue_456",
      });

      await processRiskClassification(job);

      const updateCall = mockDb.contextBundle.update.mock.calls[0]![0] as any;
      expect(updateCall.data.riskLevel).toBe("LOW");

      // Should NOT enqueue review for LOW risk
      expect(mockReviewQueue.add).not.toHaveBeenCalled();
      // Should publish low-risk event for dashboard
      expect(mockEventsQueue.add).toHaveBeenCalledTimes(1);
      const [eventName] = mockEventsQueue.add.mock.calls[0]!;
      expect(eventName).toBe("classified-low");
    });
  });

  describe("AC3: New endpoints classified as HIGH", () => {
    it("classifies new REST endpoint as HIGH", async () => {
      const bundle = createMockBundle({
        title: "Create new REST endpoint for user profiles",
        content: {
          source: "linear",
          sourceId: "issue_789",
          assembledAt: "2026-05-17T22:00:00Z",
          primary: {
            ticket: {
              title: "Create new REST endpoint for user profiles",
              description: "Add GET /api/v1/users/:id endpoint that returns user profile data including email and preferences.",
            },
            comments: [{ body: "Make sure to add rate limiting" }],
          },
          crossReferences: { notionDocs: [], linearIssues: [] },
          missingItems: [],
        },
      });

      mockDb.contextBundle.findUnique.mockResolvedValue(bundle);
      mockAgentGenerate.mockResolvedValue({
        object: {
          level: "HIGH",
          reasoning: "New API endpoint expanding attack surface. Exposes user data (email) - requires input validation, auth check, and rate limiting.",
        },
      });

      const job = createMockJob({
        tenantId: "tenant_123",
        contextId: "bundle_123",
        designDocId: "issue_789",
      });

      await processRiskClassification(job);

      const updateCall = mockDb.contextBundle.update.mock.calls[0]![0] as any;
      expect(updateCall.data.riskLevel).toBe("HIGH");

      // Should enqueue review for HIGH risk
      expect(mockReviewQueue.add).toHaveBeenCalledTimes(1);
      const [reviewName, reviewPayload] = mockReviewQueue.add.mock.calls[0]!;
      expect(reviewName).toBe("review");
      expect((reviewPayload as any).contextId).toBe("bundle_123");
      expect((reviewPayload as any).reviewType).toBe("design-review");
    });
  });

  describe("AC4: LLM failure defaults to HIGH", () => {
    it("defaults to HIGH when LLM call fails", async () => {
      const bundle = createMockBundle();
      mockDb.contextBundle.findUnique.mockResolvedValue(bundle);

      // All attempts fail
      mockAgentGenerate.mockRejectedValue(new Error("Bedrock service unavailable"));

      const job = createMockJob({
        tenantId: "tenant_123",
        contextId: "bundle_123",
        designDocId: "issue_123",
      });

      await processRiskClassification(job);

      // Should still update with HIGH (fallback)
      const updateCall = mockDb.contextBundle.update.mock.calls[0]![0] as any;
      expect(updateCall.data.riskLevel).toBe("HIGH");
      expect(updateCall.data.summary).toContain("Classification failed");
      expect(updateCall.data.status).toBe("COMPLETED");

      // Should still enqueue review (HIGH triggers review)
      expect(mockReviewQueue.add).toHaveBeenCalledTimes(1);
    });

    it("defaults to HIGH when LLM returns invalid output", async () => {
      const bundle = createMockBundle();
      mockDb.contextBundle.findUnique.mockResolvedValue(bundle);

      // Returns invalid structured output (missing fields)
      mockAgentGenerate.mockResolvedValue({
        object: null,
      });

      const job = createMockJob({
        tenantId: "tenant_123",
        contextId: "bundle_123",
        designDocId: "issue_123",
      });

      await processRiskClassification(job);

      const updateCall = mockDb.contextBundle.update.mock.calls[0]![0] as any;
      expect(updateCall.data.riskLevel).toBe("HIGH");
    });

    it("retries are handled by modelSettings.maxRetries (single generate call)", async () => {
      const bundle = createMockBundle();
      mockDb.contextBundle.findUnique.mockResolvedValue(bundle);

      // The agent's generate call fails (retries are handled internally by Mastra/AI SDK)
      mockAgentGenerate.mockRejectedValue(new Error("All retries exhausted"));

      const job = createMockJob({
        tenantId: "tenant_123",
        contextId: "bundle_123",
        designDocId: "issue_123",
      });

      await processRiskClassification(job);

      // Single generate call (retries are internal to modelSettings.maxRetries)
      expect(mockAgentGenerate).toHaveBeenCalledTimes(1);

      // Should default to HIGH
      const updateCall = mockDb.contextBundle.update.mock.calls[0]![0] as any;
      expect(updateCall.data.riskLevel).toBe("HIGH");
    });

    it("succeeds when agent returns valid classification", async () => {
      const bundle = createMockBundle();
      mockDb.contextBundle.findUnique.mockResolvedValue(bundle);

      mockAgentGenerate.mockResolvedValue({
        object: { level: "MEDIUM", reasoning: "Medium risk change" },
      });

      const job = createMockJob({
        tenantId: "tenant_123",
        contextId: "bundle_123",
        designDocId: "issue_123",
      });

      await processRiskClassification(job);

      expect(mockAgentGenerate).toHaveBeenCalledTimes(1);
      const updateCall = mockDb.contextBundle.update.mock.calls[0]![0] as any;
      expect(updateCall.data.riskLevel).toBe("MEDIUM");
    });
  });

  describe("AC5: Classification within SLA", () => {
    it("completes classification quickly with mocked agent", async () => {
      const bundle = createMockBundle();
      mockDb.contextBundle.findUnique.mockResolvedValue(bundle);
      mockAgentGenerate.mockResolvedValue({
        object: { level: "LOW", reasoning: "No risk" },
      });

      const job = createMockJob({
        tenantId: "tenant_123",
        contextId: "bundle_123",
        designDocId: "issue_123",
      });

      const start = Date.now();
      await processRiskClassification(job);
      const elapsed = Date.now() - start;

      // With mocks, should complete well under 20s
      expect(elapsed).toBeLessThan(1000);
    });
  });

  describe("AC6: ContextBundle updated with riskLevel + reasoning", () => {
    it("updates bundle with risk level, reasoning, and COMPLETED status", async () => {
      const bundle = createMockBundle();
      mockDb.contextBundle.findUnique.mockResolvedValue(bundle);
      mockAgentGenerate.mockResolvedValue({
        object: {
          level: "MEDIUM",
          reasoning: "Business logic change with potential security side effects.",
        },
      });

      const job = createMockJob({
        tenantId: "tenant_123",
        contextId: "bundle_123",
        designDocId: "issue_123",
      });

      await processRiskClassification(job);

      expect(mockDb.contextBundle.update).toHaveBeenCalledTimes(1);
      const updateCall = mockDb.contextBundle.update.mock.calls[0]![0] as any;
      expect(updateCall.where.id).toBe("bundle_123");
      expect(updateCall.data.riskLevel).toBe("MEDIUM");
      expect(updateCall.data.summary).toBe(
        "Business logic change with potential security side effects."
      );
      expect(updateCall.data.status).toBe("COMPLETED");
      expect(updateCall.data.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe("Event routing based on risk level", () => {
    it("CRITICAL -> review-generation + critical-alert event", async () => {
      const bundle = createMockBundle();
      mockDb.contextBundle.findUnique.mockResolvedValue(bundle);
      mockAgentGenerate.mockResolvedValue({
        object: { level: "CRITICAL", reasoning: "Auth change" },
      });

      const job = createMockJob({
        tenantId: "tenant_123",
        contextId: "bundle_123",
        designDocId: "issue_123",
      });

      await processRiskClassification(job);

      expect(mockReviewQueue.add).toHaveBeenCalledTimes(1);
      expect(mockEventsQueue.add).toHaveBeenCalledTimes(1);
      expect(mockEventsQueue.add.mock.calls[0]![0]).toBe("critical-alert");
    });

    it("HIGH -> review-generation only (no alert)", async () => {
      const bundle = createMockBundle();
      mockDb.contextBundle.findUnique.mockResolvedValue(bundle);
      mockAgentGenerate.mockResolvedValue({
        object: { level: "HIGH", reasoning: "New endpoint" },
      });

      const job = createMockJob({
        tenantId: "tenant_123",
        contextId: "bundle_123",
        designDocId: "issue_123",
      });

      await processRiskClassification(job);

      expect(mockReviewQueue.add).toHaveBeenCalledTimes(1);
      // No critical alert for HIGH
      expect(mockEventsQueue.add).not.toHaveBeenCalled();
    });

    it("MEDIUM -> review-generation only", async () => {
      const bundle = createMockBundle();
      mockDb.contextBundle.findUnique.mockResolvedValue(bundle);
      mockAgentGenerate.mockResolvedValue({
        object: { level: "MEDIUM", reasoning: "Business logic" },
      });

      const job = createMockJob({
        tenantId: "tenant_123",
        contextId: "bundle_123",
        designDocId: "issue_123",
      });

      await processRiskClassification(job);

      expect(mockReviewQueue.add).toHaveBeenCalledTimes(1);
      expect(mockEventsQueue.add).not.toHaveBeenCalled();
    });

    it("LOW -> dashboard event only (no review)", async () => {
      const bundle = createMockBundle();
      mockDb.contextBundle.findUnique.mockResolvedValue(bundle);
      mockAgentGenerate.mockResolvedValue({
        object: { level: "LOW", reasoning: "CSS change" },
      });

      const job = createMockJob({
        tenantId: "tenant_123",
        contextId: "bundle_123",
        designDocId: "issue_123",
      });

      await processRiskClassification(job);

      expect(mockReviewQueue.add).not.toHaveBeenCalled();
      expect(mockEventsQueue.add).toHaveBeenCalledTimes(1);
      expect(mockEventsQueue.add.mock.calls[0]![0]).toBe("classified-low");
    });
  });

  describe("Agent call structure", () => {
    it("passes structured messages (not flat string) and modelSettings to agent", async () => {
      const bundle = createMockBundle();
      mockDb.contextBundle.findUnique.mockResolvedValue(bundle);
      mockAgentGenerate.mockResolvedValue({
        object: { level: "LOW", reasoning: "No risk" },
      });

      const job = createMockJob({
        tenantId: "tenant_123",
        contextId: "bundle_123",
        designDocId: "issue_123",
      });

      await processRiskClassification(job);

      expect(mockAgentGenerate).toHaveBeenCalledTimes(1);
      const [messages, options] = mockAgentGenerate.mock.calls[0]!;

      // Messages should be an array of role-based objects (not a flat string)
      expect(Array.isArray(messages)).toBe(true);
      expect(messages[0].role).toBe("user");
      expect(messages[0].content).toContain("Test Change");

      // Should pass structuredOutput with schema
      expect(options.structuredOutput).toBeDefined();
      expect(options.structuredOutput.schema).toBeDefined();

      // Should pass modelSettings for determinism and retries
      expect(options.modelSettings).toBeDefined();
      expect(options.modelSettings.temperature).toBe(0);
      expect(options.modelSettings.maxRetries).toBe(2);
      expect(options.modelSettings.maxOutputTokens).toBe(1000);
    });
  });

  describe("Edge cases", () => {
    it("skips classification if bundle not found", async () => {
      mockDb.contextBundle.findUnique.mockResolvedValue(null);

      const job = createMockJob({
        tenantId: "tenant_123",
        contextId: "bundle_missing",
        designDocId: "issue_123",
      });

      await processRiskClassification(job);

      expect(mockAgentGenerate).not.toHaveBeenCalled();
      expect(mockDb.contextBundle.update).not.toHaveBeenCalled();
    });

    it("skips classification if bundle has no content", async () => {
      mockDb.contextBundle.findUnique.mockResolvedValue({
        ...createMockBundle(),
        content: null,
      });

      const job = createMockJob({
        tenantId: "tenant_123",
        contextId: "bundle_123",
        designDocId: "issue_123",
      });

      await processRiskClassification(job);

      expect(mockAgentGenerate).not.toHaveBeenCalled();
      expect(mockDb.contextBundle.update).not.toHaveBeenCalled();
    });
  });
});

describe("Classification Messages", () => {
  it("builds user messages with title and content", async () => {
    const { buildClassificationMessages } = await import(
      "../lib/classification-prompt"
    );

    const messages = buildClassificationMessages({
      title: "Add OAuth login",
      content: { primary: { ticket: { title: "Add OAuth login" } } },
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]!.role).toBe("user");
    expect(messages[0]!.content).toContain("Add OAuth login");
    expect(messages[0]!.content).toContain("Context Bundle");
  });

  it("truncates extremely large content", async () => {
    const { buildClassificationMessages } = await import(
      "../lib/classification-prompt"
    );

    const largeContent: Record<string, unknown> = {
      data: "x".repeat(100_000),
    };
    const messages = buildClassificationMessages({
      title: "Large change",
      content: largeContent,
    });

    expect(messages[0]!.content).toContain("content truncated");
    expect(messages[0]!.content.length).toBeLessThan(100_000);
  });

  it("handles null title gracefully", async () => {
    const { buildClassificationMessages } = await import(
      "../lib/classification-prompt"
    );

    const messages = buildClassificationMessages({
      title: null,
      content: { something: "test" },
    });

    expect(messages[0]!.content).toContain("Untitled change");
  });
});

describe("Risk Classification Schema", () => {
  it("validates correct classification output", async () => {
    const { riskClassificationSchema } = await import(
      "../lib/classification-prompt"
    );

    const result = riskClassificationSchema.safeParse({
      level: "CRITICAL",
      reasoning: "Auth change detected",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid risk level", async () => {
    const { riskClassificationSchema } = await import(
      "../lib/classification-prompt"
    );

    const result = riskClassificationSchema.safeParse({
      level: "SUPER_HIGH",
      reasoning: "Test",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing reasoning", async () => {
    const { riskClassificationSchema } = await import(
      "../lib/classification-prompt"
    );

    const result = riskClassificationSchema.safeParse({
      level: "HIGH",
    });
    expect(result.success).toBe(false);
  });
});
