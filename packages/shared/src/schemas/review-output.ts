/**
 * Review Output Schema
 *
 * Defines the structured output shape that the Design Review Agent must produce.
 * Used with Mastra's `.generate()` method via `structuredOutput: { schema }`.
 *
 * The agent generates this structured review which is then:
 * 1. Validated by Zod (with retry on failure)
 * 2. Saved as Review + ReviewVersion + Findings + FindingRelations
 * 3. Routed to autonomous (auto-publish) or assisted (hold for approval) mode
 */
import { z } from "zod";

// ─── Finding Schema ──────────────────────────────────────────────────────────

export const FINDING_TYPES = ["THREAT", "REQUIREMENT", "MITIGATION"] as const;

export const REVIEW_SEVERITY_LEVELS = [
  "CRITICAL",
  "HIGH",
  "MEDIUM",
  "LOW",
] as const;

export const REVIEW_STRIDE_CATEGORIES = [
  "SPOOFING",
  "TAMPERING",
  "REPUDIATION",
  "INFORMATION_DISCLOSURE",
  "DENIAL_OF_SERVICE",
  "ELEVATION_OF_PRIVILEGE",
] as const;

export const EFFORT_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

export const ReviewFindingSchema = z.object({
  /** Type of finding: threat, requirement, or mitigation */
  type: z.enum(FINDING_TYPES),

  /** Concise title summarizing the finding */
  title: z.string().min(5).max(200),

  /** Detailed description explaining the finding with specifics from the context */
  description: z.string().min(20),

  /** Severity of this specific finding */
  severity: z.enum(REVIEW_SEVERITY_LEVELS),

  /** Confidence in this finding (0-100) */
  confidence: z.number().min(0).max(100),

  /** STRIDE category (required for THREAT findings) */
  strideCategory: z.enum(REVIEW_STRIDE_CATEGORIES).optional(),

  /** Referenced policy name (must match a policy returned by searchPolicies) */
  policyReference: z.string().min(1),

  /** Estimated effort to address (for MITIGATION findings) */
  effortEstimate: z.enum(EFFORT_LEVELS).optional(),

  /** Indices of related findings in this array (for building FindingRelations) */
  relatedFindingIndices: z.array(z.number()).default([]),
});

export type ReviewFinding = z.infer<typeof ReviewFindingSchema>;

// ─── Review Output Schema ────────────────────────────────────────────────────

export const ReviewOutputSchema = z.object({
  /** Executive summary of the security review (markdown) */
  summary: z.string().min(10).max(8000),

  /**
   * Whether this change has security implications.
   * Note: This field is stored in ReviewVersion.content (JSON) but is NOT a
   * standalone column on the Review model. If querying by this field becomes
   * necessary, a migration to add it as a column would be needed.
   */
  hasSecurityImplications: z.boolean(),

  /** Overall severity of the most critical finding */
  severity: z.enum(REVIEW_SEVERITY_LEVELS),

  /** Overall confidence in this review (0-100) */
  confidence: z.number().min(0).max(100),

  /** All findings: threats, requirements, and mitigations */
  findings: z.array(ReviewFindingSchema).min(1),
});

export type ReviewOutput = z.infer<typeof ReviewOutputSchema>;
