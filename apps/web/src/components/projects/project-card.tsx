import { Link } from "@tanstack/react-router"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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

// ─── Risk Indicator ─────────────────────────────────────────────────────────

const riskColors: Record<string, string> = {
  CRITICAL: "bg-red-500",
  HIGH: "bg-orange-500",
  MEDIUM: "bg-yellow-500",
  LOW: "bg-blue-500",
  INFO: "bg-muted-foreground/40",
}

const riskLabels: Record<string, string> = {
  CRITICAL: "Critical",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
  INFO: "Info",
}

function RiskDot({ level }: { level: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <span
        className={`inline-block size-2 rounded-full ${riskColors[level] ?? "bg-muted-foreground/40"}`}
      />
      {riskLabels[level] ?? level}
    </span>
  )
}

// ─── Component ──────────────────────────────────────────────────────────────

interface ProjectCardProps {
  project: ProjectListItem
}

export function ProjectCard({ project }: ProjectCardProps) {
  return (
    <Link
      to="/projects/$projectId"
      params={{ projectId: project.id }}
      preload="intent"
      className="block outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg"
    >
      <Card className="h-full transition-colors hover:bg-accent/50">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-sm font-medium leading-snug">
              {project.name}
            </CardTitle>
            {project.highestRisk && <RiskDot level={project.highestRisk} />}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {/* Stats row */}
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span>{project.sourceCount} source{project.sourceCount !== 1 ? "s" : ""}</span>
            <span className="text-border">·</span>
            <span>{project.reviewCount} review{project.reviewCount !== 1 ? "s" : ""}</span>
          </div>

          {/* Last activity */}
          {project.lastActivity && (
            <p className="text-[11px] text-muted-foreground/70">
              Active {timeAgo(project.lastActivity)}
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}
