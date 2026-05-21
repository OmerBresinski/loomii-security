/**
 * Tests for Context Assembly Worker.
 *
 * All external dependencies (Linear API, Notion API, DB, Queue, Encryption) are mocked.
 * Tests cover:
 * - Assembling full context for Linear ticket (AC1)
 * - Including linked Notion doc content in bundle (AC2)
 * - Handling partial failure gracefully (AC3)
 * - Completing assembly within timeout (AC4)
 * - Enqueueing risk-classification and embedding-generation jobs (AC5)
 * - Cross-reference resolution bidirectionally (AC6)
 */
import { describe, it, expect, beforeEach, mock } from "bun:test";
import type { Job } from "bullmq";
import type { ContextAssemblyPayload } from "@loomii/queue";

// =========================================
// Mock setup
// =========================================

const mockDb = {
  event: {
    findUnique: mock((_args: any) => Promise.resolve(null as any)),
    update: mock((_args: any) => Promise.resolve({} as any)),
  },
  integration: {
    findFirst: mock((_args: any) => Promise.resolve(null as any)),
  },
  contextBundle: {
    upsert: mock((_args: any) =>
      Promise.resolve({ id: "bundle_123", content: {} } as any)
    ),
  },
};

const mockRiskClassificationQueue = {
  add: mock((_name: string, _payload: any) =>
    Promise.resolve({ id: "risk_job_123" })
  ),
};

const mockEmbeddingQueue = {
  add: mock((_name: string, _payload: any) =>
    Promise.resolve({ id: "embed_job_123" })
  ),
};

const mockDecrypt = mock((_text: string) => "decrypted_token_123");

// Mock Linear SDK
const mockLinearIssue = {
  id: "issue_123",
  identifier: "LOO-100",
  title: "Test Issue",
  description: "Test description with https://notion.so/workspace/Doc-abc123def456789012345678abcdef12",
  priority: 2,
  priorityLabel: "High",
  url: "https://linear.app/loomii/issue/LOO-100",
  createdAt: new Date("2026-05-17T10:00:00Z"),
  updatedAt: new Date("2026-05-17T12:00:00Z"),
  state: Promise.resolve({ id: "state_1", name: "In Progress", type: "started" }),
  assignee: Promise.resolve({ id: "user_1", name: "Omer", email: "omer@test.com" }),
  labels: () => Promise.resolve({ nodes: [{ id: "lbl_1", name: "Security" }] }),
  project: Promise.resolve({
    id: "proj_1",
    name: "Context Engine",
    description: "Context engine project",
    state: "started",
    url: "https://linear.app/loomii/project/context-engine",
    startDate: "2026-05-01",
    targetDate: "2026-06-01",
  }),
  comments: () =>
    Promise.resolve({
      nodes: [
        {
          id: "comment_1",
          body: "This relates to https://notion.so/workspace/Another-Page-def456789012345678abcdef12345678",
          createdAt: new Date("2026-05-17T11:00:00Z"),
          updatedAt: new Date("2026-05-17T11:00:00Z"),
        },
      ],
    }),
  parent: Promise.resolve({
    id: "parent_1",
    identifier: "LOO-50",
    title: "Parent Issue",
    description: "Parent description",
    url: "https://linear.app/loomii/issue/LOO-50",
  }),
  children: () =>
    Promise.resolve({
      nodes: [
        {
          id: "child_1",
          identifier: "LOO-101",
          title: "Child Issue",
          description: "Child desc",
          url: "https://linear.app/loomii/issue/LOO-101",
          priority: 3,
        },
      ],
    }),
  team: Promise.resolve({
    issues: (_opts: any) =>
      Promise.resolve({
        nodes: [
          {
            id: "sibling_1",
            identifier: "LOO-99",
            title: "Sibling Issue",
            description: "Sibling desc",
            url: "https://linear.app/loomii/issue/LOO-99",
            priority: 4,
          },
        ],
      }),
  }),
};

const mockLinearClient = {
  issue: mock((_id: string) => Promise.resolve(mockLinearIssue)),
  issues: mock((_filter: any) =>
    Promise.resolve({
      nodes: [
        {
          id: "cross_ref_issue",
          identifier: "LOO-200",
          title: "Cross-Referenced Issue",
          description: "Cross ref desc",
          url: "https://linear.app/loomii/issue/LOO-200",
          priority: 2,
        },
      ],
    })
  ),
};

// Mock Notion client
const mockNotionPage = {
  id: "page_123",
  object: "page",
  parent: { type: "database_id", database_id: "db_123" },
  properties: {
    title: { type: "title", title: [{ plain_text: "Test Notion Page" }] },
  },
  url: "https://notion.so/page_123",
};

const mockNotionBlocks = [
  {
    id: "block_1",
    type: "paragraph",
    paragraph: {
      rich_text: [
        {
          type: "text",
          text: {
            content: "Check this Linear issue: https://linear.app/loomii/issue/LOO-200/some-title",
          },
        },
      ],
    },
  },
];

const mockNotionClient = {
  pages: {
    retrieve: mock((_args: any) => Promise.resolve(mockNotionPage)),
  },
  blocks: {
    children: {
      list: mock((_args: any) =>
        Promise.resolve({
          results: mockNotionBlocks,
          has_more: false,
          next_cursor: null,
        })
      ),
    },
  },
  databases: {
    retrieve: mock((_args: any) =>
      Promise.resolve({
        id: "db_123",
        title: [{ plain_text: "Test Database" }],
      })
    ),
    query: mock((_args: any) =>
      Promise.resolve({
        results: [
          { id: "sibling_page_1", object: "page" },
          { id: "page_123", object: "page" }, // Current page (should be filtered)
        ],
        has_more: false,
      })
    ),
  },
};

// Apply mocks BEFORE importing the processor
mock.module("@loomii/db", () => ({ db: mockDb, vectorSearch: async () => [], insertEmbedding: async () => {} }));
mock.module("@loomii/queue", () => ({
  contextAssemblyQueue: { add: mock() },
  riskClassificationQueue: mockRiskClassificationQueue,
  embeddingQueue: mockEmbeddingQueue,
  notionPollingQueue: { add: mock() },
  eventsQueue: { add: mock() },
  integrationHealthQueue: { add: mock() },
  reviewQueue: { add: mock() },
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
  decrypt: mockDecrypt,
}));
mock.module("@linear/sdk", () => ({
  LinearClient: class MockLinearClient {
    constructor(_opts: any) {}
    issue = mockLinearClient.issue;
    issues = mockLinearClient.issues;
  },
}));
mock.module("@notionhq/client", () => ({
  Client: class MockNotionClient {
    constructor(_opts: any) {}
    pages = mockNotionClient.pages;
    blocks = mockNotionClient.blocks;
    databases = mockNotionClient.databases;
  },
}));

// Import after mocks are set up
import { processContextAssembly } from "./context-assembly";
import { resetAllBuckets } from "../lib/notion-rate-limiter";

// =========================================
// Helpers
// =========================================

function createMockJob(
  data: ContextAssemblyPayload,
  overrides?: Partial<Job<ContextAssemblyPayload>>
): Job<ContextAssemblyPayload> {
  return {
    id: "job_test_assembly_123",
    name: "assemble",
    data,
    processedOn: Date.now(),
    ...overrides,
  } as unknown as Job<ContextAssemblyPayload>;
}

function createMockEvent(sourceType: "LINEAR" | "NOTION") {
  return {
    id: "evt_123",
    tenantId: "tenant_123",
    integrationId: "int_123",
    source: sourceType,
    externalId: sourceType === "LINEAR" ? "issue_123" : "page_123",
    type: sourceType === "LINEAR" ? "issue.updated" : "page.updated",
    status: "PENDING",
    payload: { title: "Test Event" },
    integration: {
      id: "int_123",
      tenantId: "tenant_123",
      provider: sourceType,
      status: "ACTIVE",
      accessToken: "encrypted:tok123...",
    },
  };
}

// =========================================
// Tests
// =========================================

describe("Context Assembly Processor", () => {
  beforeEach(() => {
    mockDb.event.findUnique.mockReset();
    mockDb.event.update.mockReset();
    mockDb.integration.findFirst.mockReset();
    mockDb.contextBundle.upsert.mockReset();
    mockRiskClassificationQueue.add.mockReset();
    mockEmbeddingQueue.add.mockReset();
    mockDecrypt.mockReset();
    mockLinearClient.issue.mockReset();
    mockLinearClient.issues.mockReset();
    mockNotionClient.pages.retrieve.mockReset();
    mockNotionClient.blocks.children.list.mockReset();
    mockNotionClient.databases.retrieve.mockReset();
    mockNotionClient.databases.query.mockReset();
    resetAllBuckets();

    // Default mock implementations
    mockDecrypt.mockReturnValue("decrypted_token_123");
    mockDb.event.update.mockResolvedValue({});
    mockDb.contextBundle.upsert.mockResolvedValue({
      id: "bundle_123",
      content: {},
    });
    mockRiskClassificationQueue.add.mockResolvedValue({ id: "risk_job" });
    mockEmbeddingQueue.add.mockResolvedValue({ id: "embed_job" });
    mockLinearClient.issue.mockReturnValue(Promise.resolve(mockLinearIssue));
    mockLinearClient.issues.mockResolvedValue({
      nodes: [
        {
          id: "cross_ref_issue",
          identifier: "LOO-200",
          title: "Cross-Referenced Issue",
          description: "Cross ref desc",
          url: "https://linear.app/loomii/issue/LOO-200",
          priority: 2,
        },
      ],
    });
    mockNotionClient.pages.retrieve.mockResolvedValue(mockNotionPage);
    mockNotionClient.blocks.children.list.mockResolvedValue({
      results: mockNotionBlocks,
      has_more: false,
      next_cursor: null,
    });
    mockNotionClient.databases.retrieve.mockResolvedValue({
      id: "db_123",
      title: [{ plain_text: "Test Database" }],
    });
    mockNotionClient.databases.query.mockResolvedValue({
      results: [{ id: "sibling_page_1", object: "page" }],
      has_more: false,
    });
  });

  describe("Linear ticket assembly (AC1)", () => {
    it("assembles full context for Linear ticket: ticket, project, comments, siblings", async () => {
      mockDb.event.findUnique.mockResolvedValue(createMockEvent("LINEAR"));
      mockDb.integration.findFirst.mockResolvedValue(null); // No Notion integration

      const job = createMockJob({
        eventId: "evt_123",
        tenantId: "tenant_123",
        sourceType: "linear",
        sourceId: "issue_123",
      });

      await processContextAssembly(job);

      // Should save context bundle
      expect(mockDb.contextBundle.upsert).toHaveBeenCalledTimes(1);
      const upsertCall = mockDb.contextBundle.upsert.mock.calls[0]![0] as any;
      const content = upsertCall.create.content;

      expect(content.source).toBe("linear");
      expect(content.sourceId).toBe("issue_123");
      expect(content.primary.ticket).not.toBeNull();
      expect(content.primary.ticket.title).toBe("Test Issue");
      expect(content.primary.project).not.toBeNull();
      expect(content.primary.project.name).toBe("Context Engine");
      expect(content.primary.comments).toHaveLength(1);
      expect(content.primary.parentIssue).not.toBeNull();
      expect(content.primary.childIssues).toHaveLength(1);
      expect(content.primary.siblingIssues).toHaveLength(1);
    });
  });

  describe("Cross-reference resolution (AC2, AC6)", () => {
    it("resolves Notion URLs found in Linear content (bundle includes doc content)", async () => {
      mockDb.event.findUnique.mockResolvedValue(createMockEvent("LINEAR"));
      // Notion integration is active for cross-referencing
      mockDb.integration.findFirst.mockResolvedValue({
        id: "int_notion_123",
        tenantId: "tenant_123",
        provider: "NOTION",
        status: "ACTIVE",
        accessToken: "encrypted:notion_token...",
      });

      const job = createMockJob({
        eventId: "evt_123",
        tenantId: "tenant_123",
        sourceType: "linear",
        sourceId: "issue_123",
      });

      await processContextAssembly(job);

      // Should have called Notion pages.retrieve for cross-referenced docs
      expect(mockNotionClient.pages.retrieve).toHaveBeenCalled();

      const upsertCall = mockDb.contextBundle.upsert.mock.calls[0]![0] as any;
      const content = upsertCall.create.content;
      expect(content.crossReferences.notionDocs.length).toBeGreaterThan(0);
    });

    it("resolves Linear URLs found in Notion content", async () => {
      mockDb.event.findUnique.mockResolvedValue(createMockEvent("NOTION"));
      // Linear integration active for cross-referencing
      mockDb.integration.findFirst.mockResolvedValue({
        id: "int_linear_123",
        tenantId: "tenant_123",
        provider: "LINEAR",
        status: "ACTIVE",
        accessToken: "encrypted:linear_token...",
      });

      const job = createMockJob({
        eventId: "evt_123",
        tenantId: "tenant_123",
        sourceType: "notion",
        sourceId: "page_123",
      });

      await processContextAssembly(job);

      // Should have called client.issue() for cross-referenced Linear issues
      // The linear-fetcher also calls issue(), so we check the identifier was resolved
      const upsertCall = mockDb.contextBundle.upsert.mock.calls[0]![0] as any;
      const content = upsertCall.create.content;
      expect(content.crossReferences.linearIssues.length).toBeGreaterThan(0);
    });

    it("skips cross-reference when other integration is not active", async () => {
      mockDb.event.findUnique.mockResolvedValue(createMockEvent("LINEAR"));
      mockDb.integration.findFirst.mockResolvedValue(null); // No Notion integration

      const job = createMockJob({
        eventId: "evt_123",
        tenantId: "tenant_123",
        sourceType: "linear",
        sourceId: "issue_123",
      });

      await processContextAssembly(job);

      const upsertCall = mockDb.contextBundle.upsert.mock.calls[0]![0] as any;
      const content = upsertCall.create.content;
      // Cross-reference should be empty (no Notion integration)
      expect(content.crossReferences.notionDocs).toHaveLength(0);
      // But missingItems should note this
      expect(content.missingItems.some((m: any) =>
        m.item.includes("cross-ref") || m.reason.includes("not active")
      )).toBe(true);
    });
  });

  describe("Partial failure handling (AC3)", () => {
    it("handles partial fetch failure - bundle still created with missingItems", async () => {
      // Make Linear issue fetch work but project fetch fail
      const failingIssue = {
        ...mockLinearIssue,
        project: Promise.reject(new Error("Project fetch timeout")),
      };
      mockLinearClient.issue.mockReturnValue(Promise.resolve(failingIssue));
      mockDb.event.findUnique.mockResolvedValue(createMockEvent("LINEAR"));
      mockDb.integration.findFirst.mockResolvedValue(null);

      const job = createMockJob({
        eventId: "evt_123",
        tenantId: "tenant_123",
        sourceType: "linear",
        sourceId: "issue_123",
      });

      await processContextAssembly(job);

      // Bundle should still be created
      expect(mockDb.contextBundle.upsert).toHaveBeenCalledTimes(1);
      const upsertCall = mockDb.contextBundle.upsert.mock.calls[0]![0] as any;
      const content = upsertCall.create.content;

      // missingItems should note the failure
      expect(content.missingItems.length).toBeGreaterThan(0);
      // Downstream jobs should still be enqueued
      expect(mockRiskClassificationQueue.add).toHaveBeenCalledTimes(1);
      expect(mockEmbeddingQueue.add).toHaveBeenCalledTimes(1);
    });
  });

  describe("Notion page assembly", () => {
    it("assembles full context for Notion page", async () => {
      mockDb.event.findUnique.mockResolvedValue(createMockEvent("NOTION"));
      mockDb.integration.findFirst.mockResolvedValue(null); // No Linear integration

      const job = createMockJob({
        eventId: "evt_123",
        tenantId: "tenant_123",
        sourceType: "notion",
        sourceId: "page_123",
      });

      await processContextAssembly(job);

      expect(mockDb.contextBundle.upsert).toHaveBeenCalledTimes(1);
      const upsertCall = mockDb.contextBundle.upsert.mock.calls[0]![0] as any;
      const content = upsertCall.create.content;

      expect(content.source).toBe("notion");
      expect(content.sourceId).toBe("page_123");
      expect(content.primary.page).not.toBeNull();
      expect(content.primary.blocks).toHaveLength(1);
      expect(content.primary.parentDatabase).not.toBeNull();
    });
  });

  describe("Downstream job enqueueing (AC5)", () => {
    it("enqueues risk-classification and embedding-generation jobs after save", async () => {
      mockDb.event.findUnique.mockResolvedValue(createMockEvent("LINEAR"));
      mockDb.integration.findFirst.mockResolvedValue(null);

      const job = createMockJob({
        eventId: "evt_123",
        tenantId: "tenant_123",
        sourceType: "linear",
        sourceId: "issue_123",
      });

      await processContextAssembly(job);

      // Risk classification enqueued
      expect(mockRiskClassificationQueue.add).toHaveBeenCalledTimes(1);
      const [riskName, riskPayload] =
        mockRiskClassificationQueue.add.mock.calls[0]!;
      expect(riskName).toBe("classify");
      expect((riskPayload as any).tenantId).toBe("tenant_123");
      expect((riskPayload as any).contextId).toBe("bundle_123");

      // Embedding generation enqueued
      expect(mockEmbeddingQueue.add).toHaveBeenCalledTimes(1);
      const [embedName, embedPayload] = mockEmbeddingQueue.add.mock.calls[0]!;
      expect(embedName).toBe("generate");
      expect((embedPayload as any).tenantId).toBe("tenant_123");
      expect((embedPayload as any).documentId).toBe("bundle_123");
    });
  });

  describe("Event lifecycle", () => {
    it("marks event as PROCESSING then COMPLETED", async () => {
      mockDb.event.findUnique.mockResolvedValue(createMockEvent("LINEAR"));
      mockDb.integration.findFirst.mockResolvedValue(null);

      const job = createMockJob({
        eventId: "evt_123",
        tenantId: "tenant_123",
        sourceType: "linear",
        sourceId: "issue_123",
      });

      await processContextAssembly(job);

      // First update: PROCESSING
      const firstUpdate = mockDb.event.update.mock.calls[0]![0] as any;
      expect(firstUpdate.data.status).toBe("PROCESSING");

      // Second update: COMPLETED
      const secondUpdate = mockDb.event.update.mock.calls[1]![0] as any;
      expect(secondUpdate.data.status).toBe("COMPLETED");
      expect(secondUpdate.data.processedAt).toBeInstanceOf(Date);
    });

    it("skips assembly if event not found", async () => {
      mockDb.event.findUnique.mockResolvedValue(null);

      const job = createMockJob({
        eventId: "evt_missing",
        tenantId: "tenant_123",
        sourceType: "linear",
        sourceId: "issue_123",
      });

      await processContextAssembly(job);

      expect(mockDb.contextBundle.upsert).not.toHaveBeenCalled();
      expect(mockRiskClassificationQueue.add).not.toHaveBeenCalled();
    });

    it("skips assembly if integration has no access token", async () => {
      mockDb.event.findUnique.mockResolvedValue({
        ...createMockEvent("LINEAR"),
        integration: {
          id: "int_123",
          tenantId: "tenant_123",
          provider: "LINEAR",
          status: "ACTIVE",
          accessToken: null, // No token
        },
      });

      const job = createMockJob({
        eventId: "evt_123",
        tenantId: "tenant_123",
        sourceType: "linear",
        sourceId: "issue_123",
      });

      await processContextAssembly(job);

      expect(mockDb.contextBundle.upsert).not.toHaveBeenCalled();
    });
  });

  describe("Bundle content structure", () => {
    it("creates self-contained bundle with assembledAt timestamp", async () => {
      mockDb.event.findUnique.mockResolvedValue(createMockEvent("LINEAR"));
      mockDb.integration.findFirst.mockResolvedValue(null);

      const job = createMockJob({
        eventId: "evt_123",
        tenantId: "tenant_123",
        sourceType: "linear",
        sourceId: "issue_123",
      });

      await processContextAssembly(job);

      const upsertCall = mockDb.contextBundle.upsert.mock.calls[0]![0] as any;
      const content = upsertCall.create.content;

      expect(content.assembledAt).toBeDefined();
      expect(new Date(content.assembledAt).getTime()).not.toBeNaN();
      expect(content.primary).toBeDefined();
      expect(content.crossReferences).toBeDefined();
      expect(content.missingItems).toBeDefined();
    });

    it("sets bundle status to READY", async () => {
      mockDb.event.findUnique.mockResolvedValue(createMockEvent("LINEAR"));
      mockDb.integration.findFirst.mockResolvedValue(null);

      const job = createMockJob({
        eventId: "evt_123",
        tenantId: "tenant_123",
        sourceType: "linear",
        sourceId: "issue_123",
      });

      await processContextAssembly(job);

      const upsertCall = mockDb.contextBundle.upsert.mock.calls[0]![0] as any;
      expect(upsertCall.create.status).toBe("READY");
    });

    it("sets bundle title from ticket title", async () => {
      mockDb.event.findUnique.mockResolvedValue(createMockEvent("LINEAR"));
      mockDb.integration.findFirst.mockResolvedValue(null);

      const job = createMockJob({
        eventId: "evt_123",
        tenantId: "tenant_123",
        sourceType: "linear",
        sourceId: "issue_123",
      });

      await processContextAssembly(job);

      const upsertCall = mockDb.contextBundle.upsert.mock.calls[0]![0] as any;
      expect(upsertCall.create.title).toBe("Test Issue");
    });
  });
});

describe("Cross-Reference URL Extraction", () => {
  // Test the URL extraction utilities
  it("extracts Notion page IDs from URLs", async () => {
    const { extractNotionPageId } = await import("../lib/cross-reference");

    expect(
      extractNotionPageId(
        "https://notion.so/workspace/Page-Title-abc123def456789012345678abcdef12"
      )
    ).toBe("abc123def456789012345678abcdef12");

    expect(
      extractNotionPageId("https://www.notion.so/abc123def456789012345678abcdef12")
    ).toBe("abc123def456789012345678abcdef12");
  });

  it("extracts Linear issue identifiers from URLs", async () => {
    const { extractLinearIssueId } = await import("../lib/cross-reference");

    expect(
      extractLinearIssueId("https://linear.app/loomii/issue/LOO-134/some-title")
    ).toBe("LOO-134");

    expect(
      extractLinearIssueId("https://linear.app/workspace/issue/ENG-99")
    ).toBe("ENG-99");

    expect(extractLinearIssueId("https://google.com")).toBeNull();
  });
});

describe("Fetch Timeout Utility", () => {
  it("resolves when function completes within timeout", async () => {
    const { fetchWithTimeout } = await import("../lib/fetch-timeout");

    const result = await fetchWithTimeout(
      async () => "success",
      5000
    );
    expect(result).toBe("success");
  });

  it("rejects with FetchTimeoutError when function exceeds timeout", async () => {
    const { fetchWithTimeout, FetchTimeoutError } = await import(
      "../lib/fetch-timeout"
    );

    const slowFn = () =>
      new Promise<string>((resolve) => setTimeout(() => resolve("late"), 500));

    try {
      await fetchWithTimeout(slowFn, 50);
      expect(true).toBe(false); // Should not reach here
    } catch (err: any) {
      expect(err).toBeInstanceOf(FetchTimeoutError);
      expect(err.message).toContain("50ms");
    }
  });
});
