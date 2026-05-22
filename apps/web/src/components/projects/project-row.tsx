import { Link } from "@tanstack/react-router"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  ProjectIconDisplay,
  IconPicker,
} from "@/components/projects/icon-picker"
import type { ProjectListItem } from "@loomii/shared"

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

// ─── Risk Icon (same as review-card.tsx) ────────────────────────────────────

const riskLabels: Record<string, string> = {
  CRITICAL: "Critical",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
  INFO: "Info",
}

function RiskIcon({ level }: { level: string }) {
  if (level === "CRITICAL") {
    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        className="text-muted-foreground text-primary/60 dark:text-muted-foreground"
      >
        <rect width="16" height="16" rx="3" fill="currentColor" />
        <text
          x="8"
          y="12"
          textAnchor="middle"
          fontSize="11"
          fontWeight="bold"
          fill="var(--background)"
        >
          !
        </text>
      </svg>
    )
  }

  const activeBars =
    level === "HIGH" ? 3 : level === "MEDIUM" ? 2 : level === "LOW" ? 1 : 0
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      className="text-primary/60 dark:text-muted-foreground"
    >
      <rect
        x="2"
        y="10"
        width="3"
        height="5"
        rx="0.5"
        fill="currentColor"
        opacity={activeBars >= 1 ? 1 : 0.3}
      />
      <rect
        x="6.5"
        y="6"
        width="3"
        height="9"
        rx="0.5"
        fill="currentColor"
        opacity={activeBars >= 2 ? 1 : 0.3}
      />
      <rect
        x="11"
        y="2"
        width="3"
        height="13"
        rx="0.5"
        fill="currentColor"
        opacity={activeBars >= 3 ? 1 : 0.3}
      />
    </svg>
  )
}

// ─── Component ──────────────────────────────────────────────────────────────

interface ProjectRowProps {
  project: ProjectListItem
}

export function ProjectRow({ project }: ProjectRowProps) {
  return (
    <Link
      to="/projects/$projectId"
      params={{ projectId: project.id }}
      preload="intent"
      className="flex h-12 items-center px-2 hover:bg-accent dark:hover:bg-[#25262A]"
    >
      {/* Risk */}
      <Tooltip>
        <TooltipTrigger>
          <div className="flex w-8 shrink-0 items-center justify-center">
            {project.highestRisk ? (
              <RiskIcon level={project.highestRisk} />
            ) : null}
          </div>
        </TooltipTrigger>
        {project.highestRisk && (
          <TooltipContent side="top" className="text-xs">
            {riskLabels[project.highestRisk]}
          </TooltipContent>
        )}
      </Tooltip>

      {/* Project Icon */}
      <IconPicker projectId={project.id} icon={project.icon} color={project.color}>
        <button
          onClick={(e) => e.preventDefault()}
          className="flex shrink-0 items-center justify-center rounded-sm px-[2px] py-[2px] transition-colors duration-100 hover:bg-white/5"
        >
          <ProjectIconDisplay icon={project.icon} color={project.color} size={16} />
        </button>
      </IconPicker>

      {/* Name */}
      <div className="flex min-w-0 flex-1 items-center pr-4 pl-2">
        <span className="truncate text-[13px]">{project.name}</span>
      </div>

      {/* Sources */}
      <div className="flex w-20 shrink-0 items-center justify-end text-[11px] text-muted-foreground">
        {project.sourceCount} {project.sourceCount === 1 ? "source" : "sources"}
      </div>

      {/* Reviews */}
      <div className="flex w-20 shrink-0 items-center justify-end text-[11px] text-muted-foreground">
        {project.reviewCount} {project.reviewCount === 1 ? "review" : "reviews"}
      </div>

      {/* Last Activity */}
      <div className="flex w-16 shrink-0 items-center justify-end text-[11px] text-muted-foreground">
        {project.lastActivity ? timeAgo(project.lastActivity) : "—"}
      </div>
    </Link>
  )
}
