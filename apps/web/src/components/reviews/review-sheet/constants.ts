import type { IconSvgElement } from "@hugeicons/react"
import {
  Shield01Icon,
  CheckListIcon,
  Wrench01Icon,
  EyeIcon,
} from "@hugeicons/core-free-icons"

// ─── Review Steps ───────────────────────────────────────────────────────────

// REMOVED: REVIEW_STEPS (stepper deleted in lifecycle redesign)

// ─── Finding Statuses ───────────────────────────────────────────────────────

// REMOVED: FINDING_STATUSES (old 5-status dropdown deleted)

// ─── Dismissal Reasons (new) ────────────────────────────────────────────────

export const DISMISSAL_REASONS = [
  "FALSE_POSITIVE",
  "NOT_APPLICABLE",
  "DUPLICATE",
  "ALREADY_MITIGATED",
] as const

export type DismissalReason = (typeof DISMISSAL_REASONS)[number]

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

export const riskLabels: Record<string, string> = {
  CRITICAL: "Critical",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
  INFO: "Info",
}

// ─── Severity Labels ────────────────────────────────────────────────────────

export const severityLabels: Record<string, string> = {
  CRITICAL: "Critical severity",
  HIGH: "High severity",
  MEDIUM: "Medium severity",
  LOW: "Low severity",
}
