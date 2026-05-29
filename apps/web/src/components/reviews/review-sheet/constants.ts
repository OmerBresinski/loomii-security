import type { IconSvgElement } from "@hugeicons/react"
import {
  Shield01Icon,
  CheckListIcon,
  Wrench01Icon,
  EyeIcon,
} from "@hugeicons/core-free-icons"
import { DISMISSAL_REASONS, type DismissalReason } from "@/types/reviews"

// Re-export for consumers that already import from here
export { DISMISSAL_REASONS }
export type { DismissalReason }

// ─── Review Steps ───────────────────────────────────────────────────────────

// REMOVED: REVIEW_STEPS (stepper deleted in lifecycle redesign)

// ─── Finding Statuses ───────────────────────────────────────────────────────

// REMOVED: FINDING_STATUSES (old 5-status dropdown deleted)

// ─── Dismissal Reasons (new) ────────────────────────────────────────────────

export const dismissalReasonLabels: Record<DismissalReason, string> = {
  FALSE_POSITIVE: "False positive",
  NOT_APPLICABLE: "Not applicable",
  DUPLICATE: "Duplicate",
  ALREADY_MITIGATED: "Already mitigated",
}

// ─── Finding Type Mappings ──────────────────────────────────────────────────

export const findingTypeColors: Record<string, string> = {
  THREAT: "text-red-400",
  REQUIREMENT: "text-blue-400",
  MITIGATION: "text-green-400",
  OBSERVATION: "text-amber-400",
}

export const findingTypeLabels: Record<string, string> = {
  THREAT: "Threat",
  REQUIREMENT: "Requirement",
  MITIGATION: "Mitigation",
  OBSERVATION: "Observation",
}

export const findingTypeIcons: Record<string, IconSvgElement> = {
  THREAT: Shield01Icon,
  REQUIREMENT: CheckListIcon,
  MITIGATION: Wrench01Icon,
  OBSERVATION: EyeIcon,
}

// ─── Risk Labels ────────────────────────────────────────────────────────────

// Re-export from canonical shared location
export { riskLabels } from "@/components/shared/risk-icon"

// ─── Severity Labels ────────────────────────────────────────────────────────

export const severityLabels: Record<string, string> = {
  CRITICAL: "Critical severity",
  HIGH: "High severity",
  MEDIUM: "Medium severity",
  LOW: "Low severity",
}
