/**
 * Review Generation Processor
 *
 * BullMQ worker for the "review-generation" queue. Invokes the Design Review
 * Mastra Agent to produce structured security reviews from context bundles.
 *
 * Flow:
 * 1. Duplicate check: skip if bundle already has an active review
 * 2. Create Review record in GENERATING state
 * 3. Invoke agent with context bundle content + risk level
 * 4. Validate structured output via Zod (with retry on failure)
 * 5. Route: autonomous (auto-publish) or assisted (hold for approval)
 * 6. Save Review + ReviewVersion + Findings + FindingRelations atomically
 * 7. Publish lifecycle events
 *
 * Concurrency: 3 (configured in processors/index.ts)
 * SLA: Review generation within 90 seconds for 90% of inputs.
 *
 * Error handling:
 * - Invalid LLM output: retry once with validation errors in prompt
 * - LLM timeout: abort after 90 seconds
 * - All failures: mark review as ERROR, publish failure event
 */
import type { Job } from "bullmq";
import { db } from "@loomii/db";
import { type ReviewGenerationPayload } from "@loomii/queue";
import { ReviewOutputSchema, type ReviewOutput } from "@loomii/shared/schemas";
import {
  designReviewAgent,
  designReviewTools,
  buildReviewPrompt,
} from "../agents/design-review";
import { routeReview, type RiskLevel } from "../lib/review-router";
import { saveReviewAtomically, markReviewError } from "../lib/review-saver";
import { eventsQueue } from "@loomii/queue";
import { logger } from "../lib/logger";
import { MODELS } from "../lib/bedrock";

/** Timeout for first attempt (allows room for retry if it fails) */
const FIRST_ATTEMPT_TIMEOUT_MS = 60 * 1000;

/** Timeout for retry attempt */
const RETRY_TIMEOUT_MS = 45 * 1000;

/** Model identifier recorded in the Review record */
const MODEL_USED = MODELS.CLAUDE_SONNET;

export async function processReviewGeneration(
  job: Job<ReviewGenerationPayload>
): Promise<void> {
  const { tenantId, contextId } = job.data;

  const childLogger = logger.child({
    queue: "review-generation",
    jobId: job.id,
    jobName: job.name,
    tenantId,
    contextId,
  });

  childLogger.info("Starting review generation");
  const startTime = Date.now();

  try {
    // ─── 1. Duplicate Prevention ────────────────────────────────────────────
    const existingReview = await db.review.findUnique({
      where: { contextBundleId: contextId },
      select: { id: true, status: true, updatedAt: true },
    });

    if (existingReview) {
      // Allow re-processing: ERROR state (explicit failure) or stale GENERATING
      // (worker crashed before completing). Stale = stuck for > 5 minutes.
      const isError = existingReview.status === "ERROR";
      const isStaleGenerating =
        existingReview.status === "GENERATING" &&
        Date.now() - new Date(existingReview.updatedAt).getTime() > 5 * 60 * 1000;

      if (!isError && !isStaleGenerating) {
        childLogger.info(
          { existingReviewId: existingReview.id, status: existingReview.status },
          "Bundle already has active review, skipping"
        );
        return;
      }

      if (isStaleGenerating) {
        childLogger.warn(
          { existingReviewId: existingReview.id },
          "Found stale GENERATING review (>5min), re-processing"
        );
      }
    }

    // ─── 2. Fetch context bundle ────────────────────────────────────────────
    const contextBundle = await db.contextBundle.findUnique({
      where: { id: contextId },
      select: {
        id: true,
        title: true,
        content: true,
        riskLevel: true,
        tenantId: true,
      },
    });

    if (!contextBundle) {
      throw new Error(`Context bundle not found: ${contextId}`);
    }

    if (!contextBundle.content) {
      throw new Error(`Context bundle has no content: ${contextId}`);
    }

    const riskLevel = (contextBundle.riskLevel ?? "MEDIUM") as RiskLevel;
    const bundleContent =
      typeof contextBundle.content === "string"
        ? contextBundle.content
        : JSON.stringify(contextBundle.content, null, 2);

    // ─── 3. Mark as GENERATING ──────────────────────────────────────────────
    await db.review.upsert({
      where: { contextBundleId: contextId },
      create: {
        tenantId,
        contextBundleId: contextId,
        status: "GENERATING",
        mode: "AUTOMATED",
      },
      update: {
        status: "GENERATING",
        errorMessage: null,
      },
    });

    // ─── 4. Generate review via agent ───────────────────────────────────────
    childLogger.info({ riskLevel }, "Invoking design review agent");

    const reviewOutput = await generateReviewWithRetry(
      tenantId,
      bundleContent,
      riskLevel,
      contextBundle.title,
      childLogger
    );

    // ─── 5. Route the review ────────────────────────────────────────────────
    const routing = routeReview(riskLevel, reviewOutput.confidence);
    childLogger.info(
      { mode: routing.mode, status: routing.status, reason: routing.reason },
      "Review routed"
    );

    // ─── 6. Save atomically ─────────────────────────────────────────────────
    const saveResult = await saveReviewAtomically({
      tenantId,
      contextBundleId: contextId,
      reviewOutput,
      routing,
      modelUsed: MODEL_USED,
    });

    // ─── 7. Publish events ──────────────────────────────────────────────────
    const durationMs = Date.now() - startTime;

    try {
      const eventType =
        routing.mode === "AUTONOMOUS"
          ? "review.published"
          : "review.pending_approval";

      await eventsQueue.add(eventType, {
        tenantId,
        eventType,
        data: {
          reviewId: saveResult.reviewId,
          contextBundleId: contextId,
          severity: reviewOutput.severity,
          confidence: reviewOutput.confidence,
          mode: routing.mode,
          findingCount: saveResult.findingCount,
          durationMs,
        },
        timestamp: new Date().toISOString(),
      });

      // Always publish review.completed event (consumed by Threat Model Agent)
      await eventsQueue.add("review.completed", {
        tenantId,
        eventType: "review.completed",
        data: {
          reviewId: saveResult.reviewId,
          contextBundleId: contextId,
          severity: reviewOutput.severity,
          mode: routing.mode,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      childLogger.warn(
        { error: err.message },
        "Event publishing failed (non-critical, review already saved)"
      );
    }

    childLogger.info(
      {
        reviewId: saveResult.reviewId,
        findingCount: saveResult.findingCount,
        relationCount: saveResult.relationCount,
        mode: routing.mode,
        status: routing.status,
        durationMs,
      },
      "Review generation completed successfully"
    );
  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    childLogger.error(
      { error: error.message, stack: error.stack, durationMs },
      "Review generation failed"
    );

    // Mark the review as failed
    await markReviewError(contextId, tenantId, error.message ?? "Unknown error");

    // Publish failure event (non-critical)
    try {
      await eventsQueue.add("review.failed", {
        tenantId,
        eventType: "review.failed",
        data: {
          contextBundleId: contextId,
          error: error.message?.slice(0, 500) ?? "Unknown error",
          durationMs,
        },
        timestamp: new Date().toISOString(),
      });
    } catch {
      // Swallow event publishing errors
    }

    throw error; // Re-throw so BullMQ marks the job as failed (enables retry)
  }
}

// ─── Agent Invocation with Retry ──────────────────────────────────────────────

/**
 * Invoke the design review agent with structured output.
 * On validation failure, retries once with the validation errors included in the prompt.
 * Uses separate timeouts for each attempt to avoid the first attempt starving the retry.
 */
async function generateReviewWithRetry(
  tenantId: string,
  bundleContent: string,
  riskLevel: string,
  bundleTitle: string | null | undefined,
  childLogger: typeof logger
): Promise<ReviewOutput> {
  // First attempt with its own timeout
  const firstController = new AbortController();
  const firstTimeout = setTimeout(() => firstController.abort(), FIRST_ATTEMPT_TIMEOUT_MS);

  try {
    const prompt = buildReviewPrompt(bundleContent, riskLevel, bundleTitle);

    const result = await (designReviewAgent.generate(prompt, {
      tools: designReviewTools,
      structuredOutput: {
        schema: ReviewOutputSchema,
      },
      maxSteps: 5,
      requestContext: new Map([["tenantId", tenantId]]),
      modelSettings: {
        temperature: 0.1,
        maxOutputTokens: 16000,
        maxRetries: 1,
      },
      abortSignal: firstController.signal,
    } as any) as Promise<{ object: ReviewOutput | null; text: string }>);

    if (result.object) {
      // Validate with Zod (belt-and-suspenders since structuredOutput should handle this)
      const parsed = ReviewOutputSchema.safeParse(result.object);
      if (parsed.success) {
        childLogger.info("First attempt produced valid output");
        return parsed.data;
      }

      // Structured output returned something but it failed Zod validation
      childLogger.warn(
        { errors: parsed.error.issues },
        "First attempt failed Zod validation, retrying with error feedback"
      );
      return await retryWithErrors(
        tenantId,
        bundleContent,
        riskLevel,
        bundleTitle,
        parsed.error.issues,
        childLogger
      );
    }

    // Null output (fallback triggered)
    childLogger.warn("First attempt returned null output, retrying");
    return await retryWithErrors(
      tenantId,
      bundleContent,
      riskLevel,
      bundleTitle,
      [{ message: "Output was null/empty. Please generate a complete review.", path: [], code: "custom" }],
      childLogger
    );
  } finally {
    clearTimeout(firstTimeout);
  }
}

/**
 * Retry generation with validation errors included in the prompt.
 * This gives the LLM explicit feedback about what went wrong.
 * Uses its own AbortController with a separate timeout.
 */
async function retryWithErrors(
  tenantId: string,
  bundleContent: string,
  riskLevel: string,
  bundleTitle: string | null | undefined,
  errors: Array<{ message: string; path: (string | number)[]; code: string }>,
  childLogger: typeof logger
): Promise<ReviewOutput> {
  const retryController = new AbortController();
  const retryTimeout = setTimeout(() => retryController.abort(), RETRY_TIMEOUT_MS);

  try {
    const errorFeedback = errors
      .map((e) => `- Path: ${e.path.join(".")}, Error: ${e.message}`)
      .join("\n");

    const retryPrompt = `${buildReviewPrompt(bundleContent, riskLevel, bundleTitle)}

## IMPORTANT: Previous Generation Failed Validation

Your previous output had the following validation errors:
${errorFeedback}

Please correct these issues in your output. Ensure:
- summary is 10-500 characters
- confidence is 0-100
- severity is one of: CRITICAL, HIGH, MEDIUM, LOW
- every finding has a policyReference (use exact policy name from searchPolicies results)
- every finding has a description of at least 20 characters
- every THREAT finding should have a strideCategory
- findings array must contain at least 1 item`;

    const result = await (designReviewAgent.generate(retryPrompt, {
      tools: designReviewTools,
      structuredOutput: {
        schema: ReviewOutputSchema,
      },
      maxSteps: 5,
      requestContext: new Map([["tenantId", tenantId]]),
      modelSettings: {
        temperature: 0.05, // Lower temperature for retry
        maxOutputTokens: 16000,
        maxRetries: 1,
      },
      abortSignal: retryController.signal,
    } as any) as Promise<{ object: ReviewOutput | null; text: string }>);

    if (!result.object) {
      throw new Error("Review generation failed: agent returned null output on retry");
    }

    const parsed = ReviewOutputSchema.safeParse(result.object);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`Review generation failed: validation failed on retry - ${issues}`);
    }

    childLogger.info("Retry attempt produced valid output");
    return parsed.data;
  } finally {
    clearTimeout(retryTimeout);
  }
}
