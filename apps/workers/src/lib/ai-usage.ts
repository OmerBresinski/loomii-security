/**
 * AI Usage Tracking
 *
 * Records token usage and cost for every LLM call.
 * Costs are calculated using Bedrock on-demand pricing (per 1K tokens).
 *
 * Pricing source: https://aws.amazon.com/bedrock/pricing/
 * Last updated: 2026-05-26
 */
import { db } from "@loomii/db";
import { logger } from "./logger";

// ─── Pricing (USD per 1,000 tokens) ─────────────────────────────────────────

const PRICING: Record<string, { input: number; output: number }> = {
  // Claude Sonnet 4 (via Bedrock cross-region inference)
  "us.anthropic.claude-sonnet-4-5-20250929-v1:0": {
    input: 0.003, // $3/M input tokens
    output: 0.015, // $15/M output tokens
  },
  // Claude Haiku 4 (via Bedrock cross-region inference)
  "us.anthropic.claude-haiku-4-5-20251001-v1:0": {
    input: 0.0008, // $0.80/M input tokens
    output: 0.004, // $4/M output tokens
  },
  // Claude Opus 4 (via Bedrock cross-region inference)
  "us.anthropic.claude-opus-4-5-20251101-v1:0": {
    input: 0.015, // $15/M input tokens
    output: 0.075, // $75/M output tokens
  },
  // Amazon Titan Embeddings V2
  "amazon.titan-embed-text-v2:0": {
    input: 0.0002, // $0.20/M tokens
    output: 0, // embeddings have no output tokens
  },
};

// Short model labels for display
const MODEL_LABELS: Record<string, string> = {
  "us.anthropic.claude-sonnet-4-5-20250929-v1:0": "claude-sonnet-4",
  "us.anthropic.claude-haiku-4-5-20251001-v1:0": "claude-haiku-4",
  "us.anthropic.claude-opus-4-5-20251101-v1:0": "claude-opus-4",
  "amazon.titan-embed-text-v2:0": "titan-embed-v2",
};

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens?: number;
}

export interface RecordUsageParams {
  tenantId: string;
  modelId: string;
  operation: string;
  usage: TokenUsage;
}

// ─── Core Function ───────────────────────────────────────────────────────────

/**
 * Calculate cost in USD cents for a given model and token usage.
 */
export function calculateCostCents(
  modelId: string,
  usage: TokenUsage
): number {
  const pricing = PRICING[modelId];
  if (!pricing) return 0;

  // Pricing is per 1K tokens in USD
  const inputCostDollars = (usage.promptTokens / 1000) * pricing.input;
  const outputCostDollars = (usage.completionTokens / 1000) * pricing.output;
  const totalDollars = inputCostDollars + outputCostDollars;

  // Convert to cents, round to 4 decimal places
  return Math.round(totalDollars * 100 * 10000) / 10000;
}

/**
 * Record AI usage to the database. Fire-and-forget (non-blocking).
 * Failures are logged but never throw — usage tracking must not break production flows.
 */
export function recordUsage(params: RecordUsageParams): void {
  const { tenantId, modelId, operation, usage } = params;
  const costCents = calculateCostCents(modelId, usage);
  const modelLabel = MODEL_LABELS[modelId] ?? modelId;

  // Fire-and-forget DB write
  db.aiUsage
    .create({
      data: {
        tenantId,
        model: modelLabel,
        operation,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens ?? usage.promptTokens + usage.completionTokens,
        costCents,
      },
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(
        { tenantId, model: modelLabel, operation, error: message },
        "Failed to record AI usage (non-fatal)"
      );
    });
}
