import { useCallback } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useProjectReviews } from "@/queries/projects"
import { teamMembersQueryOptions } from "@/queries/settings"
import { useAssignProject } from "@/mutations/projects"
import { SummaryCard } from "./summary-card"
import { PropertiesPanel, AssigneeDisplay } from "./properties-panel"
import {
  ProjectIconDisplay,
  IconPicker,
} from "@/components/projects/icon-picker"
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
    <div className="flex h-full flex-col">
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-[1fr_400px]">
        {/* Left column: Summary (centered horizontally) */}
        <div className="flex min-w-0 justify-center lg:min-h-0 lg:overflow-y-auto">
          <div className="flex w-full max-w-3xl flex-col gap-5 pt-12">
            {/* Project icon + name */}
            {project && (
              <div className="flex items-center gap-3 pb-6">
                <IconPicker
                  projectId={projectId}
                  icon={project.icon}
                  color={project.color}
                >
                  <button className="flex size-8 items-center justify-center rounded-md hover:bg-accent">
                    <ProjectIconDisplay
                      icon={project.icon}
                      color={project.color}
                      size={20}
                    />
                  </button>
                </IconPicker>
                <h1 className="font-heading text-2xl font-semibold">
                  {project.name}
                </h1>
              </div>
            )}
            <SummaryCard project={project} isPending={isPending} />
          </div>
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
