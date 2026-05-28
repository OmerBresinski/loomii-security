import type { FindingsBySeverity } from "@loomii/shared"
import { FindingSeverityIcon } from "@/components/reviews/review-sheet/finding-icons"

// ─── Constants ──────────────────────────────────────────────────────────────

const SEVERITY_CONFIG = [
  { key: "critical" as const, label: "Critical Findings" },
  { key: "high" as const, label: "High Risk Findings" },
]

// ─── Component ──────────────────────────────────────────────────────────────

interface FindingsSeverityBreakdownProps {
  findings: FindingsBySeverity
}

export function FindingsSeverityBreakdown({ findings }: FindingsSeverityBreakdownProps) {
  const total = findings.critical + findings.high

  if (total === 0) {
    return (
      <p className="text-[13px] text-muted-foreground">No findings yet</p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {SEVERITY_CONFIG.map(({ key, label }) => {
        const count = findings[key]
        if (count === 0) return null
        return (
          <div key={key} className="flex items-center">
            <span className="w-[120px] shrink-0 text-[13px] text-muted-foreground">{label}</span>
            <FindingSeverityIcon severity={key.toUpperCase()} />
            <span className="ml-1.5 text-[13px] font-medium tabular-nums text-foreground">{count}</span>
          </div>
        )
      })}
    </div>
  )
}
