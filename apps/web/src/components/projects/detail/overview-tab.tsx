import { useProjectSources, useProjectReviews } from "@/queries/projects"
import { SummaryCard } from "./summary-card"
import { StatsRow } from "./stats-row"
import type { ProjectDetail } from "@loomii/shared"

// ─── Component ──────────────────────────────────────────────────────────────

interface OverviewTabProps {
  projectId: string
  project?: ProjectDetail
  isPending: boolean
}

export function OverviewTab({ projectId, project, isPending }: OverviewTabProps) {
  const { data: sources, isPending: sourcesPending } = useProjectSources(projectId)
  const { data: reviews, isPending: reviewsPending } = useProjectReviews(projectId)

  const statsLoading = isPending || sourcesPending || reviewsPending

  return (
    <div className="flex flex-col gap-6">
      <StatsRow
        project={project}
        sources={sources}
        reviews={reviews}
        isPending={statsLoading}
      />
      <SummaryCard project={project} isPending={isPending} />
    </div>
  )
}
