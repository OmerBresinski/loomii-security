/**
 * LLM Fallback Handler
 *
 * Implements the resilient retry sequence for design review generation:
 *
 * 1. Primary (Sonnet 4) attempt
 * 2. Wait 5 seconds
 * 3. Primary (Sonnet 4) retry
 * 4. Fallback (Haiku) attempt
 * 5. Wait 5 seconds
 * 6. Fallback (Haiku) retry
 *
 * If any attempt succeeds, returns the result with the model that produced it.
 * If all 4 attempts fail, throws with a combined error message.
 *
 * Total time budget: under 5 minutes (4 attempts * 90s max + 10s delays = ~6m worst case).
 * In practice, timeouts and fast failures keep it well under 5 minutes.
 */
import { ReviewOutputSchema, type ReviewOutput } from "@loomii/shared/schemas";
import {
  designReviewAgent,
  designReviewTools,
  buildReviewPrompt,
} from "../agents/design-review";
import {
  fallbackReviewAgent,
  fallbackReviewTools,
} from "../agents/design-review-fallback";
import { MODELS } from "./bedrock";
import { logger } from "./logger";
import { recordUsage, type TokenUsage } from "./ai-usage";
import type { Logger } from "pino";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FallbackResult {
  /** The validated review output */
  output: ReviewOutput;
  /** Which model produced the review */
  modelUsed: string;
  /** Which attempt succeeded (1-4) */
  attemptNumber: number;
  /** Whether the fallback model was used */
  usedFallback: boolean;
}

export interface FallbackInput {
  tenantId: string;
  bundleContent: string;
  riskLevel: string;
  bundleTitle?: string | null;
}

export interface FallbackAgents {
  primary: { generate: Function };
  primaryTools: Record<string, any>;
  primaryModelId: string;
  fallback: { generate: Function };
  fallbackTools: Record<string, any>;
  fallbackModelId: string;
  /** Optional sleep function override (defaults to Bun.sleep) */
  sleepFn?: (ms: number) => Promise<void>;
}

/** Delay between retry attempts (milliseconds) */
const RETRY_DELAY_MS = 5_000;

/** Timeout per individual attempt */
const ATTEMPT_TIMEOUT_MS = 90 * 1000;

/** Default sleep function using Bun.sleep */
const defaultSleep = (ms: number): Promise<void> => Bun.sleep(ms);

// ─── Default Agents (used by the convenience wrapper) ─────────────────────────

function getDefaultAgents(): FallbackAgents {
  return {
    primary: designReviewAgent,
    primaryTools: designReviewTools,
    primaryModelId: MODELS.CLAUDE_SONNET,
    fallback: fallbackReviewAgent,
    fallbackTools: fallbackReviewTools,
    fallbackModelId: MODELS.CLAUDE_HAIKU,
  };
}

// ─── Fallback Sequence ────────────────────────────────────────────────────────

/**
 * Convenience wrapper that uses the default primary + fallback agents.
 * This is what the processor calls.
 */
export async function generateWithFallback(
  input: FallbackInput
): Promise<FallbackResult> {
  return generateWithFallbackAgents(input, getDefaultAgents());
}

/**
 * Execute the full 4-attempt fallback sequence with provided agents.
 * This is the testable core - accepts agents via dependency injection.
 *
 * Sequence: primary -> 5s -> retry primary -> fallback -> 5s -> retry fallback
 *
 * @throws Error if all 4 attempts fail (with combined error messages)
 */
export async function generateWithFallbackAgents(
  input: FallbackInput,
  agents: FallbackAgents
): Promise<FallbackResult> {
  const childLogger = logger.child({
    module: "fallback-handler",
    tenantId: input.tenantId,
  });

  const sleepFn = agents.sleepFn ?? defaultSleep;

  const errors: string[] = [];

  // ─── Attempt 1: Primary (Sonnet 4) ──────────────────────────────────
  childLogger.info("Attempt 1: Primary (Sonnet 4)");
  const attempt1 = await tryGenerate(
    agents.primary,
    agents.primaryTools,
    input,
    childLogger,
    agents.primaryModelId
  );
  if (attempt1) {
    return {
      output: attempt1,
      modelUsed: agents.primaryModelId,
      attemptNumber: 1,
      usedFallback: false,
    };
  }
  errors.push("Attempt 1 (primary): failed");

  // ─── Wait 5 seconds ─────────────────────────────────────────────────
  childLogger.info("Waiting 5s before primary retry...");
  await sleepFn(RETRY_DELAY_MS);

  // ─── Attempt 2: Primary retry ───────────────────────────────────────
  childLogger.info("Attempt 2: Primary retry (Sonnet 4)");
  const attempt2 = await tryGenerate(
    agents.primary,
    agents.primaryTools,
    input,
    childLogger,
    agents.primaryModelId
  );
  if (attempt2) {
    return {
      output: attempt2,
      modelUsed: agents.primaryModelId,
      attemptNumber: 2,
      usedFallback: false,
    };
  }
  errors.push("Attempt 2 (primary retry): failed");

  // ─── Attempt 3: Fallback (Haiku) ───────────────────────────────────
  childLogger.info("Attempt 3: Fallback (Haiku)");
  const attempt3 = await tryGenerate(
    agents.fallback,
    agents.fallbackTools,
    input,
    childLogger,
    agents.fallbackModelId
  );
  if (attempt3) {
    return {
      output: attempt3,
      modelUsed: agents.fallbackModelId,
      attemptNumber: 3,
      usedFallback: true,
    };
  }
  errors.push("Attempt 3 (haiku): failed");

  // ─── Wait 5 seconds ─────────────────────────────────────────────────
  childLogger.info("Waiting 5s before Haiku retry...");
  await sleepFn(RETRY_DELAY_MS);

  // ─── Attempt 4: Fallback retry (Haiku) ─────────────────────────────
  childLogger.info("Attempt 4: Fallback retry (Haiku)");
  const attempt4 = await tryGenerate(
    agents.fallback,
    agents.fallbackTools,
    input,
    childLogger,
    agents.fallbackModelId
  );
  if (attempt4) {
    return {
      output: attempt4,
      modelUsed: agents.fallbackModelId,
      attemptNumber: 4,
      usedFallback: true,
    };
  }
  errors.push("Attempt 4 (haiku retry): failed");

  // ─── All attempts failed ────────────────────────────────────────────
  throw new Error(
    `All 4 LLM attempts failed: ${errors.join("; ")}`
  );
}

// ─── Single Attempt ───────────────────────────────────────────────────────────

/**
 * Try a single generation attempt with a given agent.
 * Returns the validated output on success, or null on failure.
 * Never throws - all errors are caught and logged.
 */
async function tryGenerate(
  agent: { generate: Function },
  tools: Record<string, any>,
  input: FallbackInput,
  childLogger: Logger,
  modelId: string
): Promise<ReviewOutput | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);

  try {
    const prompt = buildReviewPrompt(
      input.bundleContent,
      input.riskLevel,
      input.bundleTitle
    );

    const result = await (agent.generate(prompt, {
      tools,
      structuredOutput: {
        schema: ReviewOutputSchema,
      },
      maxSteps: 4,
      requestContext: new Map([["tenantId", input.tenantId]]),
      modelSettings: {
        temperature: 0.1,
        maxOutputTokens: 24000,
        maxRetries: 1,
      },
      abortSignal: controller.signal,
    } as any) as Promise<{ object: ReviewOutput | null; text: string; usage?: TokenUsage }>);

    if (!result.object) {
      childLogger.warn(
        { textLength: result.text?.length ?? 0 },
        "Attempt returned null output"
      );
      return null;
    }

    // Truncate summary if it exceeds schema max (16000 chars)
    // This prevents Haiku's verbosity from causing validation failures
    const MAX_SUMMARY_LENGTH = 16000;
    if (
      result.object.summary &&
      result.object.summary.length > MAX_SUMMARY_LENGTH
    ) {
      childLogger.warn(
        { originalLength: result.object.summary.length },
        "Truncating summary to fit schema max"
      );
      result.object.summary =
        result.object.summary.slice(0, MAX_SUMMARY_LENGTH - 3) + "...";
    }

    // Validate with Zod
    const parsed = ReviewOutputSchema.safeParse(result.object);
    if (!parsed.success) {
      childLogger.warn(
        { errors: parsed.error.issues.slice(0, 3) },
        "Attempt failed Zod validation"
      );
      return null;
    }

    // Record token usage (fire-and-forget)
    if (result.usage) {
      recordUsage({
        tenantId: input.tenantId,
        modelId,
        operation: "review-generation",
        usage: result.usage,
      });
    }

    return parsed.data;
  } catch (err: any) {
    if (controller.signal.aborted) {
      childLogger.warn("Attempt timed out (90s)");
    } else {
      childLogger.warn({ error: err.message }, "Attempt threw an error");
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
