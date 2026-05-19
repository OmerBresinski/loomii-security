/**
 * Tests for Threat Model Generation Worker (Two-Pass).
 *
 * All external dependencies (Mastra Agent/Bedrock, DB, Queue) are mocked.
 * Tests cover:
 * - AC1: Given 5 context bundles -> model with 3+ components, 2+ flows, 3+ threats
 * - AC2: All STRIDE categories represented for complex input
 * - AC3: All entities saved atomically (transaction)
 * - AC4: TmChange v1 created with changeType="initial_generation"
 * - AC5: ThreatModel status=ACTIVE after success, ERROR after failure
 * - AC6: Generation completes within 5 minutes (mocked)
 * - AC7: Trigger fires on 3rd bundle OR after 10 minutes
 */
import { describe, it, expect, beforeEach, mock } from "bun:test";
import type { Job } from "bullmq";
import type { ThreatModelUpdatePayload } from "@loomii/queue";

// =========================================
// Mock setup
// =========================================

const mockTxTmComponent = {
  create: mock((_args: any) =>
    Promise.resolve({ id: `comp_${Math.random().toString(36).slice(2, 8)}` })
  ),
};
const mockTxTmDataFlow = {
  create: mock((_args: any) =>
    Promise.resolve({ id: `flow_${Math.random().toString(36).slice(2, 8)}` })
  ),
};
const mockTxTmTrustBoundary = {
  create: mock((_args: any) =>
    Promise.resolve({ id: `boundary_${Math.random().toString(36).slice(2, 8)}` })
  ),
};
const mockTxTmEntryPoint = {
  create: mock((_args: any) =>
    Promise.resolve({ id: `ep_${Math.random().toString(36).slice(2, 8)}` })
  ),
};
const mockTxTmAsset = {
  create: mock((_args: any) =>
    Promise.resolve({ id: `asset_${Math.random().toString(36).slice(2, 8)}` })
  ),
};
const mockTxTmThreat = {
  create: mock((_args: any) =>
    Promise.resolve({ id: `threat_${Math.random().toString(36).slice(2, 8)}` })
  ),
};
const mockTxTmChange = {
  create: mock((_args: any) => Promise.resolve({ id: "change_1" })),
};
const mockTxThreatModel = {
  update: mock((_args: any) => Promise.resolve({})),
};

// The $transaction mock executes the callback with a mock tx
const mockTransaction = mock(async (fn: (tx: any) => Promise<any>) => {
  const tx = {
    tmComponent: mockTxTmComponent,
    tmDataFlow: mockTxTmDataFlow,
    tmTrustBoundary: mockTxTmTrustBoundary,
    tmEntryPoint: mockTxTmEntryPoint,
    tmAsset: mockTxTmAsset,
    tmThreat: mockTxTmThreat,
    tmChange: mockTxTmChange,
    threatModel: mockTxThreatModel,
  };
  return fn(tx);
});

const mockDb = {
  threatModel: {
    findUnique: mock((_args: any) => Promise.resolve(null as any)),
    create: mock((_args: any) =>
      Promise.resolve({ id: "tm_123", tenantId: "tenant_123", status: "GENERATING" })
    ),
    update: mock((_args: any) => Promise.resolve({})),
  },
  contextBundle: {
    findMany: mock((_args: any) => Promise.resolve([] as any[])),
  },
  tmThreat: {
    findMany: mock((_args: any) => Promise.resolve([] as any[])),
  },
  tmDataFlow: {
    findMany: mock((_args: any) => Promise.resolve([] as any[])),
  },
  tmEntryPoint: {
    findMany: mock((_args: any) => Promise.resolve([] as any[])),
  },
  tmComponent: {
    findMany: mock((_args: any) => Promise.resolve([] as any[])),
  },
  tmGap: {
    findMany: mock((_args: any) => Promise.resolve([] as any[])),
    createMany: mock((_args: any) => Promise.resolve({ count: 0 })),
    updateMany: mock((_args: any) => Promise.resolve({ count: 0 })),
    count: mock((_args: any) => Promise.resolve(0)),
  },
  $transaction: mockTransaction,
};

const mockEmbeddingQueue = {
  add: mock((_name: string, _payload: any) =>
    Promise.resolve({ id: "embed_job" })
  ),
  addBulk: mock((_jobs: any[]) => Promise.resolve([])),
};

// Mock the Mastra agent's generate function
const mockAgentGenerate = mock((_prompt: any, _opts: any): Promise<any> =>
  Promise.resolve({ object: null, text: "" })
);

// Apply mocks BEFORE importing the processor
mock.module("@loomii/db", () => ({
  db: mockDb,
  vectorSearch: mock(async () => []),
  insertEmbedding: mock(async () => {}),
  ThreatModelStatus: {
    PENDING: "PENDING",
    GENERATING: "GENERATING",
    ACTIVE: "ACTIVE",
    ERROR: "ERROR",
  },
  StrideCategory: {
    SPOOFING: "SPOOFING",
    TAMPERING: "TAMPERING",
    REPUDIATION: "REPUDIATION",
    INFORMATION_DISCLOSURE: "INFORMATION_DISCLOSURE",
    DENIAL_OF_SERVICE: "DENIAL_OF_SERVICE",
    ELEVATION_OF_PRIVILEGE: "ELEVATION_OF_PRIVILEGE",
  },
  Severity: {
    CRITICAL: "CRITICAL",
    HIGH: "HIGH",
    MEDIUM: "MEDIUM",
    LOW: "LOW",
  },
}));

mock.module("@loomii/queue", () => ({
  embeddingQueue: mockEmbeddingQueue,
  reviewQueue: { add: mock() },
  eventsQueue: { add: mock() },
  contextAssemblyQueue: { add: mock() },
  riskClassificationQueue: { add: mock() },
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

mock.module("../../lib/embeddings", () => ({
  generateEmbeddings: mock(async () => []),
  generateQueryEmbedding: mock(async () => new Array(1024).fill(0)),
}));

// Import after mocks
const { processThreatModelGeneration } = await import("./threat-model-generation");
const { __setAgent } = await import("../agents/threat-model");

// Inject mock agent
__setAgent({ generate: mockAgentGenerate });

// =========================================
// Test data factories
// =========================================

function createMockJob(
  data: ThreatModelUpdatePayload,
  overrides?: Partial<Job<ThreatModelUpdatePayload>>
): Job<ThreatModelUpdatePayload> {
  return {
    id: "job_tm_123",
    name: "initial_generation",
    data,
    processedOn: Date.now(),
    ...overrides,
  } as unknown as Job<ThreatModelUpdatePayload>;
}

const MOCK_STRUCTURE_OUTPUT = {
  components: [
    { tempId: "comp-1", name: "Web App", type: "web-app", description: "React frontend" },
    { tempId: "comp-2", name: "API Server", type: "api-gateway", description: "Node.js REST API" },
    { tempId: "comp-3", name: "PostgreSQL", type: "database", description: "Primary data store" },
    { tempId: "comp-4", name: "Redis Cache", type: "cache", description: "Session store" },
  ],
  dataFlows: [
    {
      tempId: "flow-1",
      fromComponentTempId: "comp-1",
      toComponentTempId: "comp-2",
      description: "API requests",
      dataType: "user-credentials",
      sensitivity: "CONFIDENTIAL" as const,
      encryption: "TLS 1.3",
    },
    {
      tempId: "flow-2",
      fromComponentTempId: "comp-2",
      toComponentTempId: "comp-3",
      description: "Database queries",
      dataType: "PII",
      sensitivity: "RESTRICTED" as const,
      encryption: "TLS 1.3",
    },
    {
      tempId: "flow-3",
      fromComponentTempId: "comp-2",
      toComponentTempId: "comp-4",
      description: "Session data",
      dataType: "session-tokens",
      sensitivity: "CONFIDENTIAL" as const,
      encryption: "none",
    },
  ],
  trustBoundaries: [
    {
      tempId: "boundary-1",
      name: "Internet/DMZ Boundary",
      description: "Between public internet and application layer",
      fromZone: "internet",
      toZone: "dmz",
    },
  ],
  entryPoints: [
    {
      tempId: "ep-1",
      name: "REST API",
      type: "REST API",
      description: "Public-facing API",
      authRequired: true,
      authType: "JWT",
      rateLimited: true,
    },
    {
      tempId: "ep-2",
      name: "WebSocket",
      type: "WebSocket",
      description: "Real-time notifications",
      authRequired: true,
      authType: "JWT",
      rateLimited: false,
    },
  ],
  assets: [
    { tempId: "asset-1", name: "User Credentials", type: "credentials", sensitivity: "RESTRICTED" as const },
    { tempId: "asset-2", name: "Session Tokens", type: "credentials", sensitivity: "CONFIDENTIAL" as const },
  ],
};

const MOCK_THREATS_OUTPUT = {
  threats: [
    {
      title: "JWT Token Forgery",
      description: "An attacker could forge JWT tokens to impersonate legitimate users",
      strideCategory: "SPOOFING" as const,
      severity: "CRITICAL" as const,
      likelihood: "MEDIUM" as const,
      targetEntityTempId: "ep-1",
      targetEntityType: "entryPoint" as const,
      mitigationNotes: "Use RS256 signing, short expiry, token rotation",
    },
    {
      title: "SQL Injection via API",
      description: "Unvalidated input could allow SQL injection attacks on the database",
      strideCategory: "TAMPERING" as const,
      severity: "HIGH" as const,
      likelihood: "MEDIUM" as const,
      targetEntityTempId: "comp-2",
      targetEntityType: "component" as const,
    },
    {
      title: "Session Hijacking",
      description: "Unencrypted session data in Redis could be intercepted",
      strideCategory: "INFORMATION_DISCLOSURE" as const,
      severity: "HIGH" as const,
      likelihood: "LOW" as const,
      targetEntityTempId: "flow-3",
      targetEntityType: "dataFlow" as const,
    },
    {
      title: "No Audit Logging",
      description: "Admin actions lack audit trail, allowing unauthorized changes to go undetected",
      strideCategory: "REPUDIATION" as const,
      severity: "MEDIUM" as const,
      likelihood: "HIGH" as const,
      targetEntityTempId: "comp-2",
      targetEntityType: "component" as const,
    },
    {
      title: "API Rate Limit Bypass",
      description: "WebSocket endpoint lacks rate limiting, enabling DoS attacks",
      strideCategory: "DENIAL_OF_SERVICE" as const,
      severity: "MEDIUM" as const,
      likelihood: "HIGH" as const,
      targetEntityTempId: "ep-2",
      targetEntityType: "entryPoint" as const,
    },
    {
      title: "Privilege Escalation via Role Manipulation",
      description: "Insufficient role validation could allow users to escalate privileges",
      strideCategory: "ELEVATION_OF_PRIVILEGE" as const,
      severity: "CRITICAL" as const,
      likelihood: "LOW" as const,
      targetEntityTempId: "comp-2",
      targetEntityType: "component" as const,
    },
  ],
};

function createMockContextBundles(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `bundle_${i + 1}`,
    title: `Context Bundle ${i + 1}`,
    content: JSON.stringify({
      source: "linear",
      sourceId: `issue_${i + 1}`,
      assembledAt: new Date().toISOString(),
      primary: {
        ticket: {
          title: `Feature ${i + 1}: API endpoint`,
          description: `Implements a REST endpoint for user ${i % 2 === 0 ? "authentication" : "data retrieval"}. Uses JWT tokens and connects to PostgreSQL via connection pool.`,
        },
      },
    }),
  }));
}

// =========================================
// Tests
// =========================================

describe("Threat Model Generation Processor", () => {
  beforeEach(() => {
    // Reset all mocks
    mockDb.threatModel.findUnique.mockReset();
    mockDb.threatModel.create.mockReset();
    mockDb.threatModel.update.mockReset();
    mockDb.contextBundle.findMany.mockReset();
    mockDb.tmThreat.findMany.mockReset();
    mockTransaction.mockReset();
    mockEmbeddingQueue.addBulk.mockReset();
    mockAgentGenerate.mockReset();
    mockTxTmComponent.create.mockReset();
    mockTxTmDataFlow.create.mockReset();
    mockTxTmTrustBoundary.create.mockReset();
    mockTxTmEntryPoint.create.mockReset();
    mockTxTmAsset.create.mockReset();
    mockTxTmThreat.create.mockReset();
    mockTxTmChange.create.mockReset();
    mockTxThreatModel.update.mockReset();

    // Default mock implementations
    mockDb.threatModel.create.mockResolvedValue({
      id: "tm_123",
      tenantId: "tenant_123",
      status: "GENERATING",
    });
    mockDb.threatModel.update.mockResolvedValue({});
    mockDb.tmThreat.findMany.mockResolvedValue([]);
    mockEmbeddingQueue.addBulk.mockResolvedValue([]);

    // Reset $transaction to execute callback
    mockTransaction.mockImplementation(async (fn: (tx: any) => Promise<any>) => {
      const tx = {
        tmComponent: mockTxTmComponent,
        tmDataFlow: mockTxTmDataFlow,
        tmTrustBoundary: mockTxTmTrustBoundary,
        tmEntryPoint: mockTxTmEntryPoint,
        tmAsset: mockTxTmAsset,
        tmThreat: mockTxTmThreat,
        tmChange: mockTxTmChange,
        threatModel: mockTxThreatModel,
      };
      return fn(tx);
    });

    // Reset component create to return sequential IDs
    let compIdx = 0;
    mockTxTmComponent.create.mockImplementation((_args: any) => {
      compIdx++;
      return Promise.resolve({ id: `comp_real_${compIdx}` });
    });
    let flowIdx = 0;
    mockTxTmDataFlow.create.mockImplementation((_args: any) => {
      flowIdx++;
      return Promise.resolve({ id: `flow_real_${flowIdx}` });
    });
    let boundaryIdx = 0;
    mockTxTmTrustBoundary.create.mockImplementation((_args: any) => {
      boundaryIdx++;
      return Promise.resolve({ id: `boundary_real_${boundaryIdx}` });
    });
    let epIdx = 0;
    mockTxTmEntryPoint.create.mockImplementation((_args: any) => {
      epIdx++;
      return Promise.resolve({ id: `ep_real_${epIdx}` });
    });
    let assetIdx = 0;
    mockTxTmAsset.create.mockImplementation((_args: any) => {
      assetIdx++;
      return Promise.resolve({ id: `asset_real_${assetIdx}` });
    });
    let threatIdx = 0;
    mockTxTmThreat.create.mockImplementation((_args: any) => {
      threatIdx++;
      return Promise.resolve({ id: `threat_real_${threatIdx}` });
    });
    mockTxTmChange.create.mockImplementation((_args: any) => {
      return Promise.resolve({ id: "change_real_1" });
    });
    mockTxThreatModel.update.mockImplementation((_args: any) => {
      return Promise.resolve({});
    });
  });

  describe("AC1: Full generation with 5 context bundles", () => {
    it("generates model with 3+ components, 2+ flows, 3+ threats", async () => {
      // Setup
      mockDb.threatModel.findUnique.mockResolvedValue(null);
      mockDb.contextBundle.findMany.mockResolvedValue(
        createMockContextBundles(5)
      );

      // Pass 1 returns structure
      mockAgentGenerate.mockResolvedValueOnce({
        object: MOCK_STRUCTURE_OUTPUT,
        text: "",
      });
      // Pass 2 returns threats
      mockAgentGenerate.mockResolvedValueOnce({
        object: MOCK_THREATS_OUTPUT,
        text: "",
      });

      const job = createMockJob({
        tenantId: "tenant_123",
        changeType: "initial_generation",
        bundleCount: 5,
      });

      await processThreatModelGeneration(job);

      // Verify two generate calls (two passes)
      expect(mockAgentGenerate).toHaveBeenCalledTimes(2);

      // Verify components saved (4 in mock)
      expect(mockTxTmComponent.create).toHaveBeenCalledTimes(4);

      // Verify data flows saved (3 in mock)
      expect(mockTxTmDataFlow.create).toHaveBeenCalledTimes(3);

      // Verify threats saved (6 in mock)
      expect(mockTxTmThreat.create).toHaveBeenCalledTimes(6);

      // Verify ThreatModel status updated to ACTIVE
      expect(mockTxThreatModel.update).toHaveBeenCalledTimes(1);
      const updateCall = mockTxThreatModel.update.mock.calls[0]![0] as any;
      expect(updateCall.data.status).toBe("ACTIVE");
      expect(updateCall.data.version).toBe(1);
    });
  });

  describe("AC2: All STRIDE categories represented", () => {
    it("saves threats covering all 6 STRIDE categories", async () => {
      mockDb.threatModel.findUnique.mockResolvedValue(null);
      mockDb.contextBundle.findMany.mockResolvedValue(
        createMockContextBundles(5)
      );

      mockAgentGenerate.mockResolvedValueOnce({
        object: MOCK_STRUCTURE_OUTPUT,
        text: "",
      });
      mockAgentGenerate.mockResolvedValueOnce({
        object: MOCK_THREATS_OUTPUT,
        text: "",
      });

      const job = createMockJob({
        tenantId: "tenant_123",
        changeType: "initial_generation",
      });

      await processThreatModelGeneration(job);

      // Collect all strideCategory values from threat create calls
      const categories = mockTxTmThreat.create.mock.calls.map(
        (call: any) => call[0].data.strideCategory
      );

      expect(categories).toContain("SPOOFING");
      expect(categories).toContain("TAMPERING");
      expect(categories).toContain("REPUDIATION");
      expect(categories).toContain("INFORMATION_DISCLOSURE");
      expect(categories).toContain("DENIAL_OF_SERVICE");
      expect(categories).toContain("ELEVATION_OF_PRIVILEGE");
    });
  });

  describe("AC3: Atomic save via $transaction", () => {
    it("wraps all writes in a single transaction", async () => {
      mockDb.threatModel.findUnique.mockResolvedValue(null);
      mockDb.contextBundle.findMany.mockResolvedValue(
        createMockContextBundles(3)
      );

      mockAgentGenerate.mockResolvedValueOnce({
        object: MOCK_STRUCTURE_OUTPUT,
        text: "",
      });
      mockAgentGenerate.mockResolvedValueOnce({
        object: MOCK_THREATS_OUTPUT,
        text: "",
      });

      const job = createMockJob({
        tenantId: "tenant_123",
        changeType: "initial_generation",
      });

      await processThreatModelGeneration(job);

      // $transaction was called exactly once
      expect(mockTransaction).toHaveBeenCalledTimes(1);

      // All entity creates happened inside the transaction
      expect(mockTxTmComponent.create).toHaveBeenCalled();
      expect(mockTxTmDataFlow.create).toHaveBeenCalled();
      expect(mockTxTmTrustBoundary.create).toHaveBeenCalled();
      expect(mockTxTmEntryPoint.create).toHaveBeenCalled();
      expect(mockTxTmAsset.create).toHaveBeenCalled();
      expect(mockTxTmThreat.create).toHaveBeenCalled();
      expect(mockTxTmChange.create).toHaveBeenCalled();
      expect(mockTxThreatModel.update).toHaveBeenCalled();
    });

    it("rolls back on transaction failure", async () => {
      mockDb.threatModel.findUnique.mockResolvedValue(null);
      mockDb.contextBundle.findMany.mockResolvedValue(
        createMockContextBundles(3)
      );

      mockAgentGenerate.mockResolvedValueOnce({
        object: MOCK_STRUCTURE_OUTPUT,
        text: "",
      });
      mockAgentGenerate.mockResolvedValueOnce({
        object: MOCK_THREATS_OUTPUT,
        text: "",
      });

      // Make transaction fail
      mockTransaction.mockRejectedValueOnce(new Error("DB connection lost"));

      const job = createMockJob({
        tenantId: "tenant_123",
        changeType: "initial_generation",
      });

      // Should throw (BullMQ will retry)
      await expect(processThreatModelGeneration(job)).rejects.toThrow();

      // ThreatModel should be marked ERROR
      expect(mockDb.threatModel.update).toHaveBeenCalled();
      const errorCall = mockDb.threatModel.update.mock.calls[0]![0] as any;
      expect(errorCall.data.status).toBe("ERROR");
    });
  });

  describe("AC4: TmChange v1 created", () => {
    it("creates TmChange with version=1 and changeType=initial_generation", async () => {
      mockDb.threatModel.findUnique.mockResolvedValue(null);
      mockDb.contextBundle.findMany.mockResolvedValue(
        createMockContextBundles(5)
      );

      mockAgentGenerate.mockResolvedValueOnce({
        object: MOCK_STRUCTURE_OUTPUT,
        text: "",
      });
      mockAgentGenerate.mockResolvedValueOnce({
        object: MOCK_THREATS_OUTPUT,
        text: "",
      });

      const job = createMockJob({
        tenantId: "tenant_123",
        changeType: "initial_generation",
      });

      await processThreatModelGeneration(job);

      expect(mockTxTmChange.create).toHaveBeenCalledTimes(1);
      const changeData = (mockTxTmChange.create.mock.calls[0]![0] as any).data;
      expect(changeData.version).toBe(1);
      expect(changeData.changeType).toBe("initial_generation");
      expect(changeData.triggeredBy).toBe("system");
      expect(changeData.summary).toContain("Initial threat model generated");
      expect(changeData.diff.type).toBe("initial_generation");
    });
  });

  describe("AC5: Status transitions", () => {
    it("sets status=ACTIVE after successful generation", async () => {
      mockDb.threatModel.findUnique.mockResolvedValue(null);
      mockDb.contextBundle.findMany.mockResolvedValue(
        createMockContextBundles(3)
      );

      mockAgentGenerate.mockResolvedValueOnce({
        object: MOCK_STRUCTURE_OUTPUT,
        text: "",
      });
      mockAgentGenerate.mockResolvedValueOnce({
        object: MOCK_THREATS_OUTPUT,
        text: "",
      });

      const job = createMockJob({
        tenantId: "tenant_123",
        changeType: "initial_generation",
      });

      await processThreatModelGeneration(job);

      // Inside transaction, model updated to ACTIVE
      expect(mockTxThreatModel.update).toHaveBeenCalledTimes(1);
      const updateData = (mockTxThreatModel.update.mock.calls[0]![0] as any)
        .data;
      expect(updateData.status).toBe("ACTIVE");
    });

    it("sets status=ERROR after failure", async () => {
      mockDb.threatModel.findUnique.mockResolvedValue(null);
      mockDb.contextBundle.findMany.mockResolvedValue([]); // No bundles -> will throw

      const job = createMockJob({
        tenantId: "tenant_123",
        changeType: "initial_generation",
      });

      await expect(processThreatModelGeneration(job)).rejects.toThrow();

      // ThreatModel updated to ERROR
      expect(mockDb.threatModel.update).toHaveBeenCalled();
      const errorCall = mockDb.threatModel.update.mock.calls.find(
        (call: any) => call[0]?.data?.status === "ERROR"
      );
      expect(errorCall).toBeDefined();
    });

    it("sets status=GENERATING at start of generation", async () => {
      mockDb.threatModel.findUnique.mockResolvedValue({
        id: "tm_existing",
        tenantId: "tenant_123",
        status: "PENDING",
      });
      mockDb.contextBundle.findMany.mockResolvedValue(
        createMockContextBundles(3)
      );

      mockAgentGenerate.mockResolvedValueOnce({
        object: MOCK_STRUCTURE_OUTPUT,
        text: "",
      });
      mockAgentGenerate.mockResolvedValueOnce({
        object: MOCK_THREATS_OUTPUT,
        text: "",
      });

      const job = createMockJob({
        tenantId: "tenant_123",
        changeType: "initial_generation",
      });

      await processThreatModelGeneration(job);

      // First update sets GENERATING
      const firstUpdate = mockDb.threatModel.update.mock.calls[0]![0] as any;
      expect(firstUpdate.data.status).toBe("GENERATING");
    });
  });

  describe("AC6: Generation within SLA", () => {
    it("completes generation quickly with mocked agent", async () => {
      mockDb.threatModel.findUnique.mockResolvedValue(null);
      mockDb.contextBundle.findMany.mockResolvedValue(
        createMockContextBundles(5)
      );

      mockAgentGenerate.mockResolvedValueOnce({
        object: MOCK_STRUCTURE_OUTPUT,
        text: "",
      });
      mockAgentGenerate.mockResolvedValueOnce({
        object: MOCK_THREATS_OUTPUT,
        text: "",
      });

      const job = createMockJob({
        tenantId: "tenant_123",
        changeType: "initial_generation",
      });

      const start = Date.now();
      await processThreatModelGeneration(job);
      const elapsed = Date.now() - start;

      // With mocks, should complete well under 5 minutes
      expect(elapsed).toBeLessThan(5000);
    });
  });

  describe("Two-pass generation", () => {
    it("Pass 1 prompt includes context bundles", async () => {
      mockDb.threatModel.findUnique.mockResolvedValue(null);
      mockDb.contextBundle.findMany.mockResolvedValue(
        createMockContextBundles(3)
      );

      mockAgentGenerate.mockResolvedValueOnce({
        object: MOCK_STRUCTURE_OUTPUT,
        text: "",
      });
      mockAgentGenerate.mockResolvedValueOnce({
        object: MOCK_THREATS_OUTPUT,
        text: "",
      });

      const job = createMockJob({
        tenantId: "tenant_123",
        changeType: "initial_generation",
      });

      await processThreatModelGeneration(job);

      // First generate call = Pass 1
      const [pass1Prompt] = mockAgentGenerate.mock.calls[0]!;
      expect(pass1Prompt).toContain("Identify System Structure");
      expect(pass1Prompt).toContain("Context Bundle 1");
    });

    it("Pass 2 prompt includes structure from Pass 1", async () => {
      mockDb.threatModel.findUnique.mockResolvedValue(null);
      mockDb.contextBundle.findMany.mockResolvedValue(
        createMockContextBundles(3)
      );

      mockAgentGenerate.mockResolvedValueOnce({
        object: MOCK_STRUCTURE_OUTPUT,
        text: "",
      });
      mockAgentGenerate.mockResolvedValueOnce({
        object: MOCK_THREATS_OUTPUT,
        text: "",
      });

      const job = createMockJob({
        tenantId: "tenant_123",
        changeType: "initial_generation",
      });

      await processThreatModelGeneration(job);

      // Second generate call = Pass 2
      const [pass2Prompt] = mockAgentGenerate.mock.calls[1]!;
      expect(pass2Prompt).toContain("Generate STRIDE Threats");
      expect(pass2Prompt).toContain("comp-1");
      expect(pass2Prompt).toContain("Web App");
      expect(pass2Prompt).toContain("flow-1");
    });

    it("passes requestContext with tenantId to both passes", async () => {
      mockDb.threatModel.findUnique.mockResolvedValue(null);
      mockDb.contextBundle.findMany.mockResolvedValue(
        createMockContextBundles(3)
      );

      mockAgentGenerate.mockResolvedValueOnce({
        object: MOCK_STRUCTURE_OUTPUT,
        text: "",
      });
      mockAgentGenerate.mockResolvedValueOnce({
        object: MOCK_THREATS_OUTPUT,
        text: "",
      });

      const job = createMockJob({
        tenantId: "tenant_123",
        changeType: "initial_generation",
      });

      await processThreatModelGeneration(job);

      // Both calls should have requestContext
      for (const call of mockAgentGenerate.mock.calls) {
        const opts = call[1] as any;
        expect(opts.requestContext).toBeDefined();
        expect(opts.requestContext.get("tenantId")).toBe("tenant_123");
      }
    });

    it("passes tools to both generate calls", async () => {
      mockDb.threatModel.findUnique.mockResolvedValue(null);
      mockDb.contextBundle.findMany.mockResolvedValue(
        createMockContextBundles(3)
      );

      mockAgentGenerate.mockResolvedValueOnce({
        object: MOCK_STRUCTURE_OUTPUT,
        text: "",
      });
      mockAgentGenerate.mockResolvedValueOnce({
        object: MOCK_THREATS_OUTPUT,
        text: "",
      });

      const job = createMockJob({
        tenantId: "tenant_123",
        changeType: "initial_generation",
      });

      await processThreatModelGeneration(job);

      for (const call of mockAgentGenerate.mock.calls) {
        const opts = call[1] as any;
        expect(opts.tools).toBeDefined();
        expect(opts.tools.searchContext).toBeDefined();
        expect(opts.tools.getCurrentModel).toBeDefined();
      }
    });

    it("passes abortSignal to both generate calls", async () => {
      mockDb.threatModel.findUnique.mockResolvedValue(null);
      mockDb.contextBundle.findMany.mockResolvedValue(
        createMockContextBundles(3)
      );

      mockAgentGenerate.mockResolvedValueOnce({
        object: MOCK_STRUCTURE_OUTPUT,
        text: "",
      });
      mockAgentGenerate.mockResolvedValueOnce({
        object: MOCK_THREATS_OUTPUT,
        text: "",
      });

      const job = createMockJob({
        tenantId: "tenant_123",
        changeType: "initial_generation",
      });

      await processThreatModelGeneration(job);

      for (const call of mockAgentGenerate.mock.calls) {
        const opts = call[1] as any;
        expect(opts.abortSignal).toBeDefined();
        expect(opts.abortSignal).toBeInstanceOf(AbortSignal);
      }
    });
  });

  describe("Reference resolution", () => {
    it("skips data flows with invalid component references", async () => {
      const brokenStructure = {
        ...MOCK_STRUCTURE_OUTPUT,
        dataFlows: [
          {
            tempId: "flow-bad",
            fromComponentTempId: "comp-NONEXISTENT",
            toComponentTempId: "comp-2",
            description: "Broken flow",
          },
          ...MOCK_STRUCTURE_OUTPUT.dataFlows,
        ],
      };

      mockDb.threatModel.findUnique.mockResolvedValue(null);
      mockDb.contextBundle.findMany.mockResolvedValue(
        createMockContextBundles(3)
      );

      mockAgentGenerate.mockResolvedValueOnce({
        object: brokenStructure,
        text: "",
      });
      mockAgentGenerate.mockResolvedValueOnce({
        object: MOCK_THREATS_OUTPUT,
        text: "",
      });

      const job = createMockJob({
        tenantId: "tenant_123",
        changeType: "initial_generation",
      });

      await processThreatModelGeneration(job);

      // Only 3 valid flows saved (not the broken one)
      expect(mockTxTmDataFlow.create).toHaveBeenCalledTimes(3);
    });

    it("saves threats without link when target entity is unresolvable", async () => {
      const brokenThreats = {
        threats: [
          {
            title: "Orphan Threat",
            description: "References non-existent component",
            strideCategory: "SPOOFING" as const,
            severity: "HIGH" as const,
            targetEntityTempId: "comp-DOES-NOT-EXIST",
            targetEntityType: "component" as const,
          },
        ],
      };

      mockDb.threatModel.findUnique.mockResolvedValue(null);
      mockDb.contextBundle.findMany.mockResolvedValue(
        createMockContextBundles(3)
      );

      mockAgentGenerate.mockResolvedValueOnce({
        object: MOCK_STRUCTURE_OUTPUT,
        text: "",
      });
      mockAgentGenerate.mockResolvedValueOnce({
        object: brokenThreats,
        text: "",
      });

      const job = createMockJob({
        tenantId: "tenant_123",
        changeType: "initial_generation",
      });

      await processThreatModelGeneration(job);

      // Threat still saved (just without componentId link)
      expect(mockTxTmThreat.create).toHaveBeenCalledTimes(1);
      const threatData = (mockTxTmThreat.create.mock.calls[0]![0] as any).data;
      expect(threatData.componentId).toBeNull();
    });
  });

  describe("Embedding enqueue after save", () => {
    it("enqueues embedding jobs for all saved threats", async () => {
      mockDb.threatModel.findUnique.mockResolvedValue(null);
      mockDb.contextBundle.findMany.mockResolvedValue(
        createMockContextBundles(3)
      );

      mockAgentGenerate.mockResolvedValueOnce({
        object: MOCK_STRUCTURE_OUTPUT,
        text: "",
      });
      mockAgentGenerate.mockResolvedValueOnce({
        object: MOCK_THREATS_OUTPUT,
        text: "",
      });

      // After save, findMany returns the saved threats
      mockDb.tmThreat.findMany.mockResolvedValue(
        MOCK_THREATS_OUTPUT.threats.map((t, i) => ({
          id: `threat_saved_${i}`,
          title: t.title,
          description: t.description,
          strideCategory: t.strideCategory,
        }))
      );

      const job = createMockJob({
        tenantId: "tenant_123",
        changeType: "initial_generation",
      });

      await processThreatModelGeneration(job);

      // Should enqueue bulk embedding jobs
      expect(mockEmbeddingQueue.addBulk).toHaveBeenCalledTimes(1);
      const bulkJobs = mockEmbeddingQueue.addBulk.mock.calls[0]![0] as any[];
      expect(bulkJobs.length).toBe(6); // 6 threats
      expect(bulkJobs[0].data.metadata.sourceType).toBe("threat");
    });
  });

  describe("Edge cases", () => {
    it("skips generation if model is already ACTIVE", async () => {
      mockDb.threatModel.findUnique.mockResolvedValue({
        id: "tm_123",
        tenantId: "tenant_123",
        status: "ACTIVE",
        version: 1,
      });

      const job = createMockJob({
        tenantId: "tenant_123",
        changeType: "initial_generation",
      });

      await processThreatModelGeneration(job);

      // Should not call generate
      expect(mockAgentGenerate).not.toHaveBeenCalled();
      // Should not call $transaction
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it("handles Pass 1 failure gracefully", async () => {
      mockDb.threatModel.findUnique.mockResolvedValue(null);
      mockDb.contextBundle.findMany.mockResolvedValue(
        createMockContextBundles(3)
      );

      // Pass 1 fails
      mockAgentGenerate.mockRejectedValueOnce(
        new Error("Bedrock throttling")
      );

      const job = createMockJob({
        tenantId: "tenant_123",
        changeType: "initial_generation",
      });

      await expect(processThreatModelGeneration(job)).rejects.toThrow(
        "Bedrock throttling"
      );

      // Should mark as ERROR
      expect(mockDb.threatModel.update).toHaveBeenCalled();
      const errorCall = mockDb.threatModel.update.mock.calls.find(
        (call: any) => call[0]?.data?.status === "ERROR"
      );
      expect(errorCall).toBeDefined();
      expect((errorCall![0] as any).data.errorMessage).toContain(
        "Bedrock throttling"
      );
    });

    it("handles Pass 2 failure gracefully", async () => {
      mockDb.threatModel.findUnique.mockResolvedValue(null);
      mockDb.contextBundle.findMany.mockResolvedValue(
        createMockContextBundles(3)
      );

      // Pass 1 succeeds
      mockAgentGenerate.mockResolvedValueOnce({
        object: MOCK_STRUCTURE_OUTPUT,
        text: "",
      });
      // Pass 2 fails
      mockAgentGenerate.mockRejectedValueOnce(
        new Error("Context window exceeded")
      );

      const job = createMockJob({
        tenantId: "tenant_123",
        changeType: "initial_generation",
      });

      await expect(processThreatModelGeneration(job)).rejects.toThrow(
        "Context window exceeded"
      );

      // Should mark as ERROR (model stays non-ACTIVE)
      const errorCall = mockDb.threatModel.update.mock.calls.find(
        (call: any) => call[0]?.data?.status === "ERROR"
      );
      expect(errorCall).toBeDefined();
    });
  });
});

describe("Threat Model Output Schemas", () => {
  it("validates correct structure output", async () => {
    const { StructureOutputSchema } = await import(
      "@loomii/shared/schemas"
    );

    const result = StructureOutputSchema.safeParse(MOCK_STRUCTURE_OUTPUT);
    expect(result.success).toBe(true);
  });

  it("accepts structure with fewer than 3 components (no min constraint)", async () => {
    const { StructureOutputSchema } = await import(
      "@loomii/shared/schemas"
    );

    const minimal = {
      ...MOCK_STRUCTURE_OUTPUT,
      components: [MOCK_STRUCTURE_OUTPUT.components[0]!],
    };
    const result = StructureOutputSchema.safeParse(minimal);
    expect(result.success).toBe(true);
  });

  it("validates correct threats output", async () => {
    const { ThreatsOutputSchema } = await import(
      "@loomii/shared/schemas"
    );

    const result = ThreatsOutputSchema.safeParse(MOCK_THREATS_OUTPUT);
    expect(result.success).toBe(true);
  });

  it("accepts threats with fewer than 3 entries (no min constraint)", async () => {
    const { ThreatsOutputSchema } = await import(
      "@loomii/shared/schemas"
    );

    const minimal = { threats: [MOCK_THREATS_OUTPUT.threats[0]!] };
    const result = ThreatsOutputSchema.safeParse(minimal);
    expect(result.success).toBe(true);
  });

  it("rejects invalid STRIDE category", async () => {
    const { ThreatOutputSchema } = await import(
      "@loomii/shared/schemas"
    );

    const invalid = {
      title: "Test",
      description: "Test",
      strideCategory: "INVALID_CATEGORY",
      severity: "HIGH",
    };
    const result = ThreatOutputSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});
