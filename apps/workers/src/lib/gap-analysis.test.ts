/**
 * Tests for Gap Analysis.
 *
 * All DB calls are mocked via bun:test mock.module.
 * Tests cover:
 * - AC1: Unmitigated critical threat -> critical gap created
 * - AC2: Entry point with authRequired=false -> high gap created
 * - AC3: Threat updated to mitigated -> corresponding gap auto-resolves
 * - AC4: Component with zero threats -> low gap created
 * - AC5: Analysis completes within 10 seconds (mocked)
 * - AC6: Running twice produces same result (idempotent)
 */
import { describe, it, expect, beforeEach, mock } from "bun:test";

// =========================================
// Mock setup
// =========================================

const mockTmThreat = {
  findMany: mock((_args: any) => Promise.resolve([] as any[])),
};

const mockTmDataFlow = {
  findMany: mock((_args: any) => Promise.resolve([] as any[])),
};

const mockTmEntryPoint = {
  findMany: mock((_args: any) => Promise.resolve([] as any[])),
};

const mockTmComponent = {
  findMany: mock((_args: any) => Promise.resolve([] as any[])),
};

const mockTmGap = {
  findMany: mock((_args: any) => Promise.resolve([] as any[])),
  createMany: mock((_args: any) => Promise.resolve({ count: 0 })),
  updateMany: mock((_args: any) => Promise.resolve({ count: 0 })),
  count: mock((_args: any) => Promise.resolve(0)),
};

const mockDb = {
  tmThreat: mockTmThreat,
  tmDataFlow: mockTmDataFlow,
  tmEntryPoint: mockTmEntryPoint,
  tmComponent: mockTmComponent,
  tmGap: mockTmGap,
};

mock.module("@loomii/db", () => ({
  vectorSearch: async () => [], insertEmbedding: async () => {},
  db: mockDb,
}));

// Import after mocks
const { runGapAnalysis, GAP_TYPES } = await import("./gap-analysis");

// =========================================
// Test Data
// =========================================

const THREAT_MODEL_ID = "tm_test_123";

// =========================================
// Tests
// =========================================

describe("Gap Analysis", () => {
  beforeEach(() => {
    mockTmThreat.findMany.mockReset();
    mockTmDataFlow.findMany.mockReset();
    mockTmEntryPoint.findMany.mockReset();
    mockTmComponent.findMany.mockReset();
    mockTmGap.findMany.mockReset();
    mockTmGap.createMany.mockReset();
    mockTmGap.updateMany.mockReset();
    mockTmGap.count.mockReset();

    // Default: nothing found
    mockTmThreat.findMany.mockResolvedValue([]);
    mockTmDataFlow.findMany.mockResolvedValue([]);
    mockTmEntryPoint.findMany.mockResolvedValue([]);
    mockTmComponent.findMany.mockResolvedValue([]);
    mockTmGap.findMany.mockResolvedValue([]);
    mockTmGap.createMany.mockResolvedValue({ count: 0 });
    mockTmGap.updateMany.mockResolvedValue({ count: 0 });
    mockTmGap.count.mockResolvedValue(0);
  });

  describe("AC1: Unmitigated critical threat -> critical gap", () => {
    it("detects unmitigated critical threat and creates gap", async () => {
      // Simulate: critical threat query returns a result
      mockTmThreat.findMany.mockImplementation((args: any) => {
        if (args.where.severity === "CRITICAL") {
          return Promise.resolve([
            { id: "threat_1", title: "SQL Injection on Login" },
          ]);
        }
        return Promise.resolve([]);
      });

      mockTmGap.count.mockResolvedValue(1);

      const result = await runGapAnalysis(THREAT_MODEL_ID);

      // Should have called createMany with the critical gap
      expect(mockTmGap.createMany).toHaveBeenCalledTimes(1);
      const createCall = mockTmGap.createMany.mock.calls[0]![0] as any;
      const gaps = createCall.data;

      const criticalGap = gaps.find(
        (g: any) => g.type === GAP_TYPES.UNMITIGATED_CRITICAL_THREAT
      );
      expect(criticalGap).toBeDefined();
      expect(criticalGap.severity).toBe("CRITICAL");
      expect(criticalGap.entityType).toBe("threat");
      expect(criticalGap.entityId).toBe("threat_1");
      expect(criticalGap.description).toContain("SQL Injection on Login");
    });
  });

  describe("AC2: No auth on API entry point -> high gap", () => {
    it("detects API entry point without auth and creates gap", async () => {
      mockTmEntryPoint.findMany.mockImplementation((args: any) => {
        if (args.where.authRequired === false) {
          return Promise.resolve([
            { id: "ep_1", name: "Public API", type: "REST API" },
          ]);
        }
        // No rate limit query - return empty for non-matching queries
        if (args.where.rateLimited === false) {
          return Promise.resolve([]);
        }
        return Promise.resolve([]);
      });

      mockTmGap.count.mockResolvedValue(1);

      await runGapAnalysis(THREAT_MODEL_ID);

      expect(mockTmGap.createMany).toHaveBeenCalledTimes(1);
      const createCall = mockTmGap.createMany.mock.calls[0]![0] as any;
      const gaps = createCall.data;

      const authGap = gaps.find(
        (g: any) => g.type === GAP_TYPES.NO_AUTH_API_ENTRY_POINT
      );
      expect(authGap).toBeDefined();
      expect(authGap.severity).toBe("HIGH");
      expect(authGap.entityType).toBe("entryPoint");
      expect(authGap.entityId).toBe("ep_1");
      expect(authGap.description).toContain("does not require authentication");
    });
  });

  describe("AC3: Threat mitigated -> gap auto-resolves", () => {
    it("resolves gap when underlying condition is fixed", async () => {
      // Simulate: no threats match (threat was mitigated)
      mockTmThreat.findMany.mockResolvedValue([]);
      mockTmDataFlow.findMany.mockResolvedValue([]);
      mockTmEntryPoint.findMany.mockResolvedValue([]);
      mockTmComponent.findMany.mockResolvedValue([]);

      // Simulate: there's an existing unresolved gap for a threat that's now mitigated
      mockTmGap.findMany.mockResolvedValue([
        {
          id: "gap_1",
          type: GAP_TYPES.UNMITIGATED_CRITICAL_THREAT,
          entityId: "threat_1",
        },
      ]);

      mockTmGap.count.mockResolvedValue(0);

      const result = await runGapAnalysis(THREAT_MODEL_ID);

      // Should have called updateMany to resolve the gap
      expect(mockTmGap.updateMany).toHaveBeenCalledTimes(1);
      const updateCall = mockTmGap.updateMany.mock.calls[0]![0] as any;
      expect(updateCall.where.id.in).toContain("gap_1");
      expect(updateCall.data.isResolved).toBe(true);
      expect(updateCall.data.resolvedAt).toBeInstanceOf(Date);

      expect(result.resolved).toBe(1);
    });

    it("does NOT resolve gap when condition still holds", async () => {
      // Simulate: critical threat still exists
      mockTmThreat.findMany.mockImplementation((args: any) => {
        if (args.where.severity === "CRITICAL") {
          return Promise.resolve([
            { id: "threat_1", title: "Still Unmitigated" },
          ]);
        }
        return Promise.resolve([]);
      });

      // Existing gap for the same threat
      mockTmGap.findMany.mockResolvedValue([
        {
          id: "gap_1",
          type: GAP_TYPES.UNMITIGATED_CRITICAL_THREAT,
          entityId: "threat_1",
        },
      ]);

      mockTmGap.count.mockResolvedValue(1);

      await runGapAnalysis(THREAT_MODEL_ID);

      // Should NOT resolve - gap condition still holds
      expect(mockTmGap.updateMany).not.toHaveBeenCalled();
    });
  });

  describe("AC4: Component with zero threats -> low gap", () => {
    it("detects component with no threats and creates low gap", async () => {
      mockTmComponent.findMany.mockResolvedValue([
        { id: "comp_1", name: "Static CDN", type: "cdn" },
      ]);

      mockTmGap.count.mockResolvedValue(1);

      await runGapAnalysis(THREAT_MODEL_ID);

      expect(mockTmGap.createMany).toHaveBeenCalledTimes(1);
      const createCall = mockTmGap.createMany.mock.calls[0]![0] as any;
      const gaps = createCall.data;

      const compGap = gaps.find(
        (g: any) => g.type === GAP_TYPES.COMPONENT_ZERO_THREATS
      );
      expect(compGap).toBeDefined();
      expect(compGap.severity).toBe("LOW");
      expect(compGap.entityType).toBe("component");
      expect(compGap.entityId).toBe("comp_1");
      expect(compGap.description).toContain("Static CDN");
      expect(compGap.description).toContain("no threats identified");
    });
  });

  describe("AC5: Analysis within SLA", () => {
    it("completes within 10 seconds with mocked DB", async () => {
      const start = Date.now();
      await runGapAnalysis(THREAT_MODEL_ID);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(1000); // With mocks, sub-second
    });
  });

  describe("AC6: Idempotent", () => {
    it("does not create duplicate gaps on repeated runs", async () => {
      // Simulate: a critical threat exists
      mockTmThreat.findMany.mockImplementation((args: any) => {
        if (args.where.severity === "CRITICAL") {
          return Promise.resolve([
            { id: "threat_1", title: "SQL Injection" },
          ]);
        }
        return Promise.resolve([]);
      });

      // First run: no existing gaps -> creates gap
      mockTmGap.findMany.mockResolvedValue([]);
      mockTmGap.count.mockResolvedValue(1);

      await runGapAnalysis(THREAT_MODEL_ID);

      expect(mockTmGap.createMany).toHaveBeenCalledTimes(1);
      const firstCreate = mockTmGap.createMany.mock.calls[0]![0] as any;
      expect(firstCreate.data.length).toBe(1);

      // Second run: existing gap matches detected gap -> no new creation
      mockTmGap.createMany.mockReset();
      mockTmGap.createMany.mockResolvedValue({ count: 0 });
      mockTmGap.findMany.mockResolvedValue([
        {
          id: "gap_1",
          type: GAP_TYPES.UNMITIGATED_CRITICAL_THREAT,
          entityId: "threat_1",
        },
      ]);

      await runGapAnalysis(THREAT_MODEL_ID);

      // Should NOT create any new gaps (already exists as unresolved)
      expect(mockTmGap.createMany).not.toHaveBeenCalled();
    });

    it("creates new gap if previous one was resolved and condition reappears", async () => {
      // Simulate: a critical threat exists
      mockTmThreat.findMany.mockImplementation((args: any) => {
        if (args.where.severity === "CRITICAL") {
          return Promise.resolve([
            { id: "threat_1", title: "SQL Injection" },
          ]);
        }
        return Promise.resolve([]);
      });

      // Existing gaps: the old gap is resolved (isResolved=true not in unresolved query)
      // findMany for unresolved returns empty (resolved gaps are excluded)
      mockTmGap.findMany.mockResolvedValue([]);
      mockTmGap.count.mockResolvedValue(1);

      await runGapAnalysis(THREAT_MODEL_ID);

      // Should create a new gap since no unresolved one exists
      expect(mockTmGap.createMany).toHaveBeenCalledTimes(1);
      const createCall = mockTmGap.createMany.mock.calls[0]![0] as any;
      expect(createCall.data.length).toBe(1);
      expect(createCall.data[0].entityId).toBe("threat_1");
    });
  });

  describe("Unknown encryption on sensitive flow", () => {
    it("detects sensitive flow with unknown encryption", async () => {
      mockTmDataFlow.findMany.mockResolvedValue([
        {
          id: "flow_1",
          description: "User data transfer",
          sensitivity: "RESTRICTED",
          encryption: "unknown",
          fromComponent: { name: "API Server" },
          toComponent: { name: "Database" },
        },
      ]);

      mockTmGap.count.mockResolvedValue(1);

      await runGapAnalysis(THREAT_MODEL_ID);

      expect(mockTmGap.createMany).toHaveBeenCalledTimes(1);
      const createCall = mockTmGap.createMany.mock.calls[0]![0] as any;
      const gaps = createCall.data;

      const encGap = gaps.find(
        (g: any) => g.type === GAP_TYPES.UNKNOWN_ENCRYPTION_SENSITIVE_FLOW
      );
      expect(encGap).toBeDefined();
      expect(encGap.severity).toBe("HIGH");
      expect(encGap.entityType).toBe("dataFlow");
      expect(encGap.entityId).toBe("flow_1");
      expect(encGap.description).toContain("RESTRICTED");
      expect(encGap.description).toContain("API Server");
    });
  });

  describe("No rate limit on public endpoint", () => {
    it("detects endpoint without rate limiting", async () => {
      mockTmEntryPoint.findMany.mockImplementation((args: any) => {
        if (args.where.rateLimited === false) {
          return Promise.resolve([
            { id: "ep_2", name: "WebSocket", type: "WebSocket" },
          ]);
        }
        return Promise.resolve([]);
      });

      mockTmGap.count.mockResolvedValue(1);

      await runGapAnalysis(THREAT_MODEL_ID);

      expect(mockTmGap.createMany).toHaveBeenCalledTimes(1);
      const createCall = mockTmGap.createMany.mock.calls[0]![0] as any;
      const gaps = createCall.data;

      const rlGap = gaps.find(
        (g: any) => g.type === GAP_TYPES.NO_RATE_LIMIT_PUBLIC_ENDPOINT
      );
      expect(rlGap).toBeDefined();
      expect(rlGap.severity).toBe("MEDIUM");
      expect(rlGap.entityType).toBe("entryPoint");
      expect(rlGap.entityId).toBe("ep_2");
      expect(rlGap.description).toContain("no rate limiting");
    });
  });

  describe("Multiple gap types simultaneously", () => {
    it("detects and creates all gap types in one pass", async () => {
      // Set up all 6 gap types
      mockTmThreat.findMany.mockImplementation((args: any) => {
        if (args.where.severity === "CRITICAL") {
          return Promise.resolve([{ id: "t1", title: "Critical Bug" }]);
        }
        if (args.where.severity === "HIGH") {
          return Promise.resolve([{ id: "t2", title: "High Bug" }]);
        }
        return Promise.resolve([]);
      });

      mockTmDataFlow.findMany.mockResolvedValue([
        {
          id: "flow_1",
          description: "Transfer",
          sensitivity: "CONFIDENTIAL",
          encryption: null,
          fromComponent: { name: "A" },
          toComponent: { name: "B" },
        },
      ]);

      mockTmEntryPoint.findMany.mockImplementation((args: any) => {
        if (args.where.authRequired === false) {
          return Promise.resolve([
            { id: "ep_1", name: "Open API", type: "REST API" },
          ]);
        }
        if (args.where.rateLimited === false) {
          return Promise.resolve([
            { id: "ep_2", name: "WS", type: "WebSocket" },
          ]);
        }
        return Promise.resolve([]);
      });

      mockTmComponent.findMany.mockResolvedValue([
        { id: "comp_1", name: "CDN", type: "cdn" },
      ]);

      mockTmGap.count.mockResolvedValue(6);

      const result = await runGapAnalysis(THREAT_MODEL_ID);

      expect(mockTmGap.createMany).toHaveBeenCalledTimes(1);
      const createCall = mockTmGap.createMany.mock.calls[0]![0] as any;
      const gaps = createCall.data;

      // All 6 gap types detected
      expect(gaps.length).toBe(6);

      const types = gaps.map((g: any) => g.type);
      expect(types).toContain(GAP_TYPES.UNMITIGATED_CRITICAL_THREAT);
      expect(types).toContain(GAP_TYPES.UNMITIGATED_HIGH_THREAT);
      expect(types).toContain(GAP_TYPES.UNKNOWN_ENCRYPTION_SENSITIVE_FLOW);
      expect(types).toContain(GAP_TYPES.NO_AUTH_API_ENTRY_POINT);
      expect(types).toContain(GAP_TYPES.NO_RATE_LIMIT_PUBLIC_ENDPOINT);
      expect(types).toContain(GAP_TYPES.COMPONENT_ZERO_THREATS);

      expect(result.total).toBe(6);
    });
  });

  describe("Return values", () => {
    it("returns correct counts", async () => {
      // No gaps detected, no existing gaps
      mockTmGap.count.mockResolvedValue(0);

      const result = await runGapAnalysis(THREAT_MODEL_ID);

      expect(result.created).toBe(0);
      expect(result.resolved).toBe(0);
      expect(result.total).toBe(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });
});
