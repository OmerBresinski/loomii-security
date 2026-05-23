import type { IconSvgElement } from "@hugeicons/react"
import {
  Shield01Icon,
  CheckListIcon,
  Wrench01Icon,
  EyeIcon,
} from "@hugeicons/core-free-icons"

// ─── Review Steps ───────────────────────────────────────────────────────────

export const REVIEW_STEPS = [
  { key: "DRAFT", label: "Draft" },
  { key: "IN_REVIEW", label: "Review" },
  { key: "APPROVED", label: "Approved" },
  { key: "PUBLISHED", label: "Published" },
] as const

// ─── Finding Statuses ───────────────────────────────────────────────────────

export const FINDING_STATUSES = [
  "OPEN",
  "ACCEPTED",
  "REJECTED",
  "RESOLVED",
  "DEFERRED",
] as const

export const findingStatusLabels: Record<string, string> = {
  OPEN: "Open",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  RESOLVED: "Resolved",
  DEFERRED: "Deferred",
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
