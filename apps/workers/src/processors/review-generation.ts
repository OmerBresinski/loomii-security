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
import { saveReviewAtomically, markReviewError } from "../lib/review-saver";
import {
  publishReviewReady,
  publishReviewCompleted,
  publishReviewFailed,
} from "../lib/review-events";
import { generateWithFallback } from "../lib/fallback-handler";
import { logger } from "../lib/logger";

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

      // Also allow re-processing if the context bundle was updated after
      // the existing review was created (source content has changed)
      const bundleUpdatedAt = await db.contextBundle.findUnique({
        where: { id: contextId },
        select: { updatedAt: true },
      });
      const isStaleContent =
        bundleUpdatedAt &&
        new Date(bundleUpdatedAt.updatedAt).getTime() >
          new Date(existingReview.updatedAt).getTime();

      if (!isError && !isStaleGenerating && !isStaleContent) {
        childLogger.info(
          { existingReviewId: existingReview.id, status: existingReview.status },
          "Bundle already has active review, skipping"
        );
        return;
      }

      if (isStaleContent) {
        childLogger.info(
          { existingReviewId: existingReview.id },
          "Source content updated since last review, re-generating"
        );
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

    const riskLevel = (contextBundle.riskLevel ?? "MEDIUM") as string;
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
      },
      update: {
        status: "GENERATING",
        errorMessage: null,
      },
    });

    // ─── 4. Generate review via agent (with full fallback sequence) ────────
    childLogger.info({ riskLevel }, "Invoking design review agent with fallback");

    const fallbackResult = await generateWithFallback({
      tenantId,
      bundleContent,
      riskLevel,
      bundleTitle: contextBundle.title,
    });

    const reviewOutput = fallbackResult.output;
    const modelUsed = fallbackResult.modelUsed;

    if (fallbackResult.usedFallback) {
      childLogger.warn(
        { attemptNumber: fallbackResult.attemptNumber, modelUsed },
        "Primary agent failed, review generated by fallback model"
      );
    } else if (fallbackResult.attemptNumber > 1) {
      childLogger.info(
        { attemptNumber: fallbackResult.attemptNumber },
        "Primary agent succeeded on retry"
      );
    }

    // ─── 5. Save as READY (all reviews require human triage) ─────────────
    const saveResult = await saveReviewAtomically({
      tenantId,
      contextBundleId: contextId,
      reviewOutput,
      riskLevel,
      modelUsed,
    });

    // ─── 6. Publish events ──────────────────────────────────────────────────
    const durationMs = Date.now() - startTime;

    // Count findings by type for the completed event
    const findingSummary = {
      threats: reviewOutput.findings.filter((f) => f.type === "THREAT").length,
      requirements: reviewOutput.findings.filter((f) => f.type === "REQUIREMENT").length,
      mitigations: reviewOutput.findings.filter((f) => f.type === "MITIGATION").length,
    };

    // Resolve project context for notification enrichment
    const bundle = await db.contextBundle.findUnique({
      where: { id: contextId },
      select: { projectId: true, project: { select: { name: true } } },
    });
    const projectId = bundle?.projectId ?? null;
    const projectName = bundle?.project?.name ?? null;

    // 6a. Publish review.ready event (notifies security engineer)
    try {
      await publishReviewReady({
        tenantId,
        reviewId: saveResult.reviewId,
        contextBundleId: contextId,
        severity: reviewOutput.severity,
        confidence: reviewOutput.confidence,
        riskLevel,
        findingCount: saveResult.findingCount,
        projectId,
        projectName,
      });
    } catch (err: any) {
      childLogger.warn(
        { error: err.message },
        "review.ready event publishing failed (non-critical, review already saved)"
      );
    }

    // 6b. Publish review.completed (Threat Model Agent depends on this)
    try {
      await publishReviewCompleted({
        tenantId,
        reviewId: saveResult.reviewId,
        contextBundleId: contextId,
        severity: reviewOutput.severity,
        mode: "ASSISTED", // All reviews now go through human triage
        findingCount: saveResult.findingCount,
        findingSummary,
        projectId,
        projectName,
      });
    } catch (err: any) {
      childLogger.error(
        { error: err.message, reviewId: saveResult.reviewId },
        "review.completed event publishing failed - Threat Model Agent may not re-evaluate"
      );
    }

    childLogger.info(
      {
        reviewId: saveResult.reviewId,
        findingCount: saveResult.findingCount,
        relationCount: saveResult.relationCount,
        status: "READY",
        riskLevel,
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
      await publishReviewFailed({
        tenantId,
        contextBundleId: contextId,
        error: error.message ?? "Unknown error",
        durationMs,
      });
    } catch {
      // Swallow event publishing errors
    }

    throw error; // Re-throw so BullMQ marks the job as failed (enables retry)
  }
}
