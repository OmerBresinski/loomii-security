/**
 * Tests for Threat Embeddings and Threat Model Events.
 *
 * Covers:
 * - AC1: Each threat has an embedding after generation
 * - AC2: Modified threat -> embedding replaced (upsert)
 * - AC3: Semantic search content includes relevant text
 * - AC4: "threat-model.generated" event published
 * - AC5: "threat-model.updated" event published
 * - AC6: Embeddings are tenant-scoped
 */
import { describe, it, expect, beforeEach, mock } from "bun:test";

// =========================================
// Mock setup
// =========================================

const mockInsertEmbedding = mock((_db: any, _data: any) => Promise.resolve());

const mockDb = {
  tmThreat: {
    findMany: mock((_args: any) => Promise.resolve([] as any[])),
  },
};

const mockGenerateEmbeddings = mock(async (chunks: any[]) =>
  chunks.map((c: any) => ({
    index: c.index,
    content: c.content,
    vector: new Array(1024).fill(0.1),
  }))
);

const mockEventsQueue = {
  add: mock((_name: string, _payload: any) =>
    Promise.resolve({ id: "evt_job_123" })
  ),
};

mock.module("@loomii/db", () => ({
  db: mockDb,
  insertEmbedding: mockInsertEmbedding,
  vectorSearch: async () => [],
}));

mock.module("@loomii/queue", () => ({
  eventsQueue: mockEventsQueue,
  embeddingQueue: { add: mock(), addBulk: mock() },
  reviewQueue: { add: mock() },
  contextAssemblyQueue: { add: mock() },
  riskClassificationQueue: { add: mock() },
  notionPollingQueue: { add: mock() },
  integrationHealthQueue: { add: mock() },
  threatModelQueue: { add: mock() },
  createRedisConnection: () => ({}),
  QUEUE_NAMES: {},
  ALL_QUEUE_NAMES: [],
}));

mock.module("./embeddings", () => ({
  generateEmbeddings: mockGenerateEmbeddings,
  generateQueryEmbedding: mock(async () => new Array(1024).fill(0)),
}));

// Import after mocks
const { embedThreats, embedSpecificThreats } = await import("./threat-embeddings");
const { publishThreatModelGenerated, publishThreatModelUpdated } = await import("./threat-model-events");

// =========================================
// Test Data
// =========================================

const TENANT_ID = "tenant_test_123";
const THREAT_MODEL_ID = "tm_test_456";

const MOCK_THREATS = [
  {
    id: "threat_1",
    title: "SQL Injection via API",
    description: "Unvalidated input could allow SQL injection",
    strideCategory: "TAMPERING",
    severity: "HIGH",
    likelihood: "MEDIUM",
  },
  {
    id: "threat_2",
    title: "JWT Token Forgery",
    description: "Weak signing allows token forgery",
    strideCategory: "SPOOFING",
    severity: "CRITICAL",
    likelihood: "LOW",
  },
  {
    id: "threat_3",
    title: "Session Hijacking",
    description: "Unencrypted session data in Redis",
    strideCategory: "INFORMATION_DISCLOSURE",
    severity: "HIGH",
    likelihood: "MEDIUM",
  },
];

// =========================================
// Threat Embeddings Tests
// =========================================

describe("Threat Embeddings", () => {
  beforeEach(() => {
    mockDb.tmThreat.findMany.mockReset();
    mockInsertEmbedding.mockReset();
    mockGenerateEmbeddings.mockReset();

    mockInsertEmbedding.mockResolvedValue(undefined);
    mockGenerateEmbeddings.mockImplementation(async (chunks: any[]) =>
      chunks.map((c: any) => ({
        index: c.index,
        content: c.content,
        vector: new Array(1024).fill(0.1),
      }))
    );
  });

  describe("AC1: Each threat has an embedding after generation", () => {
    it("embeds all active threats", async () => {
      mockDb.tmThreat.findMany.mockResolvedValue(MOCK_THREATS);

      const result = await embedThreats(TENANT_ID, THREAT_MODEL_ID);

      // Should generate embeddings for all 3 threats
      expect(mockGenerateEmbeddings).toHaveBeenCalledTimes(1);
      const chunks = mockGenerateEmbeddings.mock.calls[0]![0] as any[];
      expect(chunks.length).toBe(3);

      // Should insert 3 embeddings
      expect(mockInsertEmbedding).toHaveBeenCalledTimes(3);
      expect(result.embedded).toBe(3);
    });

    it("returns zero when no threats exist", async () => {
      mockDb.tmThreat.findMany.mockResolvedValue([]);

      const result = await embedThreats(TENANT_ID, THREAT_MODEL_ID);

      expect(mockGenerateEmbeddings).not.toHaveBeenCalled();
      expect(mockInsertEmbedding).not.toHaveBeenCalled();
      expect(result.embedded).toBe(0);
    });
  });

  describe("AC2: Modified threat -> embedding replaced (upsert)", () => {
    it("uses deterministic ID for upsert semantics", async () => {
      mockDb.tmThreat.findMany.mockResolvedValue([MOCK_THREATS[0]!]);

      await embedThreats(TENANT_ID, THREAT_MODEL_ID);

      const insertCall = mockInsertEmbedding.mock.calls[0]![1] as any;

      // ID is deterministic: tenantId_threat_{threatId}_0
      expect(insertCall.id).toBe(`${TENANT_ID}_threat_threat_1_0`);
      expect(insertCall.documentId).toBe("threat_threat_1");
      expect(insertCall.chunk).toBe(0);

      // Running again with same threat produces same ID -> upsert replaces
      mockInsertEmbedding.mockReset();
      mockInsertEmbedding.mockResolvedValue(undefined);
      await embedThreats(TENANT_ID, THREAT_MODEL_ID);

      const secondCall = mockInsertEmbedding.mock.calls[0]![1] as any;
      expect(secondCall.id).toBe(`${TENANT_ID}_threat_threat_1_0`);
    });
  });

  describe("AC3: Embedding content includes relevant text", () => {
    it("includes STRIDE category, severity, title, and description", async () => {
      mockDb.tmThreat.findMany.mockResolvedValue([MOCK_THREATS[0]!]);

      await embedThreats(TENANT_ID, THREAT_MODEL_ID);

      const chunks = mockGenerateEmbeddings.mock.calls[0]![0] as any[];
      const content = chunks[0].content;

      expect(content).toContain("[TAMPERING]");
      expect(content).toContain("[HIGH]");
      expect(content).toContain("SQL Injection via API");
      expect(content).toContain("Unvalidated input could allow SQL injection");
      expect(content).toContain("Likelihood: MEDIUM");
    });
  });

  describe("AC6: Embeddings are tenant-scoped", () => {
    it("passes tenantId to insertEmbedding", async () => {
      mockDb.tmThreat.findMany.mockResolvedValue(MOCK_THREATS);

      await embedThreats(TENANT_ID, THREAT_MODEL_ID);

      // All insert calls should include the tenantId
      for (const call of mockInsertEmbedding.mock.calls) {
        const data = call[1] as any;
        expect(data.tenantId).toBe(TENANT_ID);
      }
    });

    it("includes sourceType=threat in metadata", async () => {
      mockDb.tmThreat.findMany.mockResolvedValue([MOCK_THREATS[1]!]);

      await embedThreats(TENANT_ID, THREAT_MODEL_ID);

      const data = mockInsertEmbedding.mock.calls[0]![1] as any;
      expect(data.metadata.sourceType).toBe("threat");
      expect(data.metadata.threatId).toBe("threat_2");
      expect(data.metadata.threatModelId).toBe(THREAT_MODEL_ID);
      expect(data.metadata.strideCategory).toBe("SPOOFING");
      expect(data.metadata.severity).toBe("CRITICAL");
    });
  });

  describe("embedSpecificThreats", () => {
    it("embeds only specified threat IDs", async () => {
      mockDb.tmThreat.findMany.mockResolvedValue([MOCK_THREATS[0]!]);

      const result = await embedSpecificThreats(
        TENANT_ID,
        THREAT_MODEL_ID,
        ["threat_1"]
      );

      expect(result.embedded).toBe(1);

      // Verify findMany was called with id filter
      const findCall = mockDb.tmThreat.findMany.mock.calls[0]![0] as any;
      expect(findCall.where.id.in).toContain("threat_1");
    });

    it("returns zero for empty threatIds array", async () => {
      const result = await embedSpecificThreats(TENANT_ID, THREAT_MODEL_ID, []);

      expect(result.embedded).toBe(0);
      expect(mockDb.tmThreat.findMany).not.toHaveBeenCalled();
    });
  });

  describe("Performance", () => {
    it("completes within SLA for mocked 50 threats", async () => {
      const fiftyThreats = Array.from({ length: 50 }, (_, i) => ({
        id: `threat_${i}`,
        title: `Threat ${i}`,
        description: `Description for threat ${i}`,
        strideCategory: "TAMPERING",
        severity: "HIGH",
        likelihood: "MEDIUM",
      }));

      mockDb.tmThreat.findMany.mockResolvedValue(fiftyThreats);

      const start = Date.now();
      const result = await embedThreats(TENANT_ID, THREAT_MODEL_ID);
      const elapsed = Date.now() - start;

      expect(result.embedded).toBe(50);
      expect(elapsed).toBeLessThan(5000); // With mocks, well under 30s
    });
  });
});

// =========================================
// Threat Model Events Tests
// =========================================

describe("Threat Model Events", () => {
  beforeEach(() => {
    mockEventsQueue.add.mockReset();
    mockEventsQueue.add.mockResolvedValue({ id: "evt_job" });
  });

  describe("AC4: threat-model.generated event published", () => {
    it("publishes generated event with correct payload", async () => {
      await publishThreatModelGenerated({
        tenantId: TENANT_ID,
        modelId: THREAT_MODEL_ID,
        version: 1,
        summary: {
          components: 4,
          dataFlows: 3,
          trustBoundaries: 1,
          entryPoints: 2,
          assets: 2,
          threats: 6,
          gaps: 3,
        },
      });

      expect(mockEventsQueue.add).toHaveBeenCalledTimes(1);

      const [eventName, payload] = mockEventsQueue.add.mock.calls[0]!;
      expect(eventName).toBe("threat-model.generated");
      expect(payload.tenantId).toBe(TENANT_ID);
      expect(payload.eventType).toBe("threat-model.generated");
      expect(payload.data.modelId).toBe(THREAT_MODEL_ID);
      expect(payload.data.version).toBe(1);
      expect(payload.data.summary.threats).toBe(6);
      expect(payload.data.summary.components).toBe(4);
      expect(payload.timestamp).toBeDefined();
    });
  });

  describe("AC5: threat-model.updated event published", () => {
    it("publishes updated event with correct payload", async () => {
      await publishThreatModelUpdated({
        tenantId: TENANT_ID,
        modelId: THREAT_MODEL_ID,
        version: 3,
        changeType: "incremental_update",
        summary: {
          added: 1,
          modified: 2,
          deprecated: 0,
          threatsAdded: 2,
          threatsModified: 1,
          gapsCreated: 1,
          gapsResolved: 0,
        },
      });

      expect(mockEventsQueue.add).toHaveBeenCalledTimes(1);

      const [eventName, payload] = mockEventsQueue.add.mock.calls[0]!;
      expect(eventName).toBe("threat-model.updated");
      expect(payload.tenantId).toBe(TENANT_ID);
      expect(payload.eventType).toBe("threat-model.updated");
      expect(payload.data.modelId).toBe(THREAT_MODEL_ID);
      expect(payload.data.version).toBe(3);
      expect(payload.data.changeType).toBe("incremental_update");
      expect(payload.data.summary.threatsAdded).toBe(2);
      expect(payload.data.summary.gapsCreated).toBe(1);
      expect(payload.timestamp).toBeDefined();
    });
  });

  describe("Event payloads", () => {
    it("generated event includes ISO timestamp", async () => {
      await publishThreatModelGenerated({
        tenantId: TENANT_ID,
        modelId: THREAT_MODEL_ID,
        version: 1,
        summary: {
          components: 0,
          dataFlows: 0,
          trustBoundaries: 0,
          entryPoints: 0,
          assets: 0,
          threats: 0,
          gaps: 0,
        },
      });

      const [, payload] = mockEventsQueue.add.mock.calls[0]!;
      // Verify timestamp is valid ISO string
      const parsed = new Date(payload.timestamp);
      expect(parsed.toISOString()).toBe(payload.timestamp);
    });
  });
});
