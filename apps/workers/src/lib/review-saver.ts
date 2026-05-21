/**
 * Review Saver
 *
 * Handles atomic persistence of design review generation results.
 * Wraps ALL writes in a Prisma $transaction so the review is either
 * fully saved or not at all.
 *
 * Flow:
 * 1. Create/update Review record (status: GENERATING -> final status)
 * 2. Create ReviewVersion (v1, editorType: "agent")
 * 3. Create all Findings
 * 4. Create FindingRelations (from relatedFindingIndices)
 * 5. Update Review with final status based on routing decision
 */
import { db } from "@loomii/db";
import type { ReviewOutput } from "@loomii/shared/schemas";
import type { RoutingDecision } from "./review-router";
import { logger } from "./logger";

export interface SaveReviewResult {
  reviewId: string;
  versionId: string;
  findingCount: number;
  relationCount: number;
}

export interface SaveReviewInput {
  /** Tenant ID */
  tenantId: string;
  /** Context bundle ID (unique constraint on Review) */
  contextBundleId: string;
  /** The validated agent output */
  reviewOutput: ReviewOutput;
  /** Routing decision (determines final status and mode) */
  routing: RoutingDecision;
  /** Model that produced the review */
  modelUsed: string;
}

/**
 * Atomically save a complete review: Review + ReviewVersion + Findings + FindingRelations.
 *
 * Uses Prisma $transaction for all-or-nothing persistence.
 * Invalid finding relation indices are skipped (logged) but don't fail the transaction.
 */
export async function saveReviewAtomically(
  input: SaveReviewInput
): Promise<SaveReviewResult> {
  const { tenantId, contextBundleId, reviewOutput, routing, modelUsed } = input;

  const childLogger = logger.child({
    module: "review-saver",
    tenantId,
    contextBundleId,
  });

  const result = await db.$transaction(async (tx) => {
    // ─── 1. Create or update Review record ────────────────────────────────
    const review = await tx.review.upsert({
      where: { contextBundleId },
      create: {
        tenantId,
        contextBundleId,
        status: routing.status,
        mode: routing.reviewMode,
        severity: reviewOutput.severity,
        confidence: reviewOutput.confidence / 100, // Convert 0-100 to 0-1 for DB
        summary: reviewOutput.summary,
        modelUsed,
        currentVersion: 1,
      },
      update: {
        status: routing.status,
        mode: routing.reviewMode,
        severity: reviewOutput.severity,
        confidence: reviewOutput.confidence / 100,
        summary: reviewOutput.summary,
        modelUsed,
        currentVersion: 1,
        errorMessage: null,
      },
    });

    childLogger.info({ reviewId: review.id }, "Review record saved");

    // ─── 1b. Clean up any orphaned data from prior failed attempts ────────
    // If re-processing after a crash, prior versions/findings may exist.
    // Delete them so we can cleanly create v1 without unique constraint issues.
    await tx.findingRelation.deleteMany({
      where: { fromFinding: { reviewId: review.id } },
    });
    await tx.finding.deleteMany({
      where: { reviewId: review.id },
    });
    await tx.reviewVersion.deleteMany({
      where: { reviewId: review.id },
    });

    // ─── 2. Create ReviewVersion (v1) ─────────────────────────────────────
    const version = await tx.reviewVersion.create({
      data: {
        reviewId: review.id,
        version: 1,
        content: reviewOutput as any, // Store full review output as JSON
        editorType: "agent",
        editorId: null,
        editReason: "Initial agent-generated review",
      },
    });

    childLogger.info({ versionId: version.id }, "ReviewVersion v1 created");

    // ─── 3. Create Findings ───────────────────────────────────────────────
    const findingIds: string[] = [];

    for (const finding of reviewOutput.findings) {
      const created = await tx.finding.create({
        data: {
          reviewId: review.id,
          type: finding.type,
          title: finding.title,
          description: finding.description,
          severity: finding.severity,
          confidence: finding.confidence / 100, // Convert 0-100 to 0-1 for DB
          strideCategory: finding.strideCategory ?? null,
          policyId: null, // We don't resolve policy ID here; could be enhanced later
          policyName: finding.policyReference,
          effortEstimate: finding.effortEstimate ?? null,
          status: "OPEN",
        },
      });
      findingIds.push(created.id);
    }

    childLogger.info({ count: findingIds.length }, "Findings saved");

    // ─── 4. Create FindingRelations ───────────────────────────────────────
    let relationCount = 0;

    for (let i = 0; i < reviewOutput.findings.length; i++) {
      const finding = reviewOutput.findings[i];
      const fromFindingId = findingIds[i];

      for (const relatedIndex of finding.relatedFindingIndices) {
        // Validate the related index is within bounds
        if (relatedIndex < 0 || relatedIndex >= findingIds.length) {
          childLogger.warn(
            { fromIndex: i, relatedIndex, total: findingIds.length },
            "Skipping out-of-bounds finding relation index"
          );
          continue;
        }

        // Don't create self-referencing relations
        if (relatedIndex === i) {
          continue;
        }

        const toFindingId = findingIds[relatedIndex];

        // Determine relation type based on finding types
        const fromType = reviewOutput.findings[i].type;
        const toType = reviewOutput.findings[relatedIndex].type;
        const relationType = inferRelationType(fromType, toType);

        try {
          await tx.findingRelation.create({
            data: {
              fromFindingId,
              toFindingId,
              relationType,
            },
          });
          relationCount++;
        } catch (err: any) {
          // Unique constraint violation (duplicate relation) - skip silently
          if (err.code === "P2002") {
            continue;
          }
          childLogger.warn(
            { fromIndex: i, relatedIndex, error: err.message },
            "Failed to create finding relation"
          );
        }
      }
    }

    childLogger.info({ count: relationCount }, "FindingRelations saved");

    return {
      reviewId: review.id,
      versionId: version.id,
      findingCount: findingIds.length,
      relationCount,
    };
  });

  childLogger.info(
    { ...result, status: routing.status, mode: routing.reviewMode },
    "Review saved atomically"
  );

  return result;
}

/**
 * Mark a review as failed with an error message.
 * Called when generation fails at any point after the Review record exists.
 */
export async function markReviewError(
  contextBundleId: string,
  tenantId: string,
  errorMessage: string
): Promise<void> {
  try {
    await db.review.upsert({
      where: { contextBundleId },
      create: {
        tenantId,
        contextBundleId,
        status: "ERROR",
        mode: "AUTOMATED",
        errorMessage: errorMessage.slice(0, 1000),
      },
      update: {
        status: "ERROR",
        errorMessage: errorMessage.slice(0, 1000),
      },
    });
  } catch (err: any) {
    logger.error(
      { contextBundleId, error: err.message },
      "Failed to mark review as error"
    );
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Infer the FindingRelation type based on the types of the two findings.
 */
function inferRelationType(
  fromType: string,
  toType: string
): "THREAT_TO_REQUIREMENT" | "REQUIREMENT_TO_MITIGATION" | "THREAT_TO_MITIGATION" | "RELATED" {
  if (fromType === "THREAT" && toType === "REQUIREMENT") {
    return "THREAT_TO_REQUIREMENT";
  }
  if (fromType === "REQUIREMENT" && toType === "MITIGATION") {
    return "REQUIREMENT_TO_MITIGATION";
  }
  if (fromType === "THREAT" && toType === "MITIGATION") {
    return "THREAT_TO_MITIGATION";
  }
  if (fromType === "MITIGATION" && toType === "THREAT") {
    return "THREAT_TO_MITIGATION";
  }
  if (fromType === "MITIGATION" && toType === "REQUIREMENT") {
    return "REQUIREMENT_TO_MITIGATION";
  }
  return "RELATED";
}
