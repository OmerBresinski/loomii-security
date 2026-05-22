import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Finding } from "@/queries/reviews"

// ─── Severity Icon ──────────────────────────────────────────────────────────

function SeverityIcon({ severity }: { severity: string | null }) {
  const color =
    severity === "CRITICAL"
      ? "oklch(0.55 0.25 25)"
      : severity === "HIGH"
        ? "oklch(0.6 0.2 40)"
        : severity === "MEDIUM"
          ? "oklch(0.7 0.15 80)"
          : "oklch(0.6 0.1 150)"

  if (severity === "CRITICAL") {
    return (
      <svg width="14" height="14" viewBox="0 0 16 16">
        <circle cx="8" cy="8" r="7" fill={color} />
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

  return (
    <svg width="14" height="14" viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="7" fill="none" stroke={color} strokeWidth="1.5" />
      <circle cx="8" cy="8" r="3" fill={color} />
    </svg>
  )
}

// ─── Type Badge Colors ──────────────────────────────────────────────────────

const typeColors: Record<string, string> = {
  THREAT: "bg-red-500/10 text-red-600 dark:text-red-400",
  REQUIREMENT: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  MITIGATION: "bg-green-500/10 text-green-600 dark:text-green-400",
  OBSERVATION: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
}

// ─── Status Options ─────────────────────────────────────────────────────────

const FINDING_STATUSES = ["OPEN", "ACCEPTED", "REJECTED", "RESOLVED", "DEFERRED"] as const

const statusLabels: Record<string, string> = {
  OPEN: "Open",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  RESOLVED: "Resolved",
  DEFERRED: "Deferred",
}

// ─── Component ──────────────────────────────────────────────────────────────

interface FindingRowProps {
  finding: Finding
  onStatusChange: (findingId: string, status: Finding["status"]) => void
  isUpdating?: boolean
}

export function FindingRow({ finding, onStatusChange, isUpdating }: FindingRowProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border-b border-border/50 last:border-b-0">
      {/* Collapsed Row */}
      <div
        className="flex h-10 cursor-pointer items-center gap-2 px-3 hover:bg-accent/50 dark:hover:bg-[#25262A]/50"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Expand indicator */}
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          className={`shrink-0 text-muted-foreground transition-transform duration-150 ${expanded ? "rotate-90" : ""}`}
        >
          <path
            d="M4 2l4 4-4 4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        {/* Severity */}
        <div className="flex shrink-0 items-center">
          <SeverityIcon severity={finding.severity} />
        </div>

        {/* Title */}
        <span className="min-w-0 flex-1 truncate text-[12px]">
          {finding.title}
        </span>

        {/* Type Badge */}
        <span
          className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${typeColors[finding.type] ?? "bg-muted text-muted-foreground"}`}
        >
          {finding.type}
        </span>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="space-y-3 border-t border-border/30 bg-muted/30 px-4 py-3">
          {/* Description */}
          {finding.description && (
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              {finding.description}
            </p>
          )}

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-2">
            {/* STRIDE */}
            {finding.strideCategory && (
              <Badge variant="outline" className="h-5 text-[10px]">
                {finding.strideCategory}
              </Badge>
            )}

            {/* Effort */}
            {finding.effortEstimate && (
              <Badge variant="secondary" className="h-5 text-[10px]">
                Effort: {finding.effortEstimate}
              </Badge>
            )}

            {/* Severity */}
            {finding.severity && (
              <Badge variant="secondary" className="h-5 text-[10px]">
                {finding.severity}
              </Badge>
            )}
          </div>

          {/* Status Dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">Status:</span>
            <Select
              value={finding.status}
              onValueChange={(val) =>
                onStatusChange(finding.id, val as Finding["status"])
              }
              disabled={isUpdating}
            >
              <SelectTrigger size="sm" className="h-7 w-fit min-w-[100px] text-[11px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {FINDING_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {statusLabels[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  )
}
