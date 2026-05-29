import type { ProjectDetail } from "@loomii/shared"
import { FindingsSeverityBreakdown } from "./findings-severity-breakdown"
import { FindingSeverityIcon } from "@/components/reviews/review-sheet/finding-icons"
import { UserAvatar, getDisplayName } from "@/components/ui/user-avatar"
import { timeAgo } from "@/lib/format-time"

function getRiskTextClass(risk: string): string {
  switch (risk) {
    case "CRITICAL":
      return "text-red-400"
    case "HIGH":
      return "text-orange-400"
    default:
      return "text-muted-foreground"
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

interface PropertiesPanelProps {
  project: ProjectDetail
  criticalReviewCount: number
  onAssigneeHover: () => void
  assigneePickerContent: React.ReactNode
}

export function PropertiesPanel({
  project,
  criticalReviewCount,
  onAssigneeHover,
  assigneePickerContent,
}: PropertiesPanelProps) {
  return (
    <div
      className="space-y-5 rounded-2xl bg-[#26272B] p-3.5"
      style={{ border: "0.5px solid lch(24.136 3.913 272.695)" }}
    >
      {/* Properties Section */}
      <div className="space-y-[18px]">
        {/* Assignee */}
        <div className="flex items-center">
          <span className="w-[150px] shrink-0 text-xs text-muted-foreground">
            Assignee
          </span>
          <div onMouseEnter={onAssigneeHover}>{assigneePickerContent}</div>
        </div>

        {/* Risk Level */}
        <div className="flex items-center">
          <span className="w-[150px] shrink-0 text-xs text-muted-foreground">
            Risk
          </span>
          {project.highestRisk ? (
            <div className="flex items-center gap-2.5">
              <FindingSeverityIcon severity={project.highestRisk} size={16} />
              <span
                className={`text-xs font-medium ${getRiskTextClass(project.highestRisk)}`}
              >
                {project.highestRisk.charAt(0) +
                  project.highestRisk.slice(1).toLowerCase()}
              </span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">None</span>
          )}
        </div>

        {/* Critical Reviews */}
        <div className="flex items-center">
          <span className="w-[150px] shrink-0 text-xs text-muted-foreground">
            Critical Reviews
          </span>
          <span
            className={`text-xs font-medium tabular-nums ${criticalReviewCount > 0 ? "text-red-400" : "text-muted-foreground"}`}
          >
            {criticalReviewCount}
          </span>
        </div>

        {/* Created */}
        <div className="flex items-center">
          <span className="w-[150px] shrink-0 text-xs text-muted-foreground">
            Created
          </span>
          <span className="text-xs text-foreground">
            {timeAgo(project.createdAt)}
          </span>
        </div>

        {/* Last Activity */}
        {project.lastActivity && (
          <div className="flex items-center">
            <span className="w-[150px] shrink-0 text-xs text-muted-foreground">
              Last Activity
            </span>
            <span className="text-xs text-foreground">
              {timeAgo(project.lastActivity)}
            </span>
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-border" />

      {/* Findings Section */}
      <FindingsSeverityBreakdown findings={project.findingsBySeverity} />
    </div>
  )
}

// ─── Assignee Display (for use as the trigger inside the picker) ────────────

interface AssigneeDisplayProps {
  assignee: ProjectDetail["assignedTo"]
}

export function AssigneeDisplay({ assignee }: AssigneeDisplayProps) {
  if (!assignee) {
    return (
      <span className="text-xs text-muted-foreground hover:text-foreground">
        Unassigned
      </span>
    )
  }

  return (
    <div className="flex items-center gap-2 hover:opacity-80">
      <UserAvatar user={assignee} size="sm" />
      <span className="text-xs text-foreground">
        {getDisplayName(assignee)}
      </span>
    </div>
  )
}
