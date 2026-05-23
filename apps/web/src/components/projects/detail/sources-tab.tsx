import { useProjectSources } from "@/queries/projects"
import {
  useArchiveSource,
  useUnlinkSource,
} from "@/mutations/projects"
import { SourcesTable, SourcesTableSkeleton } from "./sources-table"

// ─── Sources Tab ────────────────────────────────────────────────────────────

interface SourcesTabProps {
  projectId: string
}

export function SourcesTab({ projectId }: SourcesTabProps) {
  const showArchived = false

  const { data: sourcesData, isPending } = useProjectSources(projectId)
  const archiveMutation = useArchiveSource(projectId)
  const unlinkMutation = useUnlinkSource(projectId)

  const sources = sourcesData?.sources ?? []

  function handleArchive(sourceId: string, isArchived: boolean) {
    archiveMutation.mutate({ sourceId, isArchived })
  }

  function handleUnlink(sourceId: string) {
    unlinkMutation.mutate(sourceId)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Table */}
      {isPending ? (
        <SourcesTableSkeleton />
      ) : (
        <SourcesTable
          sources={sources}
          showArchived={showArchived}
          onArchive={handleArchive}
          onUnlink={handleUnlink}
          onMove={() => {}}
          archivingSourceId={
            archiveMutation.isPending
              ? archiveMutation.variables?.sourceId
              : null
          }
          projectId={projectId}
        />
      )}
    </div>
  )
}
