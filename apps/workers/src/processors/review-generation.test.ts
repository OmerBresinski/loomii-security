/**
 * Tests for Review Generation Processor
 *
 * Tests cover:
 * - Generates review with correct structure (AC1)
 * - Every finding references a policy (AC2)
 * - Handles fallback on invalid output (AC3)
 * - Routes critical to ASSISTED (AC4)
 * - Routes medium+high-confidence to AUTONOMOUS (AC5)
 * - Prevents duplicate reviews (AC6)
 * - Saves review + version + findings (AC7)
 * - Creates finding relations (AC8)
 */
import "../test-setup";
import { describe, it, expect, beforeEach, mock, afterEach } from "bun:test";
import type { ReviewOutput } from "@loomii/shared/schemas";

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
  reviewQueue: { add: mock(async () => ({ id: "job_1" })) },
  contextAssemblyQueue: { add: mock() },
  riskClassificationQueue: { add: mock() },
  embeddingQueue: { add: mock() },
  notionPollingQueue: { add: mock() },
  integrationHealthQueue: { add: mock() },
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

// Mock the DB
const mockReviewFindUnique = mock(async () => null);
const mockContextBundleFindUnique = mock(async () => ({
  id: "ctx_123",
  title: "Add payment endpoint",
  content: JSON.stringify({ type: "linear_issue", title: "Add /api/payments endpoint" }),
  riskLevel: "MEDIUM",
  tenantId: "tenant_1",
}));
const mockReviewUpsert = mock(async (_args: any) => ({
  id: "review_123",
  contextBundleId: "ctx_123",
  status: "GENERATING",
}));
const mockReviewVersionCreate = mock(async (_args: any) => ({
  id: "version_123",
  version: 1,
}));
const mockFindingCreate = mock(async (_args: any) => ({
  id: `finding_${Math.random().toString(36).slice(2)}`,
}));
const mockFindingRelationCreate = mock(async (_args: any) => ({
  id: "relation_123",
}));
const mockFindingRelationDeleteMany = mock(async () => ({ count: 0 }));
const mockFindingDeleteMany = mock(async () => ({ count: 0 }));
const mockReviewVersionDeleteMany = mock(async () => ({ count: 0 }));

const mockTx = {
  review: { upsert: mockReviewUpsert },
  reviewVersion: { create: mockReviewVersionCreate, deleteMany: mockReviewVersionDeleteMany },
  finding: { create: mockFindingCreate, deleteMany: mockFindingDeleteMany },
  findingRelation: { create: mockFindingRelationCreate, deleteMany: mockFindingRelationDeleteMany },
};

mock.module("@loomii/db", () => ({
  db: {
    review: { findUnique: mockReviewFindUnique, upsert: mockReviewUpsert },
    contextBundle: { findUnique: mockContextBundleFindUnique },
    $transaction: mock(async (fn: any) => fn(mockTx)),
  },
  vectorSearch: async () => [],
  insertEmbedding: async () => {},
}));

// Mock the agent
const VALID_REVIEW_OUTPUT: ReviewOutput = {
  summary: "This change introduces a payment endpoint that requires security review.",
  hasSecurityImplications: true,
  severity: "MEDIUM",
  confidence: 75,
  findings: [
    {
      type: "THREAT",
      title: "Missing authentication on payment endpoint",
      description: "The new /api/payments endpoint does not implement authentication middleware, allowing unauthorized access to payment operations.",
      severity: "HIGH",
      confidence: 85,
      strideCategory: "SPOOFING",
      policyReference: "A01:2021 - Broken Access Control",
      effortEstimate: undefined,
      relatedFindingIndices: [1],
    },
    {
      type: "REQUIREMENT",
      title: "Implement authentication for payment operations",
      description: "All payment-related endpoints must require authenticated user sessions with appropriate role checks per OWASP access control guidelines.",
      severity: "HIGH",
      confidence: 90,
      policyReference: "A01:2021 - Broken Access Control",
      effortEstimate: undefined,
      relatedFindingIndices: [0, 2],
    },
    {
      type: "MITIGATION",
      title: "Add JWT validation middleware to payment routes",
      description: "Implement JWT token validation middleware on all /api/payments/* routes, verifying token signature, expiry, and required payment_admin role claim.",
      severity: "HIGH",
      confidence: 80,
      policyReference: "A01:2021 - Broken Access Control",
      effortEstimate: "MEDIUM",
      relatedFindingIndices: [0, 1],
    },
  ],
};

const mockAgentGenerate = mock(async () => ({
  object: VALID_REVIEW_OUTPUT,
  text: "",
}));

mock.module("../agents/design-review", () => ({
  designReviewAgent: { generate: mockAgentGenerate },
  designReviewTools: {},
  buildReviewPrompt: (_content: string, _risk: string, _title?: string) =>
    "mock review prompt",
}));

const _mockLogger: any = { info: () => {}, warn: () => {}, error: () => {}, child: () => _mockLogger };
mock.module("../lib/logger", () => ({ logger: _mockLogger }));

// Import after mocking
const { processReviewGeneration } = await import("./review-generation");

// =========================================
// Tests
// =========================================

describe("Review Generation Processor", () => {
  beforeEach(() => {
    mockReviewFindUnique.mockReset();
    mockContextBundleFindUnique.mockReset();
    mockReviewUpsert.mockReset();
    mockAgentGenerate.mockReset();
    mockEventsQueueAdd.mockReset();
    mockThreatModelQueueAdd.mockReset();
    mockFindingCreate.mockReset();
    mockFindingRelationCreate.mockReset();
    mockReviewVersionCreate.mockReset();

    // Reset defaults
    mockReviewFindUnique.mockResolvedValue(null);
    mockContextBundleFindUnique.mockResolvedValue({
      id: "ctx_123",
      title: "Add payment endpoint",
      content: JSON.stringify({ type: "linear_issue", title: "Add /api/payments endpoint" }),
      riskLevel: "MEDIUM",
      tenantId: "tenant_1",
    });
    mockReviewUpsert.mockResolvedValue({
      id: "review_123",
      contextBundleId: "ctx_123",
      status: "GENERATING",
    });
    mockAgentGenerate.mockResolvedValue({
      object: VALID_REVIEW_OUTPUT,
      text: "",
    });
    mockReviewVersionCreate.mockResolvedValue({ id: "version_123", version: 1 });

    let findingCounter = 0;
    mockFindingCreate.mockImplementation(async () => ({
      id: `finding_${findingCounter++}`,
    }));
    mockFindingRelationCreate.mockResolvedValue({ id: "relation_123" });
  });

  it("generates review with correct structure", async () => {
    const job = createMockJob({ tenantId: "tenant_1", contextId: "ctx_123", reviewType: "design-review" });
    await processReviewGeneration(job);

    // Agent was called
    expect(mockAgentGenerate).toHaveBeenCalledTimes(1);

    // Review was saved
    expect(mockReviewVersionCreate).toHaveBeenCalledTimes(1);
    expect(mockFindingCreate).toHaveBeenCalledTimes(3);
  });

  it("every finding references a policy (AC2)", async () => {
    const job = createMockJob({ tenantId: "tenant_1", contextId: "ctx_123", reviewType: "design-review" });
    await processReviewGeneration(job);

    // Verify each finding.create call has a policyName
    const calls = mockFindingCreate.mock.calls;
    for (const call of calls) {
      const data = (call[0] as any).data;
      expect(data.policyName).toBeTruthy();
      expect(data.policyName.length).toBeGreaterThan(0);
    }
  });

  it("handles fallback on invalid output (AC3)", async () => {
    // First call returns invalid, second returns valid
    mockAgentGenerate
      .mockResolvedValueOnce({ object: null, text: "" })
      .mockResolvedValueOnce({ object: VALID_REVIEW_OUTPUT, text: "" });

    const job = createMockJob({ tenantId: "tenant_1", contextId: "ctx_123", reviewType: "design-review" });
    await processReviewGeneration(job);

    // Agent was called twice (initial + retry)
    expect(mockAgentGenerate).toHaveBeenCalledTimes(2);
  });

  it("routes critical to ASSISTED (AC4)", async () => {
    mockContextBundleFindUnique.mockResolvedValue({
      id: "ctx_123",
      title: "Infrastructure change",
      content: JSON.stringify({ type: "critical_change" }),
      riskLevel: "CRITICAL",
      tenantId: "tenant_1",
    });

    mockAgentGenerate.mockResolvedValue({
      object: { ...VALID_REVIEW_OUTPUT, severity: "CRITICAL", confidence: 90 },
      text: "",
    });

    const job = createMockJob({ tenantId: "tenant_1", contextId: "ctx_123", reviewType: "design-review" });
    await processReviewGeneration(job);

    // Should publish review.pending_approval event
    const eventCalls = mockEventsQueueAdd.mock.calls;
    const pendingCall = eventCalls.find((c: any) => c[0] === "review.pending_approval");
    expect(pendingCall).toBeDefined();
  });

  it("routes medium+high-confidence to AUTONOMOUS (AC5)", async () => {
    mockContextBundleFindUnique.mockResolvedValue({
      id: "ctx_123",
      title: "Minor change",
      content: JSON.stringify({ type: "minor_change" }),
      riskLevel: "MEDIUM",
      tenantId: "tenant_1",
    });

    mockAgentGenerate.mockResolvedValue({
      object: { ...VALID_REVIEW_OUTPUT, severity: "MEDIUM", confidence: 80 },
      text: "",
    });

    const job = createMockJob({ tenantId: "tenant_1", contextId: "ctx_123", reviewType: "design-review" });
    await processReviewGeneration(job);

    // Should publish review.published event
    const eventCalls = mockEventsQueueAdd.mock.calls;
    const publishedCall = eventCalls.find((c: any) => c[0] === "review.published");
    expect(publishedCall).toBeDefined();
  });

  it("prevents duplicate reviews (AC6)", async () => {
    mockReviewFindUnique.mockResolvedValue({
      id: "review_existing",
      status: "PUBLISHED",
      updatedAt: new Date(),
    });

    const job = createMockJob({ tenantId: "tenant_1", contextId: "ctx_123", reviewType: "design-review" });
    await processReviewGeneration(job);

    // Agent should NOT be called
    expect(mockAgentGenerate).not.toHaveBeenCalled();
  });

  it("allows re-generation if existing review is in ERROR state", async () => {
    mockReviewFindUnique.mockResolvedValue({
      id: "review_error",
      status: "ERROR",
      updatedAt: new Date(),
    });

    const job = createMockJob({ tenantId: "tenant_1", contextId: "ctx_123", reviewType: "design-review" });
    await processReviewGeneration(job);

    // Agent SHOULD be called (re-try after error)
    expect(mockAgentGenerate).toHaveBeenCalledTimes(1);
  });

  it("allows re-generation if existing review is stale GENERATING (>5 min)", async () => {
    const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000);
    mockReviewFindUnique.mockResolvedValue({
      id: "review_stale",
      status: "GENERATING",
      updatedAt: sixMinutesAgo,
    });

    const job = createMockJob({ tenantId: "tenant_1", contextId: "ctx_123", reviewType: "design-review" });
    await processReviewGeneration(job);

    // Agent SHOULD be called (stale GENERATING = crashed worker)
    expect(mockAgentGenerate).toHaveBeenCalledTimes(1);
  });

  it("skips if existing review is fresh GENERATING (<5 min)", async () => {
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    mockReviewFindUnique.mockResolvedValue({
      id: "review_active",
      status: "GENERATING",
      updatedAt: twoMinutesAgo,
    });

    const job = createMockJob({ tenantId: "tenant_1", contextId: "ctx_123", reviewType: "design-review" });
    await processReviewGeneration(job);

    // Agent should NOT be called (another worker is actively processing)
    expect(mockAgentGenerate).not.toHaveBeenCalled();
  });

  it("saves ReviewVersion v1 with editorType agent (AC7)", async () => {
    const job = createMockJob({ tenantId: "tenant_1", contextId: "ctx_123", reviewType: "design-review" });
    await processReviewGeneration(job);

    const versionCall = mockReviewVersionCreate.mock.calls[0] as any;
    expect(versionCall[0].data.version).toBe(1);
    expect(versionCall[0].data.editorType).toBe("agent");
  });

  it("creates finding relations (AC8)", async () => {
    const job = createMockJob({ tenantId: "tenant_1", contextId: "ctx_123", reviewType: "design-review" });
    await processReviewGeneration(job);

    // VALID_REVIEW_OUTPUT has relations: [0]->[1], [1]->[0,2], [2]->[0,1]
    // That's 5 non-self relations (some may be duplicates depending on unique constraint)
    expect(mockFindingRelationCreate.mock.calls.length).toBeGreaterThan(0);
  });

  it("publishes review.completed to both events queue and threat model queue", async () => {
    const job = createMockJob({ tenantId: "tenant_1", contextId: "ctx_123", reviewType: "design-review" });
    await processReviewGeneration(job);

    // Events queue receives review.completed
    const eventCalls = mockEventsQueueAdd.mock.calls;
    const completedCall = eventCalls.find((c: any) => c[0] === "review.completed");
    expect(completedCall).toBeDefined();

    // Threat model queue also receives it (for re-evaluation)
    const tmCalls = mockThreatModelQueueAdd.mock.calls;
    const tmCall = tmCalls.find((c: any) => c[0] === "review-completed");
    expect(tmCall).toBeDefined();
  });

  it("throws on missing context bundle", async () => {
    mockContextBundleFindUnique.mockResolvedValue(null);

    const job = createMockJob({ tenantId: "tenant_1", contextId: "ctx_missing", reviewType: "design-review" });
    await expect(processReviewGeneration(job)).rejects.toThrow("Context bundle not found");
  });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createMockJob(data: { tenantId: string; contextId: string; reviewType: string }) {
  return {
    id: "job_123",
    name: "review",
    data,
    progress: mock(() => {}),
    log: mock(() => {}),
    updateProgress: mock(() => {}),
  } as any;
}
