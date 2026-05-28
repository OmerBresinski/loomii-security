import { useCallback } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useProjectReviews } from "@/queries/projects"
import { teamMembersQueryOptions } from "@/queries/settings"
import { useAssignProject } from "@/mutations/projects"
import { SummaryCard } from "./summary-card"
import { PropertiesPanel, AssigneeDisplay } from "./properties-panel"
import { UserPickerPopover } from "@/components/ui/user-picker-popover"
import type { ProjectDetail } from "@loomii/shared"

// ─── Properties Panel Container ─────────────────────────────────────────────

function PropertiesPanelContainer({
  project,
  criticalReviewCount,
}: {
  project: ProjectDetail
  criticalReviewCount: number
}) {
  const queryClient = useQueryClient()
  const assignMutation = useAssignProject(project.id)

  const handlePrefetch = useCallback(() => {
    queryClient.prefetchQuery(teamMembersQueryOptions())
  }, [queryClient])

  const handleAssign = useCallback(
    (userId: string | null) => {
      assignMutation.mutate({ assignedToId: userId })
    },
    [assignMutation]
  )

  return (
    <PropertiesPanel
      project={project}
      criticalReviewCount={criticalReviewCount}
      onAssigneeHover={handlePrefetch}
      assigneePickerContent={
        <UserPickerPopover
          selectedUserId={project.assignedTo?.id ?? null}
          onSelect={handleAssign}
        >
          <AssigneeDisplay assignee={project.assignedTo} />
        </UserPickerPopover>
      }
    />
  )
}

// ─── Component ──────────────────────────────────────────────────────────────

interface OverviewTabProps {
  projectId: string
  project?: ProjectDetail
  isPending: boolean
}

export function OverviewTab({
  projectId,
  project,
  isPending,
}: OverviewTabProps) {
  const { data: reviews } = useProjectReviews(projectId)

  const criticalReviewCount =
    reviews?.reviews?.filter(
      (r: { severity?: string | null }) => r.severity === "CRITICAL"
    ).length ?? 0

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-[1fr_400px] lg:gap-x-40">
        {/* Left column: Summary */}
        <div className="min-w-0 pt-14 pl-24 lg:min-h-0 lg:overflow-y-auto lg:pr-2">
          <SummaryCard project={project} isPending={isPending} />
        </div>

        {/* Right column: Properties (full height) */}
        <div className="lg:min-h-0 lg:overflow-y-auto">
          {project && (
            <PropertiesPanelContainer
              project={project}
              criticalReviewCount={criticalReviewCount}
            />
          )}
        </div>
      </div>
    </div>
  )
}
