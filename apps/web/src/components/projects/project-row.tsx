import { memo } from "react"
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
import { RiskIcon, riskLabels } from "@/components/shared/risk-icon"
import { timeAgo } from "@/lib/format-time"
import type { ProjectListItem } from "@loomii/shared"

// ─── Component ──────────────────────────────────────────────────────────────

interface ProjectRowProps {
  project: ProjectListItem
}

export const ProjectRow = memo(function ProjectRow({ project }: ProjectRowProps) {
  return (
    <Link
      to="/projects/$projectId"
      params={{ projectId: project.id }}
      preload="intent"
      className="flex h-[44px] items-center px-4 hover:bg-accent dark:hover:bg-[#25262A]"
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
      <IconPicker
        projectId={project.id}
        icon={project.icon}
        color={project.color}
      >
        <button
          onClick={(e) => e.preventDefault()}
          className="flex shrink-0 items-center justify-center rounded-sm px-[2px] py-[2px] transition-colors duration-100 hover:bg-white/5"
        >
          <ProjectIconDisplay
            icon={project.icon}
            color={project.color}
            size={16}
          />
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
})
