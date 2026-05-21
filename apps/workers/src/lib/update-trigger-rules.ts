/**
 * Update Trigger Rules
 *
 * Deterministic (no LLM) rules that decide whether a completed design review
 * should trigger an incremental threat model update.
 *
 * Rules (evaluated in order, first match wins):
 * 1. STRIDE findings in review -> UPDATE
 * 2. Structural keywords in summary -> UPDATE
 * 3. Risk level = CRITICAL or HIGH -> UPDATE
 * 4. Otherwise -> SKIP
 *
 * SLA: Evaluation completes in <100ms (pure code, no I/O).
 */

export interface TriggerInput {
  /** Review severity level */
  severity: string | null;
  /** Review summary text */
  summary: string | null;
  /** Findings from the review */
  findings: Array<{
    type: string;
    strideCategory?: string | null;
  }>;
}

export interface TriggerDecision {
  /** Whether to update the threat model */
  update: boolean;
  /** Human-readable reason for the decision (for logging/audit) */
  reason: string;
  /** Which rule matched (for metrics) */
  rule: "stride_findings" | "structural_keywords" | "high_risk" | "no_match";
  /** Matched keyword (only for structural_keywords rule) */
  matchedKeyword?: string;
}

/**
 * Structural keywords that indicate architectural changes requiring threat model updates.
 * These are checked against the lowercased review summary.
 */
const STRUCTURAL_KEYWORDS = [
  "new service",
  "new endpoint",
  "new api",
  "new database",
  "data model change",
  "new queue",
  "new integration",
  "authentication change",
  "new webhook",
  "new microservice",
  "new lambda",
  "new storage",
  "new cache",
  "schema migration",
  "new third-party",
  "new external",
] as const;

/**
 * Risk levels that always trigger an update.
 */
const HIGH_RISK_LEVELS = ["CRITICAL", "HIGH"] as const;

/**
 * Evaluate whether a completed review should trigger a threat model update.
 *
 * This function is pure (no I/O, no LLM), deterministic, and fast (<1ms).
 * The rules are ordered by specificity - first match wins.
 *
 * @param review - The completed review data
 * @returns Decision with reason and matched rule
 */
export function shouldUpdateModel(review: TriggerInput): TriggerDecision {
  // Rule 1: STRIDE findings present
  const strideFindings = review.findings.filter(
    (f) => f.type === "THREAT" && f.strideCategory != null
  );
  if (strideFindings.length > 0) {
    return {
      update: true,
      reason: `${strideFindings.length} STRIDE finding(s) detected`,
      rule: "stride_findings",
    };
  }

  // Rule 2: Structural keywords in summary
  if (review.summary) {
    const lowerSummary = review.summary.toLowerCase();
    const matched = STRUCTURAL_KEYWORDS.find((kw) => lowerSummary.includes(kw));
    if (matched) {
      return {
        update: true,
        reason: `Structural keyword: "${matched}"`,
        rule: "structural_keywords",
        matchedKeyword: matched,
      };
    }
  }

  // Rule 3: High risk level
  if (
    review.severity &&
    HIGH_RISK_LEVELS.includes(review.severity as (typeof HIGH_RISK_LEVELS)[number])
  ) {
    return {
      update: true,
      reason: `Risk level: ${review.severity}`,
      rule: "high_risk",
    };
  }

  // No rules matched -> SKIP
  return {
    update: false,
    reason: "No structural changes, no STRIDE findings, risk level is low/medium",
    rule: "no_match",
  };
}
