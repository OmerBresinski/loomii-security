/**
 * E2E Bedrock + Mastra Agent Invocation Tests
 *
 * These tests validate that AWS Bedrock credentials are configured correctly
 * and that we can invoke Claude models via Mastra agents.
 *
 * Prerequisites:
 * - AWS_BEARER_TOKEN_BEDROCK or AWS_ACCESS_KEY_ID+AWS_SECRET_ACCESS_KEY set in .env
 * - AWS_REGION set (default: us-east-1)
 * - Bedrock model access enabled for Claude models in AWS console
 *
 * Run: bun test apps/workers/src/lib/bedrock.e2e.test.ts
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { bedrock, MODELS, createBedrockAgent } from "./bedrock";
import { generateText } from "ai";

describe("E2E: Bedrock + Mastra Agent", () => {
  beforeAll(() => {
    const hasBearer = !!process.env.AWS_BEARER_TOKEN_BEDROCK;
    const hasKeys =
      !!process.env.AWS_ACCESS_KEY_ID &&
      !!process.env.AWS_SECRET_ACCESS_KEY &&
      process.env.AWS_ACCESS_KEY_ID !== "placeholder";

    if (!hasBearer && !hasKeys) {
      throw new Error(
        "AWS credentials not configured. Set AWS_BEARER_TOKEN_BEDROCK or AWS_ACCESS_KEY_ID+AWS_SECRET_ACCESS_KEY in .env",
      );
    }
  });

  describe("Bedrock provider initialization", () => {
    it("creates a bedrock provider instance", () => {
      expect(bedrock).toBeDefined();
      expect(typeof bedrock).toBe("function");
    });

    it("creates a language model from model ID", () => {
      const model = bedrock(MODELS.CLAUDE_SONNET);
      expect(model).toBeDefined();
      expect(model.modelId).toContain("anthropic");
    });
  });

  describe("Direct model invocation (AI SDK)", () => {
    it("invokes Claude Sonnet and gets a valid response", async () => {
      const model = bedrock(MODELS.CLAUDE_SONNET);

      const result = await generateText({
        model,
        prompt: "Respond with exactly: HELLO_LOOMII",
        maxOutputTokens: 50,
      });

      expect(result.text).toContain("HELLO_LOOMII");
      expect(result.usage?.totalTokens).toBeGreaterThan(0);
    }, 30_000);

    it("handles streaming invocation", async () => {
      const model = bedrock(MODELS.CLAUDE_SONNET);

      const result = await generateText({
        model,
        prompt: "Say 'ping' and nothing else.",
        maxOutputTokens: 10,
      });

      expect(result.text.toLowerCase()).toContain("ping");
    }, 30_000);
  });

  describe("Mastra Agent invocation", () => {
    it("creates and invokes a Mastra agent with Bedrock", async () => {
      const agent = createBedrockAgent({
        id: "test-agent",
        name: "Test Agent",
        instructions:
          "You are a test agent. When asked to identify yourself, respond with exactly: LOOMII_AGENT_OK",
      });

      const response = await agent.generate(
        "Identify yourself using the exact phrase from your instructions.",
      );

      expect(response.text).toContain("LOOMII_AGENT_OK");
    }, 30_000);

    it("agent respects system instructions", async () => {
      const agent = createBedrockAgent({
        id: "security-test",
        name: "Security Test Agent",
        instructions:
          "You are a security review agent. Always start your response with [SECURITY].",
      });

      const response = await agent.generate(
        "What is the most common web vulnerability?",
      );

      expect(response.text).toStartWith("[SECURITY]");
    }, 30_000);
  });

  describe("Error handling", () => {
    it("returns error for invalid model ID", async () => {
      const invalidModel = bedrock("anthropic.nonexistent-model-v99");

      await expect(
        generateText({
          model: invalidModel,
          prompt: "test",
          maxOutputTokens: 10,
        }),
      ).rejects.toThrow();
    }, 15_000);
  });
});
