/**
 * Tests for Embedding Generation Processor.
 *
 * All external dependencies (Bedrock API, DB) are mocked.
 * Tests cover:
 * - Generates embeddings for all chunks (AC2)
 * - Upserts (replaces) on re-process (AC3)
 * - Sets correct tenantId and sourceType (AC4)
 * - Handles empty content gracefully
 * - Cleans up stale chunks on re-process
 */
import { describe, it, expect, beforeEach, mock } from "bun:test";
import type { Job } from "bullmq";
import type { EmbeddingGenerationPayload } from "@loomii/queue";

// =========================================
// Mock setup
// =========================================

const mockInsertEmbedding = mock((_db: any, _data: any) => Promise.resolve());
const mockExecuteRaw = mock((_args: any) => Promise.resolve(0));

const mockDb = {
  $executeRaw: mockExecuteRaw,
};

// Track what was inserted
const insertedEmbeddings: Array<{
  id: string;
  tenantId: string;
  documentId: string;
  chunk: number;
  content: string;
  vector: number[];
  metadata: unknown;
}> = [];

mock.module("@loomii/db", () => ({
  db: mockDb,
  insertEmbedding: (db: any, data: any) => {
    insertedEmbeddings.push(data);
    return mockInsertEmbedding(db, data);
  },
}));

// Generate a random 1024-dimensional vector (mock)
function mockVector(): number[] {
  return Array.from({ length: 1024 }, () => Math.random());
}

const mockEmbedMany = mock(async ({ values }: { values: string[] }) => ({
  embeddings: values.map(() => mockVector()),
  usage: { tokens: values.length * 100 },
}));

// Mock the local embeddings module to avoid needing the real Bedrock provider.
// Do NOT mock the top-level "ai" package here - it contaminates the module cache
// and breaks @ai-sdk/amazon-bedrock and @mastra/core in other test files.
mock.module("../lib/embeddings", () => ({
  generateEmbeddings: async (chunks: Array<{ index: number; content: string }>) => {
    // Call the tracked mock for assertion purposes
    const result = await mockEmbedMany({ values: chunks.map((c) => c.content) });
    return chunks.map((chunk, i) => ({
      index: chunk.index,
      content: chunk.content,
      vector: result.embeddings[i],
    }));
  },
  generateQueryEmbedding: async (_query: string) => mockVector(),
}));

// Import after mocking
const { processEmbeddingGeneration } = await import(
  "../processors/embedding-generation"
);

// =========================================
// Test helpers
// =========================================

function createMockJob(
  data: EmbeddingGenerationPayload
): Job<EmbeddingGenerationPayload> {
  return {
    id: "job_123",
    name: "generate",
    data,
    processedOn: Date.now(),
  } as unknown as Job<EmbeddingGenerationPayload>;
}

// =========================================
// Tests
// =========================================

describe("Embedding Generation Processor", () => {
  beforeEach(() => {
    insertedEmbeddings.length = 0;
    mockInsertEmbedding.mockClear();
    mockExecuteRaw.mockClear();
    mockEmbedMany.mockClear();
  });

  it("generates embeddings for all chunks", async () => {
    // Create content that will produce multiple chunks (~2000 tokens)
    const content = Array.from(
      { length: 100 },
      (_, i) => `Paragraph ${i}: This is a section of content that discusses security implications.`
    ).join("\n\n");

    const job = createMockJob({
      tenantId: "tenant_1",
      documentId: "doc_1",
      content,
    });

    await processEmbeddingGeneration(job);

    // Should have called embedMany at least once
    expect(mockEmbedMany).toHaveBeenCalled();

    // Should have inserted embeddings for each chunk
    expect(insertedEmbeddings.length).toBeGreaterThan(0);

    // Each embedding should have a 1024-dimension vector
    for (const emb of insertedEmbeddings) {
      expect(emb.vector.length).toBe(1024);
    }
  });

  it("upserts (replaces) on re-process", async () => {
    const content = "This is some content to embed. It has enough text to generate at least one chunk for testing.";

    const job = createMockJob({
      tenantId: "tenant_1",
      documentId: "doc_1",
      content,
    });

    // Process once
    await processEmbeddingGeneration(job);
    const firstRunCount = insertedEmbeddings.length;

    // Process again (same documentId - simulating re-process)
    insertedEmbeddings.length = 0;
    await processEmbeddingGeneration(job);
    const secondRunCount = insertedEmbeddings.length;

    // Both runs should produce the same number of embeddings
    expect(secondRunCount).toBe(firstRunCount);

    // The IDs should follow the deterministic pattern (tenant_docId_chunkIndex)
    for (const emb of insertedEmbeddings) {
      expect(emb.id).toMatch(/^tenant_1_doc_1_\d+$/);
    }
  });

  it("sets correct tenantId on all embeddings", async () => {
    const content = "Security review content for embedding. This discusses authentication flows and authorization.";

    const job = createMockJob({
      tenantId: "tenant_xyz",
      documentId: "doc_abc",
      content,
    });

    await processEmbeddingGeneration(job);

    // Every inserted embedding should have the correct tenantId
    for (const emb of insertedEmbeddings) {
      expect(emb.tenantId).toBe("tenant_xyz");
      expect(emb.documentId).toBe("doc_abc");
    }
  });

  it("passes metadata to embeddings", async () => {
    const content = "Content with metadata attached for context tracking.";
    const metadata = { sourceType: "linear_ticket", sourceId: "LOO-100" };

    const job = createMockJob({
      tenantId: "tenant_1",
      documentId: "doc_1",
      content,
      metadata,
    });

    await processEmbeddingGeneration(job);

    for (const emb of insertedEmbeddings) {
      expect(emb.metadata).toEqual(metadata);
    }
  });

  it("handles empty content gracefully", async () => {
    const job = createMockJob({
      tenantId: "tenant_1",
      documentId: "doc_1",
      content: "",
    });

    await processEmbeddingGeneration(job);

    // Should not call embedMany or insert anything
    expect(mockEmbedMany).not.toHaveBeenCalled();
    expect(insertedEmbeddings.length).toBe(0);
  });

  it("cleans up stale chunks on re-process", async () => {
    const content = "Short content that produces just one chunk.";

    const job = createMockJob({
      tenantId: "tenant_1",
      documentId: "doc_1",
      content,
    });

    await processEmbeddingGeneration(job);

    // Should have called $executeRaw to delete stale chunks
    expect(mockExecuteRaw).toHaveBeenCalled();
  });

  it("uses sequential chunk indices starting from 0", async () => {
    const content = Array.from(
      { length: 50 },
      (_, i) => `Section ${i}: discussing various security topics and implications for the system.`
    ).join("\n\n");

    const job = createMockJob({
      tenantId: "tenant_1",
      documentId: "doc_1",
      content,
    });

    await processEmbeddingGeneration(job);

    // Check that chunk indices are sequential
    const indices = insertedEmbeddings.map((e) => e.chunk).sort((a, b) => a - b);
    for (let i = 0; i < indices.length; i++) {
      expect(indices[i]).toBe(i);
    }
  });

  it("generates deterministic IDs from tenantId + documentId + chunkIndex", async () => {
    const content = "Content for ID verification test. Enough text to work with.";

    const job = createMockJob({
      tenantId: "t1",
      documentId: "d1",
      content,
    });

    await processEmbeddingGeneration(job);

    expect(insertedEmbeddings[0].id).toBe("t1_d1_0");
  });
});
