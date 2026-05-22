import { useProjectSources, useProjectReviews } from "@/queries/projects"
import { SummaryCard } from "./summary-card"
import { StatsRow } from "./stats-row"
import { SourcesList } from "./sources-list"
import type { ProjectDetail } from "@loomii/shared"

// ─── Component ──────────────────────────────────────────────────────────────

interface OverviewTabProps {
  projectId: string
  project?: ProjectDetail
  isPending: boolean
}

export function OverviewTab({ projectId, project, isPending }: OverviewTabProps) {
  const { data: sources, isPending: sourcesPending } = useProjectSources(projectId)
  const { data: reviews } = useProjectReviews(projectId)

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
      {/* Left column */}
      <div className="flex min-w-0 flex-col gap-6">
        <StatsRow
          project={project}
          sources={sources}
          reviews={reviews}
          isPending={isPending}
        />
        <SummaryCard project={project} isPending={isPending} />
      </div>

      {/* Right column */}
      <div className="flex flex-col gap-4">
        <SourcesList sources={sources} isPending={sourcesPending} />
      </div>
    </div>
  )
}
