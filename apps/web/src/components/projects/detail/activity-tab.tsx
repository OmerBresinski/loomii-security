import { Button } from "@/components/ui/button"
import { useProjectActivityInfinite } from "@/queries/projects"
import { ActivityTimeline, ActivityTimelineSkeleton } from "./activity-timeline"

// ─── Activity Tab ───────────────────────────────────────────────────────────

interface ActivityTabProps {
  projectId: string
}

export function ActivityTab({ projectId }: ActivityTabProps) {
  const {
    data,
    isPending,
    isError,
    error,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useProjectActivityInfinite(projectId)

  const allEvents = data?.pages.flatMap((p) => p.events) ?? []

  if (isPending) {
    return <ActivityTimelineSkeleton />
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-sm text-destructive">
        <p>Failed to load activity</p>
        <p className="text-xs text-muted-foreground">{error.message}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <ActivityTimeline events={allEvents} />

      {hasNextPage ? (
        <div className="flex justify-center pb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="text-[12px] text-muted-foreground"
          >
            {isFetchingNextPage ? "Loading..." : "Load more"}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
