import type { FindingsBySeverity } from "@loomii/shared"

// ─── Constants ──────────────────────────────────────────────────────────────

const SEVERITY_CONFIG = [
  { key: "critical" as const, label: "Critical", dotClass: "bg-red-400" },
  { key: "high" as const, label: "High", dotClass: "bg-orange-400" },
]

// ─── Component ──────────────────────────────────────────────────────────────

interface FindingsSeverityBreakdownProps {
  findings: FindingsBySeverity
}

export function FindingsSeverityBreakdown({ findings }: FindingsSeverityBreakdownProps) {
  const total = findings.critical + findings.high

  if (total === 0) {
    return (
      <p className="text-[11px] text-muted-foreground">No findings yet</p>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      {SEVERITY_CONFIG.map(({ key, label, dotClass }) => {
        const count = findings[key]
        if (count === 0) return null
        return (
          <div key={key} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`h-2 w-2 rounded-full ${dotClass}`} />
              <span className="text-[13px] text-muted-foreground">{label}</span>
            </div>
            <span className="text-[13px] tabular-nums text-foreground">{count}</span>
          </div>
        )
      })}
    </div>
  )
}
