/**
 * Gap Analysis
 *
 * Pure SQL/Prisma-based coverage gap analysis for threat models.
 * No LLM involvement - purely deterministic queries against relational tables.
 *
 * Detects 6 gap types:
 * 1. unmitigated_critical_threat - CRITICAL threat with mitigationStatus=UNMITIGATED
 * 2. unmitigated_high_threat - HIGH threat with mitigationStatus=UNMITIGATED
 * 3. unknown_encryption_sensitive_flow - CONFIDENTIAL/RESTRICTED flow with unknown/null encryption
 * 4. no_auth_api_entry_point - API entry point with authRequired=false
 * 5. no_rate_limit_public_endpoint - Entry point with rateLimited=false
 * 6. component_zero_threats - Active component with no threats mapped
 *
 * Auto-resolution: re-evaluates all unresolved gaps and marks them resolved
 * when the underlying condition no longer holds.
 *
 * SLA: Completes within 10 seconds.
 * Idempotent: safe to run multiple times.
 */
import { db } from "@loomii/db";
import { logger } from "./logger";

// ─── Gap Type Definitions ─────────────────────────────────────────────────────

export const GAP_TYPES = {
  UNMITIGATED_CRITICAL_THREAT: "unmitigated_critical_threat",
  UNMITIGATED_HIGH_THREAT: "unmitigated_high_threat",
  UNKNOWN_ENCRYPTION_SENSITIVE_FLOW: "unknown_encryption_sensitive_flow",
  NO_AUTH_API_ENTRY_POINT: "no_auth_api_entry_point",
  NO_RATE_LIMIT_PUBLIC_ENDPOINT: "no_rate_limit_public_endpoint",
  COMPONENT_ZERO_THREATS: "component_zero_threats",
} as const;

export type GapType = (typeof GAP_TYPES)[keyof typeof GAP_TYPES];

/** Severity mapping per gap type */
const GAP_SEVERITY: Record<GapType, "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"> = {
  [GAP_TYPES.UNMITIGATED_CRITICAL_THREAT]: "CRITICAL",
  [GAP_TYPES.UNMITIGATED_HIGH_THREAT]: "HIGH",
  [GAP_TYPES.UNKNOWN_ENCRYPTION_SENSITIVE_FLOW]: "HIGH",
  [GAP_TYPES.NO_AUTH_API_ENTRY_POINT]: "HIGH",
  [GAP_TYPES.NO_RATE_LIMIT_PUBLIC_ENDPOINT]: "MEDIUM",
  [GAP_TYPES.COMPONENT_ZERO_THREATS]: "LOW",
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface DetectedGap {
  type: GapType;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  description: string;
  entityType: string;
  entityId: string;
}

export interface GapAnalysisResult {
  created: number;
  resolved: number;
  total: number;
  durationMs: number;
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

/**
 * Run gap analysis for a threat model.
 *
 * 1. Detect all current gaps via Prisma queries
 * 2. Auto-resolve gaps whose conditions no longer hold
 * 3. Create new gaps that don't already exist
 *
 * Idempotent: running twice produces the same result.
 * SLA: completes within 10 seconds.
 */
export async function runGapAnalysis(
  threatModelId: string
): Promise<GapAnalysisResult> {
  const childLogger = logger.child({
    module: "gap-analysis",
    threatModelId,
  });

  const startTime = Date.now();

  // 1. Detect all current gaps from DB state
  const detectedGaps = await detectAllGaps(threatModelId);

  childLogger.info(
    { detected: detectedGaps.length },
    "Gap detection complete"
  );

  // Fetch unresolved gaps once (used by both resolve and create steps)
  const unresolvedGaps = await db.tmGap.findMany({
    where: { threatModelId, isResolved: false },
    select: { id: true, type: true, entityId: true },
  });

  // 2. Auto-resolve gaps whose conditions no longer hold
  const resolved = await autoResolveGaps(unresolvedGaps, detectedGaps);

  // 3. Create new gaps (skip if already exists and unresolved)
  const created = await createNewGaps(threatModelId, unresolvedGaps, detectedGaps);

  // 4. Count total unresolved
  const total = await db.tmGap.count({
    where: { threatModelId, isResolved: false },
  });

  const durationMs = Date.now() - startTime;

  childLogger.info(
    { created, resolved, total, durationMs },
    "Gap analysis complete"
  );

  return { created, resolved, total, durationMs };
}

// ─── Gap Detection Queries ────────────────────────────────────────────────────

/**
 * Run all 6 gap detection queries and combine results.
 */
async function detectAllGaps(threatModelId: string): Promise<DetectedGap[]> {
  const [
    unmitCritical,
    unmitHigh,
    unknownEncryption,
    noAuth,
    noRateLimit,
    zeroThreats,
  ] = await Promise.all([
    detectUnmitigatedCriticalThreats(threatModelId),
    detectUnmitigatedHighThreats(threatModelId),
    detectUnknownEncryptionSensitiveFlows(threatModelId),
    detectNoAuthApiEntryPoints(threatModelId),
    detectNoRateLimitEndpoints(threatModelId),
    detectComponentsWithZeroThreats(threatModelId),
  ]);

  return [
    ...unmitCritical,
    ...unmitHigh,
    ...unknownEncryption,
    ...noAuth,
    ...noRateLimit,
    ...zeroThreats,
  ];
}

/**
 * Gap 1: Unmitigated critical threats
 */
async function detectUnmitigatedCriticalThreats(
  threatModelId: string
): Promise<DetectedGap[]> {
  const threats = await db.tmThreat.findMany({
    where: {
      threatModelId,
      severity: "CRITICAL",
      mitigationStatus: "UNMITIGATED",
      isDeprecated: false,
    },
    select: { id: true, title: true },
  });

  return threats.map((t) => ({
    type: GAP_TYPES.UNMITIGATED_CRITICAL_THREAT,
    severity: GAP_SEVERITY[GAP_TYPES.UNMITIGATED_CRITICAL_THREAT],
    description: `Critical threat "${t.title}" has no mitigation`,
    entityType: "threat",
    entityId: t.id,
  }));
}

/**
 * Gap 2: Unmitigated high threats
 */
async function detectUnmitigatedHighThreats(
  threatModelId: string
): Promise<DetectedGap[]> {
  const threats = await db.tmThreat.findMany({
    where: {
      threatModelId,
      severity: "HIGH",
      mitigationStatus: "UNMITIGATED",
      isDeprecated: false,
    },
    select: { id: true, title: true },
  });

  return threats.map((t) => ({
    type: GAP_TYPES.UNMITIGATED_HIGH_THREAT,
    severity: GAP_SEVERITY[GAP_TYPES.UNMITIGATED_HIGH_THREAT],
    description: `High-severity threat "${t.title}" has no mitigation`,
    entityType: "threat",
    entityId: t.id,
  }));
}

/**
 * Gap 3: Unknown/missing encryption on sensitive data flows
 * Sensitive = CONFIDENTIAL or RESTRICTED sensitivity
 * Unknown = encryption is null, empty, or contains "unknown"
 */
async function detectUnknownEncryptionSensitiveFlows(
  threatModelId: string
): Promise<DetectedGap[]> {
  const flows = await db.tmDataFlow.findMany({
    where: {
      threatModelId,
      isDeprecated: false,
      sensitivity: { in: ["CONFIDENTIAL", "RESTRICTED"] },
      OR: [
        { encryption: null },
        { encryption: "" },
        { encryption: { contains: "unknown", mode: "insensitive" } },
        { encryption: { contains: "none", mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      description: true,
      sensitivity: true,
      encryption: true,
      fromComponent: { select: { name: true } },
      toComponent: { select: { name: true } },
    },
  });

  return flows.map((f) => ({
    type: GAP_TYPES.UNKNOWN_ENCRYPTION_SENSITIVE_FLOW,
    severity: GAP_SEVERITY[GAP_TYPES.UNKNOWN_ENCRYPTION_SENSITIVE_FLOW],
    description: `${f.sensitivity} data flow from ${f.fromComponent.name} to ${f.toComponent.name} has ${f.encryption ? `"${f.encryption}"` : "no"} encryption`,
    entityType: "dataFlow",
    entityId: f.id,
  }));
}

/**
 * Gap 4: API entry points without authentication
 */
async function detectNoAuthApiEntryPoints(
  threatModelId: string
): Promise<DetectedGap[]> {
  const entryPoints = await db.tmEntryPoint.findMany({
    where: {
      threatModelId,
      isDeprecated: false,
      authRequired: false,
      // Match API-type entry points (REST, GraphQL, etc.)
      type: { contains: "api", mode: "insensitive" },
    },
    select: { id: true, name: true, type: true },
  });

  return entryPoints.map((ep) => ({
    type: GAP_TYPES.NO_AUTH_API_ENTRY_POINT,
    severity: GAP_SEVERITY[GAP_TYPES.NO_AUTH_API_ENTRY_POINT],
    description: `${ep.type} entry point "${ep.name}" does not require authentication`,
    entityType: "entryPoint",
    entityId: ep.id,
  }));
}

/**
 * Gap 5: Public endpoints without rate limiting
 */
async function detectNoRateLimitEndpoints(
  threatModelId: string
): Promise<DetectedGap[]> {
  const entryPoints = await db.tmEntryPoint.findMany({
    where: {
      threatModelId,
      isDeprecated: false,
      rateLimited: false,
    },
    select: { id: true, name: true, type: true },
  });

  return entryPoints.map((ep) => ({
    type: GAP_TYPES.NO_RATE_LIMIT_PUBLIC_ENDPOINT,
    severity: GAP_SEVERITY[GAP_TYPES.NO_RATE_LIMIT_PUBLIC_ENDPOINT],
    description: `Entry point "${ep.name}" (${ep.type}) has no rate limiting`,
    entityType: "entryPoint",
    entityId: ep.id,
  }));
}

/**
 * Gap 6: Components with zero threats mapped
 * Uses a subquery approach: find components that have no threats linked to them.
 */
async function detectComponentsWithZeroThreats(
  threatModelId: string
): Promise<DetectedGap[]> {
  const components = await db.tmComponent.findMany({
    where: {
      threatModelId,
      isDeprecated: false,
      threats: { none: { isDeprecated: false } },
    },
    select: { id: true, name: true, type: true },
  });

  return components.map((c) => ({
    type: GAP_TYPES.COMPONENT_ZERO_THREATS,
    severity: GAP_SEVERITY[GAP_TYPES.COMPONENT_ZERO_THREATS],
    description: `Component "${c.name}" (${c.type}) has no threats identified`,
    entityType: "component",
    entityId: c.id,
  }));
}

// ─── Auto-Resolution ──────────────────────────────────────────────────────────

/**
 * Auto-resolve gaps whose underlying condition no longer holds.
 *
 * For each unresolved gap, check if it still appears in the detected gaps list.
 * If not, the condition has been fixed - mark it resolved.
 */
async function autoResolveGaps(
  unresolvedGaps: Array<{ id: string; type: string; entityId: string }>,
  detectedGaps: DetectedGap[]
): Promise<number> {
  // Build a Set of currently-detected gap keys for O(1) lookup
  const activeGapKeys = new Set(
    detectedGaps.map((g) => gapKey(g.type, g.entityId))
  );

  // Find gaps that are no longer detected (condition fixed)
  const toResolve = unresolvedGaps.filter(
    (gap) => !activeGapKeys.has(gapKey(gap.type, gap.entityId))
  );

  if (toResolve.length === 0) return 0;

  // Batch-resolve them
  await db.tmGap.updateMany({
    where: { id: { in: toResolve.map((g) => g.id) } },
    data: { isResolved: true, resolvedAt: new Date() },
  });

  return toResolve.length;
}

// ─── Gap Creation ─────────────────────────────────────────────────────────────

/**
 * Create new gaps that don't already exist as unresolved.
 *
 * Deduplication: a gap is considered "existing" if there's an unresolved gap
 * with the same type + entityId. If a gap was previously resolved but the
 * condition reappears, a new gap record is created.
 */
async function createNewGaps(
  threatModelId: string,
  unresolvedGaps: Array<{ id: string; type: string; entityId: string }>,
  detectedGaps: DetectedGap[]
): Promise<number> {
  if (detectedGaps.length === 0) return 0;

  const existingKeys = new Set(
    unresolvedGaps.map((g) => gapKey(g.type, g.entityId))
  );

  // Filter to only truly new gaps
  const newGaps = detectedGaps.filter(
    (g) => !existingKeys.has(gapKey(g.type, g.entityId))
  );

  if (newGaps.length === 0) return 0;

  // Batch create
  await db.tmGap.createMany({
    data: newGaps.map((g) => ({
      threatModelId,
      type: g.type,
      severity: g.severity,
      description: g.description,
      entityType: g.entityType,
      entityId: g.entityId,
    })),
  });

  return newGaps.length;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Unique key for deduplication: type + entityId */
function gapKey(type: string, entityId: string): string {
  return `${type}:${entityId}`;
}
