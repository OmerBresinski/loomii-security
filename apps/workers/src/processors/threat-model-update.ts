/**
 * Threat Model Update Processor
 *
 * BullMQ worker for the "threat-model-update" queue that handles incremental
 * updates triggered by completed design reviews.
 *
 * Flow:
 * 1. Determine if this is initial generation or incremental update
 * 2. For incremental: fetch the review that triggered the update
 * 3. Run deterministic trigger rules (no LLM)
 * 4. If triggered: invoke Mastra agent to identify changes
 * 5. Apply changes atomically
 * 6. Re-embed new threats, re-run gap analysis (non-critical)
 *
 * SLA: Update completes within 60 seconds.
 * Concurrency: 2 (configured in processors/index.ts)
 */
import type { Job } from "bullmq";
import { db } from "@loomii/db";
import { type ThreatModelUpdatePayload } from "@loomii/queue";
import {
  ThreatModelUpdateOutputSchema,
  type ThreatModelUpdateOutput,
} from "@loomii/shared/schemas";
import {
  threatModelAgent,
  threatModelTools,
} from "../agents/threat-model";
import { shouldUpdateModel } from "../lib/update-trigger-rules";
import { applyThreatModelUpdate } from "../lib/threat-model-updater";
import { embedThreats } from "../lib/threat-embeddings";
import { runGapAnalysis } from "../lib/gap-analysis";
import { logger } from "../lib/logger";

/** 60 second timeout for incremental updates */
const UPDATE_TIMEOUT_MS = 60 * 1000;

/**
 * Process incremental threat model updates triggered by completed reviews.
 *
 * This processor only handles incremental updates (changeType != "initial_generation").
 * Initial generation is handled by processThreatModelGeneration.
 */
export async function processThreatModelUpdate(
  job: Job<ThreatModelUpdatePayload>
): Promise<void> {
  const { tenantId, designDocId, changeType } = job.data;

  const childLogger = logger.child({
    queue: "threat-model-update",
    jobId: job.id,
    jobName: job.name,
    tenantId,
    changeType,
    designDocId,
  });

  // ─── 1. Verify threat model exists and is ACTIVE ──────────────────────
  const threatModel = await db.threatModel.findUnique({
    where: { tenantId },
    select: { id: true, status: true, version: true },
  });

  if (!threatModel || threatModel.status !== "ACTIVE") {
    childLogger.info(
      { status: threatModel?.status ?? "not_found" },
      "No active threat model for tenant, skipping incremental update"
    );
    return;
  }

  // ─── 2. Fetch the review that triggered this update ───────────────────
  if (!designDocId) {
    childLogger.warn("No designDocId in payload, cannot fetch review");
    return;
  }

  const review = await db.review.findFirst({
    where: {
      contextBundleId: designDocId,
      tenantId,
      status: { in: ["PUBLISHED", "IN_REVIEW"] },
    },
    select: {
      id: true,
      severity: true,
      summary: true,
      findings: {
        select: {
          type: true,
          strideCategory: true,
        },
      },
    },
  });

  if (!review) {
    childLogger.info(
      { contextBundleId: designDocId },
      "No published/in-review review found for context bundle, skipping"
    );
    return;
  }

  // ─── 3. Run deterministic trigger rules ───────────────────────────────
  const decision = shouldUpdateModel({
    severity: review.severity,
    summary: review.summary,
    findings: review.findings,
  });

  if (!decision.update) {
    childLogger.info(
      { reason: decision.reason, rule: decision.rule, reviewId: review.id },
      "Trigger rules: SKIP - no update needed"
    );
    return;
  }

  childLogger.info(
    { reason: decision.reason, rule: decision.rule, reviewId: review.id },
    "Trigger rules: UPDATE - invoking agent"
  );

  // ─── 4. Invoke Mastra agent for incremental update ────────────────────
  const startTime = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPDATE_TIMEOUT_MS);

  try {
    const updatePrompt = buildUpdatePrompt(review, threatModel.version);

    const result = await (threatModelAgent.generate(updatePrompt, {
      tools: threatModelTools,
      structuredOutput: {
        schema: ThreatModelUpdateOutputSchema,
      },
      maxSteps: 5,
      requestContext: new Map([["tenantId", tenantId]]),
      modelSettings: {
        temperature: 0.1,
        maxOutputTokens: 8000,
        maxRetries: 2,
      },
      abortSignal: controller.signal,
    } as any) as Promise<{ object: ThreatModelUpdateOutput | null; text: string }>);

    if (!result.object) {
      throw new Error("Agent returned null output for incremental update");
    }

    const updateOutput = result.object;

    // Check if there's actually anything to apply
    const hasChanges =
      updateOutput.newComponents.length > 0 ||
      updateOutput.newDataFlows.length > 0 ||
      updateOutput.newEntryPoints.length > 0 ||
      updateOutput.newThreats.length > 0 ||
      updateOutput.modifiedThreats.length > 0;

    if (!hasChanges) {
      childLogger.info("Agent determined no structural changes needed");
      return;
    }

    // ─── 5. Apply atomically ──────────────────────────────────────────────
    const updateResult = await applyThreatModelUpdate(
      threatModel.id,
      tenantId,
      updateOutput,
      review.id
    );

    const durationMs = Date.now() - startTime;
    childLogger.info(
      { ...updateResult, durationMs, reviewId: review.id },
      "Incremental threat model update completed"
    );

    // ─── 6. Post-update tasks (non-critical) ──────────────────────────────
    try {
      await embedThreats(tenantId, threatModel.id);
    } catch (err: any) {
      childLogger.warn(
        { error: err.message },
        "Threat re-embedding failed (non-critical)"
      );
    }

    try {
      await runGapAnalysis(threatModel.id);
    } catch (err: any) {
      childLogger.warn(
        { error: err.message },
        "Gap analysis failed (non-critical)"
      );
    }
  } catch (error: any) {
    const durationMs = Date.now() - startTime;

    if (controller.signal.aborted) {
      childLogger.error(
        { reviewId: review.id, durationMs },
        "Incremental update timed out (60s)"
      );
      // Throw so BullMQ retries - timeouts can be transient (Bedrock under load).
      // The model is safe because the $transaction was never executed or rolled back.
      throw new Error(`Incremental update timed out after ${UPDATE_TIMEOUT_MS}ms`);
    }

    childLogger.error(
      { error: error.message, stack: error.stack, reviewId: review.id, durationMs },
      "Incremental update failed"
    );
    // Re-throw for BullMQ retry (the model is safe - transaction rolled back)
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Prompt Builder ───────────────────────────────────────────────────────────

/**
 * Build the user prompt for the incremental update agent call.
 */
function buildUpdatePrompt(
  review: { id: string; severity: string | null; summary: string | null },
  currentVersion: number
): string {
  return `## Incremental Threat Model Update

A new design review has been completed that may require updates to the threat model (currently at version ${currentVersion}).

### Review Summary
${review.summary ?? "No summary available"}

### Review Severity: ${review.severity ?? "Unknown"}

### Instructions

1. Use the \`searchContext\` tool to gather details about the changes described in this review
2. Use the \`getCurrentModel\` tool to see the existing threat model structure
3. Identify what needs to be ADDED or MODIFIED:
   - New components (services, databases, etc.) not already in the model
   - New data flows between components
   - New entry points (APIs, webhooks, etc.)
   - New STRIDE threats introduced by these changes
   - Existing threats whose mitigation status should change

### Rules
- Only add entities that are genuinely NEW (not already in the model)
- Only modify threats when the review provides evidence of changed status
- Reference existing component/entry point names exactly as they appear in getCurrentModel
- Every new threat must be categorized using STRIDE
- Be conservative - only add what the evidence supports`;
}
