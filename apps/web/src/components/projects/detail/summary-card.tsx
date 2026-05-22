import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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

interface SummaryCardProps {
  project?: ProjectDetail
  isPending: boolean
}

export function SummaryCard({ project, isPending }: SummaryCardProps) {
  if (isPending) {
    return (
      <Card size="sm">
        <CardHeader>
          <CardTitle>
            <Skeleton className="h-4 w-24" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!project) return null

  const hasSummary = !!project.summary

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Summary
          <Badge
            variant="secondary"
            className="text-[10px] font-normal uppercase"
          >
            AI-generated
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {hasSummary ? (
          <div className="flex flex-col gap-2">
            <p className="text-[13px] leading-relaxed text-foreground/80">
              {project.summary}
            </p>
            {project.summaryUpdatedAt && (
              <p className="text-[11px] text-muted-foreground">
                Last updated {timeAgo(project.summaryUpdatedAt)}
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
            <div className="flex items-center gap-2">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="animate-spin text-muted-foreground"
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              <span className="text-xs text-muted-foreground">
                Summary generating...
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground/60">
              This usually takes a few moments after project creation.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
