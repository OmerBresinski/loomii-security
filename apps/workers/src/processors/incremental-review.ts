/**
 * Incremental Review Processor
 *
 * BullMQ processor for the "incremental-review" queue. When a source document
 * is updated and already has an existing review, this processor:
 *
 * 1. Loads the existing review + non-dismissed findings
 * 2. Invokes the incremental review agent with old/new content + findings
 * 3. Applies the patch: removes stale findings, adds new ones
 * 4. Handles confirmed finding auto-resolution with notifications
 *
 * Key invariants:
 * - Dismissed findings are NEVER sent to the LLM and NEVER touched
 * - Confirmed findings are auto-resolved (DISMISSED + ALREADY_MITIGATED + notify)
 * - Untriaged findings (status=null) are simply deleted
 * - If LLM fails, review state is never corrupted
 * - review.updatedAt is always bumped (even on no-op)
 */
import type { Job } from "bullmq";
import { db } from "@loomii/db";
import type { IncrementalReviewPayload } from "@loomii/queue";
import { IncrementalReviewOutputSchema } from "@loomii/shared/schemas";
import type { IncrementalReviewOutput } from "@loomii/shared/schemas";
import {
  incrementalReviewAgent,
  buildIncrementalReviewPrompt,
} from "../agents/incremental-review";
import { logger } from "../lib/logger";
import type { Logger } from "pino";
import { recordUsage, type TokenUsage } from "../lib/ai-usage";
import { MODELS } from "../lib/bedrock";

/** Timeout for the LLM call (90 seconds) */
const AGENT_TIMEOUT_MS = 90 * 1000;

export async function processIncrementalReview(
  job: Job<IncrementalReviewPayload>
): Promise<void> {
  const { tenantId, contextBundleId, reviewId, previousContent, newContent } =
    job.data;

  const childLogger = logger.child({
    queue: "incremental-review",
    jobId: job.id,
    jobName: job.name,
    tenantId,
    reviewId,
    contextBundleId,
  });

  childLogger.info("Starting incremental review processing");
  const startTime = Date.now();

  // ─── 1. Load existing review + non-dismissed findings ───────────────────
  const review = await db.review.findUnique({
    where: { id: reviewId },
    select: {
      id: true,
      status: true,
      contextBundle: {
        select: { projectId: true },
      },
      findings: {
        where: { status: { not: "DISMISSED" } },
        select: {
          id: true,
          type: true,
          title: true,
          description: true,
          severity: true,
          status: true,
          confirmedBy: true,
        },
      },
    },
  });

  if (!review) {
    childLogger.warn("Review not found, skipping");
    return;
  }

  // ─── 2. Guard: skip if review is in GENERATING state ────────────────────
  if (review.status === "GENERATING") {
    childLogger.info(
      "Review is still in GENERATING state, skipping incremental update"
    );
    return;
  }

  const projectId = review.contextBundle?.projectId ?? null;
  const existingFindings = review.findings;

  childLogger.info(
    { findingsCount: existingFindings.length, reviewStatus: review.status },
    "Loaded review context"
  );

  // ─── 3. Invoke agent + apply patch (always bump updatedAt) ──────────────
  // The try/finally enforces the "always bump updatedAt" invariant in one place.
  try {
    const output = await invokeAgent({
      previousContent,
      newContent,
      existingFindings,
      childLogger,
      tenantId,
    });

    if (!output) return; // Agent returned null or failed validation (logged inside)

    await applyPatch({
      output,
      existingFindings,
      reviewId,
      tenantId,
      projectId,
      childLogger,
    });

    const durationMs = Date.now() - startTime;
    childLogger.info(
      {
        durationMs,
        removedCount: output.remove.length,
        addedCount: output.add.length,
      },
      "Incremental review completed"
    );
  } finally {
    // Invariant: always bump updatedAt regardless of success/failure/early-return
    await db.review.update({
      where: { id: reviewId },
      data: { updatedAt: new Date() },
    });
  }
}

// ─── Agent Invocation ─────────────────────────────────────────────────────────

async function invokeAgent({
  previousContent,
  newContent,
  existingFindings,
  childLogger,
  tenantId,
}: {
  previousContent: Record<string, unknown>;
  newContent: Record<string, unknown>;
  existingFindings: Array<{
    id: string;
    type: string;
    title: string;
    description: string | null;
    severity: string;
  }>;
  childLogger: Logger;
  tenantId: string;
}): Promise<IncrementalReviewOutput | null> {
  const previousContentStr =
    typeof previousContent === "string"
      ? previousContent
      : JSON.stringify(previousContent, null, 2);
  const newContentStr =
    typeof newContent === "string"
      ? newContent
      : JSON.stringify(newContent, null, 2);

  const prompt = buildIncrementalReviewPrompt({
    previousContent: previousContentStr,
    newContent: newContentStr,
    existingFindings: existingFindings.map((f) => ({
      id: f.id,
      type: f.type,
      title: f.title,
      description: f.description ?? "",
      severity: f.severity,
    })),
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AGENT_TIMEOUT_MS);

  try {
    const result = (await (incrementalReviewAgent.generate as Function)(prompt, {
      maxSteps: 1,
      modelSettings: {
        temperature: 0.1,
        maxOutputTokens: 8000,
        maxRetries: 1,
      },
      abortSignal: controller.signal,
      structuredOutput: {
        schema: IncrementalReviewOutputSchema,
      },
    })) as { object: unknown; text: string; usage?: TokenUsage };

    if (!result.object) {
      childLogger.warn(
        { textLength: result.text?.length ?? 0 },
        "Agent returned null structured output"
      );
      return null;
    }

    const parsed = IncrementalReviewOutputSchema.safeParse(result.object);
    if (!parsed.success) {
      childLogger.warn(
        { errors: parsed.error.issues.slice(0, 5) },
        "Agent output failed Zod validation"
      );
      return null;
    }

    // Record AI usage (fire-and-forget)
    if (result.usage) {
      recordUsage({
        tenantId,
        modelId: MODELS.CLAUDE_SONNET,
        operation: "incremental-review",
        usage: result.usage,
      });
    }

    return parsed.data;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Patch Application ────────────────────────────────────────────────────────

async function applyPatch({
  output,
  existingFindings,
  reviewId,
  tenantId,
  projectId,
  childLogger,
}: {
  output: IncrementalReviewOutput;
  existingFindings: Array<{
    id: string;
    status: string | null;
    title: string;
    confirmedBy: string | null;
  }>;
  reviewId: string;
  tenantId: string;
  projectId: string | null;
  childLogger: Logger;
}): Promise<void> {
  // ─── Removals ─────────────────────────────────────────────────────────────
  for (const removal of output.remove) {
    const finding = existingFindings.find((f) => f.id === removal.findingId);
    if (!finding) {
      childLogger.warn(
        { findingId: removal.findingId },
        "LLM referenced non-existent findingId, skipping"
      );
      continue;
    }

    if (finding.status === "CONFIRMED") {
      // Auto-resolve: preserve audit trail
      await db.finding.update({
        where: { id: finding.id },
        data: {
          status: "DISMISSED",
          dismissalReason: "ALREADY_MITIGATED",
          dismissedBy: "system",
          dismissedAt: new Date(),
        },
      });

      // Notify the confirmer
      if (finding.confirmedBy) {
        await db.notification
          .create({
            data: {
              userId: finding.confirmedBy,
              tenantId,
              type: "finding_auto_resolved",
              title: "Confirmed finding auto-resolved",
              body: `"${finding.title}" was auto-resolved: ${removal.reason}`,
              linkUrl: projectId ? `/projects/${projectId}` : null,
              projectId,
            },
          })
          .catch((err) => {
            childLogger.debug(
              { error: err.message },
              "Notification create failed (likely dedup)"
            );
          });
      }
    } else {
      // Untriaged (status=null) — safe to delete
      await db.finding.delete({ where: { id: finding.id } });
    }
  }

  // ─── Additions ────────────────────────────────────────────────────────────
  if (output.add.length > 0) {
    await db.finding.createMany({
      data: output.add.map((f) => ({
        reviewId,
        type: f.type,
        title: f.title,
        description: f.description,
        severity: f.severity,
        confidence: f.confidence / 100, // Schema uses 0-100, DB uses 0-1
        strideCategory: f.strideCategory ?? null,
        effortEstimate: f.effortEstimate ?? null,
        policyName: f.policyReference ?? null,
        status: null, // new findings start untriaged
      })),
    });
  }
}
