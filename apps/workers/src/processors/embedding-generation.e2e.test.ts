/**
 * E2E Embedding Generation Tests
 *
 * These tests validate the full embedding pipeline against real AWS Bedrock:
 * - Titan Embed v2 model returns 1024-dimensional vectors
 * - embedMany works with multiple values in a single call
 * - Chunking + embedding pipeline produces correct output
 * - Semantic similarity works (related texts have higher similarity)
 *
 * Prerequisites:
 * - AWS_BEARER_TOKEN_BEDROCK or AWS_ACCESS_KEY_ID+AWS_SECRET_ACCESS_KEY set in .env
 * - AWS_REGION set (default: us-east-1)
 * - Bedrock model access enabled for amazon.titan-embed-text-v2:0
 *
 * Run: bun test apps/workers/src/processors/embedding-generation.e2e.test.ts
 */
import { describe, it, expect } from "bun:test";
import { embedMany, cosineSimilarity } from "ai";
import { bedrock } from "../lib/bedrock";
import { chunkContent } from "../lib/chunker";
import { generateEmbeddings, generateQueryEmbedding } from "../lib/embeddings";

const hasBearer = !!process.env.AWS_BEARER_TOKEN_BEDROCK;
const hasKeys =
  !!process.env.AWS_ACCESS_KEY_ID &&
  !!process.env.AWS_SECRET_ACCESS_KEY &&
  process.env.AWS_ACCESS_KEY_ID !== "placeholder";
const hasCredentials = hasBearer || hasKeys;

// Detect if mock.module leaked from unit tests (happens with bare `bun test`)
const isMocked = bedrock.embeddingModel("test")?.provider === "mock-embed";

const describeE2E = hasCredentials && !isMocked ? describe : describe.skip;

if (!hasCredentials) {
  console.log(
    "⚠️  Skipping E2E Embedding tests: AWS credentials not configured"
  );
} else if (isMocked) {
  console.log(
    "⚠️  Skipping E2E Embedding tests: modules are mocked (use `bun run test` for full suite)"
  );
}

describeE2E("E2E: Embedding Generation", () => {
  describe("Titan Embed v2 model", () => {
    it("generates a 1024-dimensional embedding for a single value", async () => {
      const model = bedrock.embeddingModel("amazon.titan-embed-text-v2:0");

      const { embeddings } = await embedMany({
        model,
        values: ["Authentication bypass vulnerability in OAuth2 flow"],
      });

      expect(embeddings).toHaveLength(1);
      expect(embeddings[0]).toHaveLength(1024);

      // All values should be finite numbers
      for (const val of embeddings[0]) {
        expect(Number.isFinite(val)).toBe(true);
      }
    }, 30_000);

    it("generates embeddings for multiple values in a batch", async () => {
      const model = bedrock.embeddingModel("amazon.titan-embed-text-v2:0");

      const values = [
        "SQL injection attack on user input form",
        "Cross-site scripting vulnerability in comment section",
        "Buffer overflow in C memory allocation",
      ];

      const { embeddings } = await embedMany({
        model,
        values,
      });

      expect(embeddings).toHaveLength(3);
      for (const embedding of embeddings) {
        expect(embedding).toHaveLength(1024);
      }
    }, 30_000);

    it("produces consistent embeddings for identical text", async () => {
      const model = bedrock.embeddingModel("amazon.titan-embed-text-v2:0");
      const text = "Deterministic embedding test input";

      const { embeddings: first } = await embedMany({
        model,
        values: [text],
      });

      const { embeddings: second } = await embedMany({
        model,
        values: [text],
      });

      // Same text should produce identical (or near-identical) embeddings
      const similarity = cosineSimilarity(first[0], second[0]);
      expect(similarity).toBeGreaterThan(0.999);
    }, 30_000);
  });

  describe("Semantic similarity", () => {
    it("related texts have higher similarity than unrelated texts", async () => {
      const model = bedrock.embeddingModel("amazon.titan-embed-text-v2:0");

      const { embeddings } = await embedMany({
        model,
        values: [
          "Authentication bypass vulnerability in the login endpoint",
          "Unauthorized access to admin panel through broken auth",
          "Recipe for chocolate chip cookies with vanilla extract",
        ],
      });

      const [securityA, securityB, cooking] = embeddings;

      // Two security-related texts should be more similar to each other
      const securitySimilarity = cosineSimilarity(securityA, securityB);
      const crossSimilarity = cosineSimilarity(securityA, cooking);

      expect(securitySimilarity).toBeGreaterThan(crossSimilarity);
      // Security texts should have meaningful similarity (model-dependent threshold)
      expect(securitySimilarity).toBeGreaterThan(0.3);
      expect(crossSimilarity).toBeLessThan(securitySimilarity);
    }, 30_000);
  });

  describe("Full pipeline: chunking + embedding", () => {
    it("chunks and embeds a multi-paragraph document", async () => {
      const document = [
        "The OAuth2 implementation uses authorization code flow with PKCE for mobile clients. The token endpoint validates the code verifier against the stored code challenge using SHA-256. Refresh tokens are rotated on every use with a 7-day absolute expiry.",
        "Session management relies on httpOnly, secure, sameSite=strict cookies. The session ID is regenerated after authentication to prevent session fixation. Idle timeout is set to 30 minutes with server-side enforcement.",
        "Input validation uses a whitelist approach for all API endpoints. Request bodies are validated against JSON Schema definitions. SQL queries use parameterized statements exclusively through the ORM layer.",
        "The API rate limiter uses a sliding window algorithm with per-user quotas. Authenticated endpoints allow 100 requests per minute. Unauthenticated endpoints are limited to 10 requests per minute per IP.",
      ].join("\n\n");

      // Step 1: Chunk
      const chunks = chunkContent(document);
      expect(chunks.length).toBeGreaterThanOrEqual(1);

      // Step 2: Generate embeddings
      const results = await generateEmbeddings(chunks);

      // Verify results
      expect(results).toHaveLength(chunks.length);

      for (let i = 0; i < results.length; i++) {
        expect(results[i].index).toBe(chunks[i].index);
        expect(results[i].content).toBe(chunks[i].content);
        expect(results[i].vector).toHaveLength(1024);
      }
    }, 60_000);

    it("query embedding retrieves relevant chunks via cosine similarity", async () => {
      // Embed some security-related content chunks
      const chunks = [
        { index: 0, content: "SQL injection can be prevented by using parameterized queries and input validation." },
        { index: 1, content: "Rate limiting protects APIs from denial of service attacks by throttling requests." },
        { index: 2, content: "JWT tokens should use short expiry times and be stored in httpOnly cookies." },
        { index: 3, content: "The company picnic will be held next Saturday with barbecue and games." },
      ];

      const results = await generateEmbeddings(chunks);

      // Generate a query embedding
      const queryVector = await generateQueryEmbedding(
        "How to prevent SQL injection attacks?"
      );

      expect(queryVector).toHaveLength(1024);

      // Calculate similarities
      const similarities = results.map((r) => ({
        index: r.index,
        content: r.content,
        similarity: cosineSimilarity(queryVector, r.vector),
      }));

      // Sort by similarity (highest first)
      similarities.sort((a, b) => b.similarity - a.similarity);

      // The SQL injection chunk should be the most relevant
      expect(similarities[0].index).toBe(0);
      expect(similarities[0].content).toContain("SQL injection");

      // The picnic chunk should be least relevant
      expect(similarities[similarities.length - 1].index).toBe(3);
    }, 60_000);
  });

  describe("Performance and limits", () => {
    it("processes embedding within 30 seconds SLA", async () => {
      // Create a document of ~2000 tokens (realistic size)
      const paragraphs = Array.from(
        { length: 8 },
        (_, i) =>
          `Security consideration ${i + 1}: The system must validate all user inputs at the API gateway level before forwarding to internal services. This includes checking request size limits, content type validation, and sanitizing path parameters to prevent path traversal attacks.`
      );
      const document = paragraphs.join("\n\n");

      const startTime = Date.now();

      const chunks = chunkContent(document);
      const results = await generateEmbeddings(chunks);

      const durationMs = Date.now() - startTime;

      // Must complete within 30 seconds (the SLA)
      expect(durationMs).toBeLessThan(30_000);

      // Verify we got results
      expect(results.length).toBeGreaterThan(0);
      for (const r of results) {
        expect(r.vector).toHaveLength(1024);
      }
    }, 35_000);
  });

  describe("Error handling", () => {
    it("rejects with error for invalid model ID", async () => {
      const invalidModel = bedrock.embeddingModel(
        "amazon.nonexistent-embed-model-v99" as any
      );

      await expect(
        embedMany({
          model: invalidModel,
          values: ["test"],
        })
      ).rejects.toThrow();
    }, 15_000);
  });
});
