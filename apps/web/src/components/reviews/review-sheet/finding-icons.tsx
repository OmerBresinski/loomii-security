import { HugeiconsIcon } from "@hugeicons/react"
import { findingTypeColors, findingTypeIcons } from "./constants"

// ─── Finding Type Icon ──────────────────────────────────────────────────────

export function FindingTypeIcon({ type }: { type: string }) {
  const icon = findingTypeIcons[type]
  const color = findingTypeColors[type] ?? "text-muted-foreground"
  if (!icon) return null
  return (
    <HugeiconsIcon icon={icon} size={16} strokeWidth={1.5} className={color} />
  )
}

// ─── Finding Severity Icon (bar-chart style) ────────────────────────────────

export function FindingSeverityIcon({ severity, size = 14 }: { severity: string; size?: number }) {
  if (severity === "CRITICAL") {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" className="text-red-400">
        <rect width="16" height="16" rx="3" fill="currentColor" opacity="0.8" />
        <text
          x="8"
          y="12"
          textAnchor="middle"
          fontSize="10"
          fontWeight="bold"
          fill="white"
        >
          !
        </text>
      </svg>
    )
  }

  const activeBars = severity === "HIGH" ? 3 : severity === "MEDIUM" ? 2 : 1
  const color =
    severity === "HIGH"
      ? "text-orange-400"
      : severity === "MEDIUM"
        ? "text-amber-400"
        : "text-green-400"

  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={color}>
      <rect
        x="2"
        y="10"
        width="3"
        height="5"
        rx="0.5"
        fill="currentColor"
        opacity={activeBars >= 1 ? 1 : 0.25}
      />
      <rect
        x="6.5"
        y="6"
        width="3"
        height="9"
        rx="0.5"
        fill="currentColor"
        opacity={activeBars >= 2 ? 1 : 0.25}
      />
      <rect
        x="11"
        y="2"
        width="3"
        height="13"
        rx="0.5"
        fill="currentColor"
        opacity={activeBars >= 3 ? 1 : 0.25}
      />
    </svg>
  )
}
