import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { Agent } from "@mastra/core/agent";

/**
 * AWS Bedrock provider configured for Loomii.
 *
 * Auth priority (handled by @ai-sdk/amazon-bedrock automatically):
 * 1. AWS_BEARER_TOKEN_BEDROCK env var (bearer token auth - simplest)
 * 2. AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY (SigV4 auth)
 *
 * The SDK reads these env vars automatically:
 * - AWS_REGION
 * - AWS_BEARER_TOKEN_BEDROCK (for bearer auth)
 * - AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY (for SigV4 fallback)
 */
export const bedrock = createAmazonBedrock({
  region: process.env.AWS_REGION ?? "us-east-1",
});

/**
 * Model IDs available for Loomii agents.
 * These must be enabled in AWS Bedrock Model Access console.
 * Using cross-region inference profile IDs (us. prefix).
 */
export const MODELS = {
  /** Primary model for design reviews - highest capability */
  CLAUDE_OPUS: "us.anthropic.claude-opus-4-5-20251101-v1:0",
  /** Balanced model for design reviews - high capability, lower cost than Opus */
  CLAUDE_SONNET: "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
  /** Fast model for risk classification and lightweight tasks - lowest cost */
  CLAUDE_HAIKU: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
} as const;

/**
 * System message type for Mastra agent instructions.
 * Using the explicit { role: 'system', content: string } format
 * ensures Mastra sends these as proper system messages to the LLM.
 */
type SystemMessage = string | { role: "system"; content: string } | Array<{ role: "system"; content: string }>;

/**
 * Create a Mastra Agent backed by a Bedrock model.
 * This is the factory used by all Loomii AI agents (design-review, risk-classifier, etc.)
 *
 * The `instructions` parameter becomes the system prompt sent to the LLM.
 * Pass a string (auto-wrapped) or explicit { role: 'system', content: '...' } messages.
 *
 * User messages are passed separately via agent.generate(messages).
 */
export function createBedrockAgent(config: {
  id: string;
  name: string;
  instructions: SystemMessage;
  model?: keyof typeof MODELS;
}) {
  const modelId = MODELS[config.model ?? "CLAUDE_SONNET"];

  return new Agent({
    id: config.id,
    name: config.name,
    instructions: config.instructions,
    model: bedrock(modelId),
  });
}
