import { Skeleton } from "@/components/ui/skeleton"
import type { ProjectDetail } from "@loomii/shared"
import type { ProjectSourcesResponse, ProjectReviewsResponse } from "@/queries/projects"

// ─── Stat Item ──────────────────────────────────────────────────────────────

interface StatItemProps {
  label: string
  value: string | number
  variant?: "default" | "warning"
}

function StatItem({ label, value, variant = "default" }: StatItemProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-muted-foreground uppercase tracking-wide">
        {label}
      </span>
      <span
        className={`text-lg font-semibold tabular-nums ${
          variant === "warning" ? "text-destructive" : "text-foreground"
        }`}
      >
        {value}
      </span>
    </div>
  )
}

// ─── Component ──────────────────────────────────────────────────────────────

interface StatsRowProps {
  project?: ProjectDetail
  sources?: ProjectSourcesResponse
  reviews?: ProjectReviewsResponse
  isPending: boolean
}

export function StatsRow({
  project,
  sources,
  reviews,
  isPending,
}: StatsRowProps) {
  if (isPending) {
    return (
      <div className="flex items-center gap-8 rounded-lg border border-border/50 px-6 py-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-0.5">
            <Skeleton className="h-[11px] w-20" />
            <Skeleton className="h-7 w-8" />
          </div>
        ))}
      </div>
    )
  }

  if (!project) return null

  const totalSources = sources?.sources.length ?? project.sourceCount
  const activeSources =
    sources?.sources.filter((s) => !s.isArchived).length ?? project.sourceCount
  const totalReviews = reviews?.reviews.length ?? project.reviewCount

  // Count critical/high-risk reviews
  const criticalHighCount =
    reviews?.reviews.filter(
      (r) => r.riskLevel === "CRITICAL" || r.riskLevel === "HIGH"
    ).length ?? 0

  return (
    <div className="flex items-center gap-8 rounded-lg border border-border/50 px-6 py-4">
      <StatItem label="Total Sources" value={totalSources} />
      <StatItem label="Active Sources" value={activeSources} />
      <StatItem
        label="High Risk Reviews"
        value={criticalHighCount}
        variant={criticalHighCount > 0 ? "warning" : "default"}
      />
      <StatItem label="Total Reviews" value={totalReviews} />
    </div>
  )
}
