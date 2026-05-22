import { ProjectIconDisplay, IconPicker } from "@/components/projects/icon-picker"
import { Skeleton } from "@/components/ui/skeleton"
import type { ProjectDetail } from "@loomii/shared"

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
