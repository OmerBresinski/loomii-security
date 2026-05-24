/**
 * Tests for Project Creation Service.
 *
 * Tests cover:
 * - Linear project mirroring (AC1)
 * - Duplicate detection and skipping (AC2)
 * - LLM-generated names for orphan clusters (AC3)
 * - Fallback naming when LLM fails (AC4)
 * - ProjectSource records with correct linkReason (AC5)
 * - summaryEmbedding generation (AC6)
 * - Idempotency (AC7)
 */
import "../test-setup";
import { describe, it, expect, mock, beforeEach } from "bun:test";
import {
  createProjectsFromBackfill,
  type LinearProjectMapping,
  type OrphanCluster,
} from "../lib/project-creation";

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Mock AI SDK generateText
let mockGenerateTextResult = { text: "Auth Service" };
let mockGenerateTextShouldFail = false;

mock.module("ai", () => ({
  generateText: async () => {
    if (mockGenerateTextShouldFail) throw new Error("LLM unavailable");
    return mockGenerateTextResult;
  },
}));

// Mock embeddings
mock.module("../lib/embeddings", () => ({
  generateQueryEmbedding: async () => new Array(1024).fill(0.1),
}));

// Mock bedrock
mock.module("../lib/bedrock", () => ({
  bedrock: () => "mock-model",
  MODELS: { CLAUDE_HAIKU: "mock-haiku" },
}));

// Mock logger
mock.module("../lib/logger", () => ({
  logger: { warn: () => {}, info: () => {}, error: () => {} },
}));

// ─── Mock DB ─────────────────────────────────────────────────────────────────

function createMockDb() {
  const createdProjects: any[] = [];
  const createdSources: any[] = [];
  const executedRawQueries: string[] = [];
  let projectIdCounter = 0;
  let findFirstResult: any = null;

  const mockTx = {
    project: {
      create: async ({ data }: any) => {
        projectIdCounter++;
        const project = { id: `proj-${projectIdCounter}`, ...data };
        createdProjects.push(project);
        return project;
      },
    },
    projectSource: {
      create: async ({ data }: any) => {
        // Check for unique constraint simulation
        const existing = createdSources.find(
          (s) =>
            s.projectId === data.projectId &&
            s.sourceType === data.sourceType &&
            s.sourceId === data.sourceId
        );
        if (existing) {
          const err: any = new Error("Unique constraint");
          err.code = "P2002";
          throw err;
        }
        createdSources.push(data);
        return data;
      },
    },
  };

  const db: any = {
    projectSource: {
      findFirst: async () => findFirstResult,
    },
    $transaction: async (fn: any) => fn(mockTx),
    $executeRaw: async (...args: any[]) => {
      executedRawQueries.push("executed");
      return 1;
    },
    // Helpers for test assertions
    _createdProjects: createdProjects,
    _createdSources: createdSources,
    _executedRawQueries: executedRawQueries,
    _setFindFirstResult: (val: any) => {
      findFirstResult = val;
    },
    _reset: () => {
      createdProjects.length = 0;
      createdSources.length = 0;
      executedRawQueries.length = 0;
      projectIdCounter = 0;
      findFirstResult = null;
    },
  };

  return db;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("createProjectsFromBackfill", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    mockDb = createMockDb();
    mockGenerateTextResult = { text: "Auth Service" };
    mockGenerateTextShouldFail = false;
  });

  describe("Linear project mirroring (AC1)", () => {
    it("creates a Loomii Project for each Linear project", async () => {
      const linearProjects: LinearProjectMapping[] = [
        {
          linearProjectId: "lp-1",
          linearProjectName: "Authentication",
          itemIds: ["item-1", "item-2", "item-3"],
        },
      ];

      const result = await createProjectsFromBackfill(
        "tenant-1",
        linearProjects,
        [],
        mockDb
      );

      expect(result.created).toHaveLength(1);
      expect(result.created[0].name).toBe("Authentication");
      expect(result.created[0].itemIds).toEqual(["item-1", "item-2", "item-3"]);
      expect(result.created[0].source).toBe("linear_mirror");
      expect(result.skipped).toHaveLength(0);
    });

    it("creates ProjectSource records with correct linkReason", async () => {
      const linearProjects: LinearProjectMapping[] = [
        {
          linearProjectId: "lp-1",
          linearProjectName: "Auth",
          itemIds: ["item-1", "item-2"],
        },
      ];

      await createProjectsFromBackfill("tenant-1", linearProjects, [], mockDb);

      expect(mockDb._createdSources).toHaveLength(2);
      expect(mockDb._createdSources[0].linkedBy).toBe("AUTO");
      expect(mockDb._createdSources[0].linkReason).toEqual({
        method: "linear_project_mirror",
        linearProjectId: "lp-1",
      });
      expect(mockDb._createdSources[0].sourceType).toBe("LINEAR_ISSUE");
    });

    it("mirrors multiple Linear projects", async () => {
      const linearProjects: LinearProjectMapping[] = [
        {
          linearProjectId: "lp-1",
          linearProjectName: "Auth",
          itemIds: ["item-1"],
        },
        {
          linearProjectId: "lp-2",
          linearProjectName: "Payments",
          itemIds: ["item-2", "item-3"],
        },
      ];

      const result = await createProjectsFromBackfill(
        "tenant-1",
        linearProjects,
        [],
        mockDb
      );

      expect(result.created).toHaveLength(2);
      expect(result.created[0].name).toBe("Auth");
      expect(result.created[1].name).toBe("Payments");
    });
  });

  describe("duplicate detection (AC2)", () => {
    it("skips Linear projects that already exist", async () => {
      mockDb._setFindFirstResult({ projectId: "existing-proj-1" });

      const linearProjects: LinearProjectMapping[] = [
        {
          linearProjectId: "lp-1",
          linearProjectName: "Auth",
          itemIds: ["item-1"],
        },
      ];

      const result = await createProjectsFromBackfill(
        "tenant-1",
        linearProjects,
        [],
        mockDb
      );

      expect(result.created).toHaveLength(0);
      expect(result.skipped).toEqual(["lp-1"]);
      expect(mockDb._createdProjects).toHaveLength(0);
    });
  });

  describe("orphan cluster projects (AC3)", () => {
    it("creates projects from clusters with LLM-generated names", async () => {
      mockGenerateTextResult = { text: "Auth Service" };

      const orphanClusters: OrphanCluster[] = [
        {
          items: [
            { id: "orphan-1", sourceType: "LINEAR_ISSUE" },
            { id: "orphan-2", sourceType: "LINEAR_ISSUE" },
            { id: "orphan-3", sourceType: "NOTION_PAGE" },
          ],
          centroid: new Array(1024).fill(0.5),
          titles: ["Login flow fix", "OAuth token refresh", "Session management"],
          contentSnippets: ["Fix login redirect...", "Token refresh logic...", "Session expiry..."],
        },
      ];

      const result = await createProjectsFromBackfill(
        "tenant-1",
        [],
        orphanClusters,
        mockDb
      );

      expect(result.created).toHaveLength(1);
      expect(result.created[0].name).toBe("Auth Service");
      expect(result.created[0].itemIds).toEqual(["orphan-1", "orphan-2", "orphan-3"]);
      expect(result.created[0].source).toBe("embedding_cluster");
    });

    it("creates ProjectSource records with correct sourceType per item", async () => {
      const orphanClusters: OrphanCluster[] = [
        {
          items: [
            { id: "o-1", sourceType: "LINEAR_ISSUE" },
            { id: "o-2", sourceType: "NOTION_PAGE" },
            { id: "o-3", sourceType: "LINEAR_ISSUE" },
          ],
          centroid: new Array(1024).fill(0.5),
          titles: ["Title 1", "Title 2", "Title 3"],
          contentSnippets: ["Snippet 1", "Snippet 2", "Snippet 3"],
        },
      ];

      await createProjectsFromBackfill("tenant-1", [], orphanClusters, mockDb);

      expect(mockDb._createdSources).toHaveLength(3);
      expect(mockDb._createdSources[0].sourceType).toBe("LINEAR_ISSUE");
      expect(mockDb._createdSources[1].sourceType).toBe("NOTION_PAGE");
      expect(mockDb._createdSources[2].sourceType).toBe("LINEAR_ISSUE");
    });

    it("stores similarityThreshold in linkReason", async () => {
      const orphanClusters: OrphanCluster[] = [
        {
          items: [
            { id: "o-1", sourceType: "LINEAR_ISSUE" },
            { id: "o-2", sourceType: "LINEAR_ISSUE" },
            { id: "o-3", sourceType: "LINEAR_ISSUE" },
          ],
          centroid: new Array(1024).fill(0.5),
          titles: ["Title 1", "Title 2", "Title 3"],
          contentSnippets: ["Snippet 1", "Snippet 2", "Snippet 3"],
        },
      ];

      await createProjectsFromBackfill("tenant-1", [], orphanClusters, mockDb, {
        similarityThreshold: 0.85,
      });

      expect(mockDb._createdSources[0].linkReason).toEqual({
        method: "embedding_cluster",
        similarityThreshold: 0.85,
      });
    });
  });

  describe("LLM fallback naming (AC4)", () => {
    it("uses fallback name when LLM fails", async () => {
      mockGenerateTextShouldFail = true;

      const orphanClusters: OrphanCluster[] = [
        {
          items: [
            { id: "o-1", sourceType: "LINEAR_ISSUE" },
            { id: "o-2", sourceType: "LINEAR_ISSUE" },
            { id: "o-3", sourceType: "LINEAR_ISSUE" },
          ],
          centroid: new Array(1024).fill(0.5),
          titles: ["Title 1", "Title 2", "Title 3"],
          contentSnippets: ["Snippet 1", "Snippet 2", "Snippet 3"],
        },
      ];

      const result = await createProjectsFromBackfill(
        "tenant-1",
        [],
        orphanClusters,
        mockDb
      );

      expect(result.created[0].name).toBe("Project 1");
    });

    it("uses fallback name when LLM returns empty string", async () => {
      mockGenerateTextResult = { text: "" };

      const orphanClusters: OrphanCluster[] = [
        {
          items: [
            { id: "o-1", sourceType: "LINEAR_ISSUE" },
            { id: "o-2", sourceType: "LINEAR_ISSUE" },
            { id: "o-3", sourceType: "LINEAR_ISSUE" },
          ],
          centroid: new Array(1024).fill(0.5),
          titles: ["Title 1", "Title 2", "Title 3"],
          contentSnippets: ["Snippet 1", "Snippet 2", "Snippet 3"],
        },
      ];

      const result = await createProjectsFromBackfill(
        "tenant-1",
        [],
        orphanClusters,
        mockDb
      );

      expect(result.created[0].name).toBe("Project 1");
    });

    it("increments fallback counter for multiple clusters", async () => {
      mockGenerateTextShouldFail = true;

      const orphanClusters: OrphanCluster[] = [
        {
          items: [
            { id: "o-1", sourceType: "LINEAR_ISSUE" },
            { id: "o-2", sourceType: "LINEAR_ISSUE" },
            { id: "o-3", sourceType: "LINEAR_ISSUE" },
          ],
          centroid: new Array(1024).fill(0.5),
          titles: ["A", "B", "C"],
          contentSnippets: ["a", "b", "c"],
        },
        {
          items: [
            { id: "o-4", sourceType: "LINEAR_ISSUE" },
            { id: "o-5", sourceType: "LINEAR_ISSUE" },
            { id: "o-6", sourceType: "LINEAR_ISSUE" },
          ],
          centroid: new Array(1024).fill(0.3),
          titles: ["D", "E", "F"],
          contentSnippets: ["d", "e", "f"],
        },
      ];

      const result = await createProjectsFromBackfill(
        "tenant-1",
        [],
        orphanClusters,
        mockDb
      );

      expect(result.created[0].name).toBe("Project 1");
      expect(result.created[1].name).toBe("Project 2");
    });
  });

  describe("summaryEmbedding generation (AC6)", () => {
    it("calls $executeRaw to store embedding for each created project", async () => {
      const linearProjects: LinearProjectMapping[] = [
        {
          linearProjectId: "lp-1",
          linearProjectName: "Auth",
          itemIds: ["item-1"],
        },
      ];
      const orphanClusters: OrphanCluster[] = [
        {
          items: [
            { id: "o-1", sourceType: "LINEAR_ISSUE" },
            { id: "o-2", sourceType: "LINEAR_ISSUE" },
            { id: "o-3", sourceType: "LINEAR_ISSUE" },
          ],
          centroid: new Array(1024).fill(0.5),
          titles: ["T1", "T2", "T3"],
          contentSnippets: ["S1", "S2", "S3"],
        },
      ];

      await createProjectsFromBackfill(
        "tenant-1",
        linearProjects,
        orphanClusters,
        mockDb
      );

      // One raw query per created project (2 total: 1 mirror + 1 cluster)
      expect(mockDb._executedRawQueries).toHaveLength(2);
    });
  });

  describe("unique constraint handling (AC5/AC7)", () => {
    it("handles duplicate ProjectSource gracefully (P2002)", async () => {
      // Create a mock that always throws P2002 on the second item
      let sourceCreateCount = 0;
      const customTx = {
        project: {
          create: async ({ data }: any) => ({
            id: "proj-custom",
            ...data,
          }),
        },
        projectSource: {
          create: async ({ data }: any) => {
            sourceCreateCount++;
            if (sourceCreateCount === 2) {
              const err: any = new Error("Unique constraint");
              err.code = "P2002";
              throw err;
            }
            return data;
          },
        },
      };

      const customDb: any = {
        projectSource: { findFirst: async () => null },
        $transaction: async (fn: any) => fn(customTx),
        $executeRaw: async () => 1,
      };

      const linearProjects: LinearProjectMapping[] = [
        {
          linearProjectId: "lp-1",
          linearProjectName: "Auth",
          itemIds: ["item-1", "item-2"],
        },
      ];

      // Should not throw
      const result = await createProjectsFromBackfill(
        "tenant-1",
        linearProjects,
        [],
        customDb
      );

      expect(result.created).toHaveLength(1);
    });
  });

  describe("mixed input (mirrors + clusters)", () => {
    it("handles both Linear mirrors and orphan clusters together", async () => {
      mockGenerateTextResult = { text: "Data Pipeline" };

      const linearProjects: LinearProjectMapping[] = [
        {
          linearProjectId: "lp-1",
          linearProjectName: "Auth",
          itemIds: ["item-1", "item-2"],
        },
      ];
      const orphanClusters: OrphanCluster[] = [
        {
          items: [
            { id: "o-1", sourceType: "LINEAR_ISSUE" },
            { id: "o-2", sourceType: "NOTION_PAGE" },
            { id: "o-3", sourceType: "LINEAR_ISSUE" },
          ],
          centroid: new Array(1024).fill(0.5),
          titles: ["ETL job", "Data sync", "Pipeline retry"],
          contentSnippets: ["ETL...", "Sync...", "Retry..."],
        },
      ];

      const result = await createProjectsFromBackfill(
        "tenant-1",
        linearProjects,
        orphanClusters,
        mockDb
      );

      expect(result.created).toHaveLength(2);
      expect(result.created[0].source).toBe("linear_mirror");
      expect(result.created[0].name).toBe("Auth");
      expect(result.created[1].source).toBe("embedding_cluster");
      expect(result.created[1].name).toBe("Data Pipeline");
    });
  });

  describe("edge cases", () => {
    it("handles empty inputs", async () => {
      const result = await createProjectsFromBackfill(
        "tenant-1",
        [],
        [],
        mockDb
      );

      expect(result.created).toHaveLength(0);
      expect(result.skipped).toHaveLength(0);
    });
  });
});
