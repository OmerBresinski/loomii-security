import { Link } from "@tanstack/react-router"
import { Badge } from "@/components/ui/badge"

// ─── Component ──────────────────────────────────────────────────────────────

interface ProjectBadgeProps {
  project: { id: string; name: string }
}

export function ProjectBadge({ project }: ProjectBadgeProps) {
  return (
    <Link
      to="/projects/$projectId"
      params={{ projectId: project.id }}
      preload="intent"
      onClick={(e) => e.stopPropagation()}
    >
      <Badge
        variant="secondary"
        className="text-[11px] font-normal hover:bg-secondary/80"
      >
        {project.name}
      </Badge>
    </Link>
  )
}
