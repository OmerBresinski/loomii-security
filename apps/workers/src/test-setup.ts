/**
 * Test preload script for unit tests.
 *
 * Bun's mock.module() is global across ALL test files in a single run.
 * This preload script provides consistent mocks for modules that:
 * 1. Have heavy external deps (AWS SDK, Mastra) that shouldn't load in unit tests
 * 2. Have side effects at import time (Redis connection in @loomii/queue)
 * 3. Cause cross-file contamination when mocked inconsistently (pino logger)
 *
 * E2E tests should NOT use this preload - they need the real modules.
 */
import { mock } from "bun:test";

// ─── Logger ──────────────────────────────────────────────────────────────────
// Pino's child() method breaks when tests run together due to module caching.
const mockLogger: any = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  fatal: () => {},
  child: () => mockLogger,
};

mock.module("./lib/logger", () => ({ logger: mockLogger }));
mock.module("../lib/logger", () => ({ logger: mockLogger }));
mock.module("../../lib/logger", () => ({ logger: mockLogger }));

// ─── Bedrock / AI SDK ────────────────────────────────────────────────────────
// @ai-sdk/amazon-bedrock and @mastra/core are heavy deps that shouldn't load in unit tests.
const mockBedrock: any = (modelId: string) => ({ modelId, provider: "mock" });
mockBedrock.embeddingModel = (modelId: string) => ({ modelId, provider: "mock-embed" });
mockBedrock.languageModel = (modelId: string) => ({ modelId, provider: "mock-lang" });

mock.module("@ai-sdk/amazon-bedrock", () => ({
  createAmazonBedrock: () => mockBedrock,
}));

mock.module("@mastra/core/agent", () => ({
  Agent: class MockAgent {
    constructor() {}
    generate = async () => ({ object: null, text: "" });
  },
}));

mock.module("@mastra/core/tools", () => ({
  createTool: (config: any) => config,
}));
