/**
 * Review Router
 *
 * Determines whether a completed review should be routed to:
 * - AUTONOMOUS mode (auto-publish): medium/low risk + confidence >= 60
 * - ASSISTED mode (hold for approval): critical/high risk OR confidence < 60
 *
 * Routing rules (from TDD):
 * - CRITICAL risk -> ASSISTED (status: IN_REVIEW, mode: MANUAL)
 * - HIGH risk -> ASSISTED (status: IN_REVIEW, mode: MANUAL)
 * - MEDIUM risk + confidence >= 60 -> AUTONOMOUS (status: PUBLISHED, mode: AUTOMATED)
 * - MEDIUM risk + confidence < 60 -> ASSISTED (status: IN_REVIEW, mode: MANUAL)
 * - LOW risk + confidence >= 60 -> AUTONOMOUS (status: PUBLISHED, mode: AUTOMATED)
 * - LOW risk + confidence < 60 -> ASSISTED (status: IN_REVIEW, mode: MANUAL)
 *
 * These map to the Prisma enums:
 * - AUTONOMOUS = ReviewMode.AUTOMATED + ReviewStatus.PUBLISHED
 * - ASSISTED = ReviewMode.MANUAL + ReviewStatus.IN_REVIEW
 */

export type RiskLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export type RoutingMode = "AUTONOMOUS" | "ASSISTED";

export interface RoutingDecision {
  /** High-level routing mode */
  mode: RoutingMode;
  /** Prisma ReviewStatus to set */
  status: "PUBLISHED" | "IN_REVIEW";
  /** Prisma ReviewMode to set */
  reviewMode: "AUTOMATED" | "MANUAL";
  /** Reason for routing decision (for logging/audit) */
  reason: string;
}

/** Confidence threshold for autonomous publishing */
const CONFIDENCE_THRESHOLD = 60;

/**
 * Determine the routing decision for a review based on risk level and confidence.
 *
 * @param riskLevel - The risk classification of the context bundle
 * @param confidence - The agent's confidence score (0-100)
 * @returns Routing decision with status, mode, and reason
 */
export function routeReview(
  riskLevel: RiskLevel,
  confidence: number
): RoutingDecision {
  // Critical and High always go to assisted mode regardless of confidence
  if (riskLevel === "CRITICAL") {
    return {
      mode: "ASSISTED",
      status: "IN_REVIEW",
      reviewMode: "MANUAL",
      reason: "Critical risk level requires human approval",
    };
  }

  if (riskLevel === "HIGH") {
    return {
      mode: "ASSISTED",
      status: "IN_REVIEW",
      reviewMode: "MANUAL",
      reason: "High risk level requires human approval",
    };
  }

  // Medium and Low: autonomous only if confidence is sufficient
  if (confidence >= CONFIDENCE_THRESHOLD) {
    return {
      mode: "AUTONOMOUS",
      status: "PUBLISHED",
      reviewMode: "AUTOMATED",
      reason: `${riskLevel} risk with sufficient confidence (${confidence} >= ${CONFIDENCE_THRESHOLD})`,
    };
  }

  // Low confidence: assisted regardless of risk
  return {
    mode: "ASSISTED",
    status: "IN_REVIEW",
    reviewMode: "MANUAL",
    reason: `Confidence below threshold (${confidence} < ${CONFIDENCE_THRESHOLD})`,
  };
}
