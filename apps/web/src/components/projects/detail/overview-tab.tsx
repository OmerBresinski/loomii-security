import { useCallback } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useProjectSources, useProjectReviews } from "@/queries/projects"
import { teamMembersQueryOptions } from "@/queries/settings"
import { useAssignProject } from "@/mutations/projects"
import { SummaryCard } from "./summary-card"
import { StatsRow } from "./stats-row"
import { SourcesList } from "./sources-list"
import { PropertiesPanel, AssigneeDisplay } from "./properties-panel"
import { UserPickerPopover } from "@/components/ui/user-picker-popover"
import type { ProjectDetail } from "@loomii/shared"

// ─── Properties Panel Container ─────────────────────────────────────────────

function PropertiesPanelContainer({ project }: { project: ProjectDetail }) {
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
  const { data: sources, isPending: sourcesPending } =
    useProjectSources(projectId)
  const { data: reviews } = useProjectReviews(projectId)

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-[1fr_400px] lg:gap-x-40">
        {/* Left column: Stats + Summary */}
        <div className="min-w-0 lg:min-h-0 lg:overflow-y-auto lg:pr-2">
          <div className="flex flex-col gap-6">
            <StatsRow
              project={project}
              sources={sources}
              reviews={reviews}
              isPending={isPending}
            />
            <SummaryCard project={project} isPending={isPending} />
          </div>
        </div>

        {/* Right column: Properties + Sources (full height) */}
        <div className="flex flex-col gap-6 lg:min-h-0 lg:overflow-y-auto">
          {project && <PropertiesPanelContainer project={project} />}
          <SourcesList sources={sources} isPending={sourcesPending} />
        </div>
      </div>
    </div>
  )
}
