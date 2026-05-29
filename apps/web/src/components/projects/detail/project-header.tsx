import { ProjectIconDisplay, IconPicker } from "@/components/projects/icon-picker"
import { Skeleton } from "@/components/ui/skeleton"
import { timeAgo } from "@/lib/format-time"
import type { ProjectDetail } from "@loomii/shared"

// ─── Component ──────────────────────────────────────────────────────────────

interface ProjectHeaderProps {
  project?: ProjectDetail
  isPending: boolean
}

export function ProjectHeader({ project, isPending }: ProjectHeaderProps) {
  if (isPending) {
    return (
      <div className="flex items-center gap-3">
        <Skeleton className="size-8 rounded-md" />
        <Skeleton className="h-5 w-48" />
      </div>
    )
  }

  if (!project) return null

  return (
    <div className="flex items-center gap-3">
      {/* Project Icon */}
      <IconPicker projectId={project.id} icon={project.icon} color={project.color}>
        <button className="flex size-8 items-center justify-center rounded-md hover:bg-accent">
          <ProjectIconDisplay icon={project.icon} color={project.color} size={20} />
        </button>
      </IconPicker>

      {/* Project Name */}
      <h1 className="text-sm font-semibold">
        {project.name}
      </h1>

      {/* Last Updated */}
      {project.summaryUpdatedAt && (
        <span className="text-[11px] text-muted-foreground">
          Updated {timeAgo(project.summaryUpdatedAt)}
        </span>
      )}
    </div>
  )
}
