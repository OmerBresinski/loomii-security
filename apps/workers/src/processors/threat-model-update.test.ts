/**
 * Tests for Threat Model Update Processor
 *
 * Tests cover:
 * - AC1: Review with structural change -> triggers update, new entities added
 * - AC2: Review about "fix typo" (low risk, no STRIDE) -> skipped
 * - AC3: Update increments model version
 * - AC4: TmChange record created with triggeredBy=reviewId
 * - AC5: Failed update -> model unchanged (transaction rollback)
 * - AC7: Existing threat mitigation updated
 */
import { describe, it, expect, beforeEach, mock } from "bun:test";
import type { ThreatModelUpdateOutput } from "@loomii/shared/schemas";

// =========================================
// Mock setup
// =========================================

mock.module("@loomii/queue", () => ({
  eventsQueue: { add: mock(async () => ({ id: "ev_1" })) },
  threatModelQueue: { add: mock(async () => ({ id: "tm_1" })) },
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

const mockThreatModelFindUnique = mock(async () => ({
  id: "tm_123",
  status: "ACTIVE",
  version: 2,
}));

const mockReviewFindFirst = mock(async () => ({
  id: "review_456",
  severity: "HIGH",
  summary: "Added a new endpoint for payment processing",
  findings: [
    { type: "THREAT", strideCategory: "SPOOFING" },
    { type: "REQUIREMENT", strideCategory: null },
  ],
}));

// Mock $transaction to execute the function directly
const mockTmComponentFindMany = mock(async () => [
  { id: "comp_existing", name: "API Gateway" },
]);
const mockTmComponentCreate = mock(async (args: any) => ({
  id: `comp_new_${Date.now()}`,
  name: args.data.name,
}));
const mockTmEntryPointFindMany = mock(async () => []);
const mockTmEntryPointCreate = mock(async (args: any) => ({
  id: `ep_new_${Date.now()}`,
  name: args.data.name,
}));
const mockTmDataFlowCreate = mock(async () => ({ id: "flow_new" }));
const mockTmThreatCreate = mock(async () => ({ id: "threat_new" }));
const mockTmThreatFindFirst = mock(async () => ({ id: "threat_existing" }));
const mockTmThreatUpdate = mock(async () => ({}));
const mockThreatModelUpdate = mock(async (_args: any) => ({ version: 3 }));
const mockTmChangeCreate = mock(async () => ({}));

const mockTx = {
  threatModel: {
    update: mockThreatModelUpdate,
  },
  tmComponent: { findMany: mockTmComponentFindMany, create: mockTmComponentCreate },
  tmDataFlow: { create: mockTmDataFlowCreate },
  tmEntryPoint: { findMany: mockTmEntryPointFindMany, create: mockTmEntryPointCreate },
  tmThreat: { create: mockTmThreatCreate, findFirst: mockTmThreatFindFirst, update: mockTmThreatUpdate },
  tmChange: { create: mockTmChangeCreate },
};

mock.module("@loomii/db", () => ({
  db: {
    threatModel: { findUnique: mockThreatModelFindUnique },
    review: { findFirst: mockReviewFindFirst },
    $transaction: mock(async (fn: any) => fn(mockTx)),
  },
}));

const VALID_UPDATE_OUTPUT: ThreatModelUpdateOutput = {
  summary: "Added payment service component and new API entry point with auth threats",
  newComponents: [
    { name: "Payment Service", type: "microservice", description: "Handles payment processing" },
  ],
  newDataFlows: [
    { fromComponentName: "API Gateway", toComponentName: "Payment Service", description: "Payment requests", dataType: "PII" },
  ],
  newEntryPoints: [
    { name: "POST /api/payments", type: "REST API", authRequired: true, authType: "JWT", rateLimited: true },
  ],
  newThreats: [
    {
      title: "Payment endpoint auth bypass",
      description: "Attacker could bypass JWT validation on payment endpoint",
      strideCategory: "SPOOFING",
      severity: "HIGH",
      targetEntityName: "Payment Service",
      targetEntityType: "component",
    },
  ],
  modifiedThreats: [],
};

const mockAgentGenerate = mock(async () => ({
  object: VALID_UPDATE_OUTPUT,
  text: "",
}));

mock.module("../agents/threat-model", () => ({
  threatModelAgent: { generate: mockAgentGenerate },
  threatModelTools: {},
}));

mock.module("../lib/threat-embeddings", () => ({
  embedThreats: mock(async () => ({ embedded: 1, durationMs: 100 })),
}));

mock.module("../lib/gap-analysis", () => ({
  runGapAnalysis: mock(async () => ({ created: 0, resolved: 0, total: 0 })),
}));

const _mockLogger: any = { info: () => {}, warn: () => {}, error: () => {}, child: () => _mockLogger };
mock.module("../lib/logger", () => ({ logger: _mockLogger }));

// Import after mocking
const { processThreatModelUpdate } = await import("./threat-model-update");

// =========================================
// Tests
// =========================================

describe("Threat Model Update Processor", () => {
  beforeEach(() => {
    mockThreatModelFindUnique.mockReset();
    mockReviewFindFirst.mockReset();
    mockAgentGenerate.mockReset();
    mockTmComponentCreate.mockReset();
    mockTmEntryPointCreate.mockReset();
    mockTmDataFlowCreate.mockReset();
    mockTmThreatCreate.mockReset();
    mockTmThreatUpdate.mockReset();
    mockThreatModelUpdate.mockReset();
    mockTmChangeCreate.mockReset();

    // Reset defaults
    mockThreatModelFindUnique.mockResolvedValue({
      id: "tm_123",
      status: "ACTIVE",
      version: 2,
    });
    mockReviewFindFirst.mockResolvedValue({
      id: "review_456",
      severity: "HIGH",
      summary: "Added a new endpoint for payment processing",
      findings: [
        { type: "THREAT", strideCategory: "SPOOFING" },
        { type: "REQUIREMENT", strideCategory: null },
      ],
    });
    mockAgentGenerate.mockResolvedValue({
      object: VALID_UPDATE_OUTPUT,
      text: "",
    });
    mockTmComponentCreate.mockImplementation(async (args: any) => ({
      id: `comp_${Date.now()}`,
      name: args.data.name,
    }));
    mockTmEntryPointCreate.mockImplementation(async (args: any) => ({
      id: `ep_${Date.now()}`,
      name: args.data.name,
    }));
    mockThreatModelUpdate.mockResolvedValue({ version: 3 });
  });

  it("triggers update for review with STRIDE findings (AC1)", async () => {
    const job = createMockJob({
      tenantId: "tenant_1",
      changeType: "updated",
      designDocId: "ctx_123",
    });

    await processThreatModelUpdate(job);

    // Agent should be called
    expect(mockAgentGenerate).toHaveBeenCalledTimes(1);
    // New component created
    expect(mockTmComponentCreate).toHaveBeenCalledTimes(1);
    // New entry point created
    expect(mockTmEntryPointCreate).toHaveBeenCalledTimes(1);
    // New threat created
    expect(mockTmThreatCreate).toHaveBeenCalledTimes(1);
  });

  it("skips update for low-risk review without STRIDE findings (AC2)", async () => {
    mockReviewFindFirst.mockResolvedValue({
      id: "review_789",
      severity: "LOW",
      summary: "Fixed typo in footer text",
      findings: [{ type: "REQUIREMENT", strideCategory: null }],
    });

    const job = createMockJob({
      tenantId: "tenant_1",
      changeType: "updated",
      designDocId: "ctx_456",
    });

    await processThreatModelUpdate(job);

    // Agent should NOT be called
    expect(mockAgentGenerate).not.toHaveBeenCalled();
  });

  it("increments model version atomically (AC3)", async () => {
    const job = createMockJob({
      tenantId: "tenant_1",
      changeType: "updated",
      designDocId: "ctx_123",
    });

    await processThreatModelUpdate(job);

    // Version incremented via atomic { increment: 1 } in the first update call
    const updateCalls = mockThreatModelUpdate.mock.calls;
    const incrementCall = updateCalls.find(
      (c: any) => c[0]?.data?.version?.increment === 1
    );
    expect(incrementCall).toBeDefined();
  });

  it("creates TmChange record with triggeredBy=reviewId (AC4)", async () => {
    const job = createMockJob({
      tenantId: "tenant_1",
      changeType: "updated",
      designDocId: "ctx_123",
    });

    await processThreatModelUpdate(job);

    expect(mockTmChangeCreate).toHaveBeenCalledTimes(1);
    const changeCall = mockTmChangeCreate.mock.calls[0] as any;
    expect(changeCall[0].data.triggeredBy).toBe("review_456");
    expect(changeCall[0].data.version).toBe(3);
    expect(changeCall[0].data.changeType).toBe("incremental_update");
  });

  it("rolls back on agent failure - model unchanged (AC5)", async () => {
    mockAgentGenerate.mockRejectedValue(new Error("LLM timeout"));

    const job = createMockJob({
      tenantId: "tenant_1",
      changeType: "updated",
      designDocId: "ctx_123",
    });

    await expect(processThreatModelUpdate(job)).rejects.toThrow("LLM timeout");

    // No DB writes should have happened (transaction rolled back)
    expect(mockTmComponentCreate).not.toHaveBeenCalled();
    expect(mockThreatModelUpdate).not.toHaveBeenCalled();
    expect(mockTmChangeCreate).not.toHaveBeenCalled();
  });

  it("skips when no active threat model exists", async () => {
    mockThreatModelFindUnique.mockResolvedValue(null);

    const job = createMockJob({
      tenantId: "tenant_1",
      changeType: "updated",
      designDocId: "ctx_123",
    });

    await processThreatModelUpdate(job);
    expect(mockAgentGenerate).not.toHaveBeenCalled();
  });

  it("skips when threat model is not ACTIVE", async () => {
    mockThreatModelFindUnique.mockResolvedValue({
      id: "tm_123",
      status: "GENERATING",
      version: 1,
    });

    const job = createMockJob({
      tenantId: "tenant_1",
      changeType: "updated",
      designDocId: "ctx_123",
    });

    await processThreatModelUpdate(job);
    expect(mockAgentGenerate).not.toHaveBeenCalled();
  });

  it("skips when no review found for contextBundleId", async () => {
    mockReviewFindFirst.mockResolvedValue(null);

    const job = createMockJob({
      tenantId: "tenant_1",
      changeType: "updated",
      designDocId: "ctx_unknown",
    });

    await processThreatModelUpdate(job);
    expect(mockAgentGenerate).not.toHaveBeenCalled();
  });

  it("skips when agent returns no changes", async () => {
    mockAgentGenerate.mockResolvedValue({
      object: {
        summary: "No structural changes needed",
        newComponents: [],
        newDataFlows: [],
        newEntryPoints: [],
        newThreats: [],
        modifiedThreats: [],
      },
      text: "",
    });

    const job = createMockJob({
      tenantId: "tenant_1",
      changeType: "updated",
      designDocId: "ctx_123",
    });

    await processThreatModelUpdate(job);

    // Agent was called but no DB writes
    expect(mockAgentGenerate).toHaveBeenCalledTimes(1);
    expect(mockTmComponentCreate).not.toHaveBeenCalled();
    expect(mockThreatModelUpdate).not.toHaveBeenCalled();
  });

  it("handles modified threats (AC7)", async () => {
    mockAgentGenerate.mockResolvedValue({
      object: {
        summary: "Updated mitigation status for existing threat",
        newComponents: [],
        newDataFlows: [],
        newEntryPoints: [],
        newThreats: [],
        modifiedThreats: [
          {
            existingThreatTitle: "SQL injection in user input",
            mitigationStatus: "MITIGATED",
            mitigationNotes: "Parameterized queries now used everywhere",
          },
        ],
      },
      text: "",
    });

    const job = createMockJob({
      tenantId: "tenant_1",
      changeType: "updated",
      designDocId: "ctx_123",
    });

    await processThreatModelUpdate(job);

    expect(mockTmThreatUpdate).toHaveBeenCalledTimes(1);
    const updateCall = mockTmThreatUpdate.mock.calls[0] as any;
    expect(updateCall[0].data.mitigationStatus).toBe("MITIGATED");
  });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createMockJob(data: { tenantId: string; changeType: string; designDocId?: string }) {
  return {
    id: "job_123",
    name: "review-completed",
    data,
    progress: mock(() => {}),
    log: mock(() => {}),
  } as any;
}
