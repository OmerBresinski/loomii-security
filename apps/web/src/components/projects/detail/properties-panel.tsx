import type { ProjectDetail } from "@loomii/shared"
import { FindingsSeverityBreakdown } from "./findings-severity-breakdown"
import { FindingSeverityIcon } from "@/components/reviews/review-sheet/finding-icons"
import { UserAvatar, getDisplayName } from "@/components/ui/user-avatar"

// ─── Helpers ────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = now - then

  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`

  return new Date(dateStr).toLocaleDateString()
}

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
  onAssigneeHover: () => void
  assigneePickerContent: React.ReactNode
}

export function PropertiesPanel({ project, onAssigneeHover, assigneePickerContent }: PropertiesPanelProps) {
  return (
    <div className="rounded-md border border-border bg-[#26272B] p-5 space-y-5">
      {/* Properties Section */}
      <div className="space-y-3">
        {/* Assignee */}
        <div className="flex items-center">
          <span className="w-[120px] shrink-0 text-[13px] text-muted-foreground">Assignee</span>
          <div onMouseEnter={onAssigneeHover}>
            {assigneePickerContent}
          </div>
        </div>

        {/* Risk Level */}
        <div className="flex items-center">
          <span className="w-[120px] shrink-0 text-[13px] text-muted-foreground">Risk</span>
          {project.highestRisk ? (
            <div className="flex items-center gap-1.5">
              <FindingSeverityIcon severity={project.highestRisk} />
              <span className={`text-[13px] font-medium ${getRiskTextClass(project.highestRisk)}`}>
                {project.highestRisk.charAt(0) + project.highestRisk.slice(1).toLowerCase()}
              </span>
            </div>
          ) : (
            <span className="text-[13px] text-muted-foreground">None</span>
          )}
        </div>

        {/* Created */}
        <div className="flex items-center">
          <span className="w-[120px] shrink-0 text-[13px] text-muted-foreground">Created</span>
          <span className="text-[13px] text-foreground">{timeAgo(project.createdAt)}</span>
        </div>

        {/* Last Activity */}
        {project.lastActivity && (
          <div className="flex items-center">
            <span className="w-[120px] shrink-0 text-[13px] text-muted-foreground">Last Activity</span>
            <span className="text-[13px] text-foreground">{timeAgo(project.lastActivity)}</span>
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-border" />

      {/* Findings Section */}
      <div className="space-y-3">
        <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Findings
        </h3>
        <FindingsSeverityBreakdown findings={project.findingsBySeverity} />
      </div>
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
      <span className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
        Unassigned
      </span>
    )
  }

  return (
    <div className="flex cursor-pointer items-center gap-2 hover:opacity-80">
      <UserAvatar user={assignee} size="sm" />
      <span className="text-sm text-foreground">{getDisplayName(assignee)}</span>
    </div>
  )
}
