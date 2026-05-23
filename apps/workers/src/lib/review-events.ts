/**
 * Review Event Publishing
 *
 * Publishes lifecycle events for design reviews. Consumed by:
 * - Dashboard (via events queue): real-time status updates, notifications
 * - Threat Model Agent (via threat-model-update queue): triggers model re-evaluation
 *
 * Events:
 * - "review.published"        - review auto-published (autonomous mode) or manually approved
 * - "review.pending_approval" - assisted review ready for human review
 * - "review.completed"        - generation finished (any mode) -> threat model queue
 * - "review.failed"           - all LLM attempts failed
 * - "finding.status_changed"  - developer resolved/dismissed/deferred a finding
 *
 * This is a utility module called by:
 * - review-generation worker (after routing)
 * - approval API endpoints (approve/reject)
 * - finding actions API (resolve/dismiss)
 */
import { eventsQueue, threatModelQueue } from "@loomii/queue";
import { logger } from "./logger";

// ─── Event Payload Types ──────────────────────────────────────────────────────

export interface ReviewPublishedEvent {
  tenantId: string;
  reviewId: string;
  contextBundleId: string;
  severity: string;
  confidence: number;
  findingCount: number;
  /** How the review was published: "autonomous" (auto) or "manual_approval" */
  publishedVia: "autonomous" | "manual_approval";
  /** Duration of generation in ms (only for autonomous) */
  durationMs?: number;
  /** Project association (null if review has no project) */
  projectId: string | null;
  projectName: string | null;
}

export interface ReviewPendingApprovalEvent {
  tenantId: string;
  reviewId: string;
  contextBundleId: string;
  severity: string;
  confidence: number;
  findingCount: number;
  /** Why it requires approval */
  reason: string;
}

export interface ReviewCompletedEvent {
  tenantId: string;
  reviewId: string;
  contextBundleId: string;
  severity: string;
  /** Routing mode used */
  mode: "AUTONOMOUS" | "ASSISTED";
  findingCount: number;
  /** Breakdown of findings by type */
  findingSummary: {
    threats: number;
    requirements: number;
    mitigations: number;
  };
  /** Project association (null if review has no project) */
  projectId: string | null;
  projectName: string | null;
}

export interface ReviewFailedEvent {
  tenantId: string;
  contextBundleId: string;
  /** Truncated error message */
  error: string;
  /** Duration until failure in ms */
  durationMs: number;
  /** Whether a review record exists (may have failed before creation) */
  reviewId?: string;
}

export interface FindingStatusChangedEvent {
  tenantId: string;
  reviewId: string;
  findingId: string;
  /** Previous status */
  previousStatus: string;
  /** New status */
  newStatus: string;
  /** User who changed the status */
  changedBy: string;
  /** Finding metadata for context */
  finding: {
    title: string;
    type: string;
    severity: string;
  };
}

// ─── Publishing Functions ─────────────────────────────────────────────────────

/**
 * Publish "review.published" event.
 *
 * Emitted when a review transitions to PUBLISHED status, either:
 * - Automatically (autonomous mode, confidence threshold met)
 * - Manually (human approves an assisted review)
 *
 * Consumed by: Dashboard (notification + status update)
 */
export async function publishReviewPublished(
  event: ReviewPublishedEvent
): Promise<void> {
  const childLogger = logger.child({
    module: "review-events",
    tenantId: event.tenantId,
    reviewId: event.reviewId,
  });

  await eventsQueue.add("review.published", {
    tenantId: event.tenantId,
    eventType: "review.published",
    data: {
      reviewId: event.reviewId,
      contextBundleId: event.contextBundleId,
      severity: event.severity,
      confidence: event.confidence,
      findingCount: event.findingCount,
      publishedVia: event.publishedVia,
      durationMs: event.durationMs ?? null,
      projectId: event.projectId,
      projectName: event.projectName,
    },
    timestamp: new Date().toISOString(),
  });

  childLogger.info(
    { publishedVia: event.publishedVia, severity: event.severity },
    "Published review.published event"
  );
}

/**
 * Publish "review.pending_approval" event.
 *
 * Emitted when an assisted review finishes generation and awaits human review.
 * Triggers notification to security leads.
 *
 * Consumed by: Dashboard (notification + queue display)
 */
export async function publishReviewPendingApproval(
  event: ReviewPendingApprovalEvent
): Promise<void> {
  const childLogger = logger.child({
    module: "review-events",
    tenantId: event.tenantId,
    reviewId: event.reviewId,
  });

  await eventsQueue.add("review.pending_approval", {
    tenantId: event.tenantId,
    eventType: "review.pending_approval",
    data: {
      reviewId: event.reviewId,
      contextBundleId: event.contextBundleId,
      severity: event.severity,
      confidence: event.confidence,
      findingCount: event.findingCount,
      reason: event.reason,
    },
    timestamp: new Date().toISOString(),
  });

  childLogger.info(
    { severity: event.severity, reason: event.reason },
    "Published review.pending_approval event"
  );
}

/**
 * Publish "review.completed" event.
 *
 * ALWAYS emitted when review generation finishes successfully, regardless of
 * routing mode (autonomous or assisted). The Threat Model Agent consumes this
 * to evaluate whether a threat model update is needed.
 *
 * Publishes to two queues independently (failure in one does not block the other):
 * - threat-model-update queue (Threat Model Agent)
 * - events queue (Dashboard)
 *
 * Consumed by: Threat Model Agent (via threat-model-update queue), Dashboard (via events queue)
 */
export async function publishReviewCompleted(
  event: ReviewCompletedEvent
): Promise<void> {
  const childLogger = logger.child({
    module: "review-events",
    tenantId: event.tenantId,
    reviewId: event.reviewId,
  });

  // Publish to both queues independently - failure in one shouldn't block the other
  const [tmResult, evResult] = await Promise.allSettled([
    threatModelQueue.add("review-completed", {
      tenantId: event.tenantId,
      changeType: "updated",
      designDocId: event.contextBundleId,
    }),
    eventsQueue.add("review.completed", {
      tenantId: event.tenantId,
      eventType: "review.completed",
      data: {
        reviewId: event.reviewId,
        contextBundleId: event.contextBundleId,
        severity: event.severity,
        mode: event.mode,
        findingCount: event.findingCount,
        findingSummary: event.findingSummary,
        projectId: event.projectId,
        projectName: event.projectName,
      },
      timestamp: new Date().toISOString(),
    }),
  ]);

  if (tmResult.status === "rejected") {
    childLogger.error(
      { error: (tmResult as PromiseRejectedResult).reason?.message },
      "Failed to publish review.completed to threat-model-update queue"
    );
  }

  if (evResult.status === "rejected") {
    childLogger.error(
      { error: (evResult as PromiseRejectedResult).reason?.message },
      "Failed to publish review.completed to events queue"
    );
  }

  // If either queue failed, throw so the caller knows the event was partially lost
  if (tmResult.status === "rejected" && evResult.status === "rejected") {
    throw new Error("Failed to publish review.completed to both queues");
  }

  childLogger.info(
    { mode: event.mode, findingCount: event.findingCount },
    "Published review.completed event"
  );
}

/**
 * Publish "review.failed" event.
 *
 * Emitted when all LLM generation attempts fail (primary + retry).
 * The review record is marked as ERROR.
 *
 * Consumed by: Dashboard (error display, potential alert)
 */
export async function publishReviewFailed(
  event: ReviewFailedEvent
): Promise<void> {
  const childLogger = logger.child({
    module: "review-events",
    tenantId: event.tenantId,
    contextBundleId: event.contextBundleId,
  });

  await eventsQueue.add("review.failed", {
    tenantId: event.tenantId,
    eventType: "review.failed",
    data: {
      reviewId: event.reviewId ?? null,
      contextBundleId: event.contextBundleId,
      error: event.error.slice(0, 500), // Cap error message length
      durationMs: event.durationMs,
    },
    timestamp: new Date().toISOString(),
  });

  childLogger.info(
    { durationMs: event.durationMs, hasReviewId: !!event.reviewId },
    "Published review.failed event"
  );
}

/**
 * Publish "finding.status_changed" event.
 *
 * Emitted when a developer or security lead changes a finding's status
 * (e.g., OPEN -> RESOLVED, OPEN -> DISMISSED, OPEN -> DEFERRED).
 *
 * Consumed by: Dashboard (real-time finding status updates)
 */
export async function publishFindingStatusChanged(
  event: FindingStatusChangedEvent
): Promise<void> {
  const childLogger = logger.child({
    module: "review-events",
    tenantId: event.tenantId,
    findingId: event.findingId,
  });

  await eventsQueue.add("finding.status_changed", {
    tenantId: event.tenantId,
    eventType: "finding.status_changed",
    data: {
      reviewId: event.reviewId,
      findingId: event.findingId,
      previousStatus: event.previousStatus,
      newStatus: event.newStatus,
      changedBy: event.changedBy,
      finding: event.finding,
    },
    timestamp: new Date().toISOString(),
  });

  childLogger.info(
    {
      previousStatus: event.previousStatus,
      newStatus: event.newStatus,
      findingTitle: event.finding.title,
    },
    "Published finding.status_changed event"
  );
}
