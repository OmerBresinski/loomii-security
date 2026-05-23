import { useState } from "react"
import { Button } from "@/components/ui/button"
import { useProjectActivity } from "@/queries/projects"
import { ActivityTimeline, ActivityTimelineSkeleton } from "./activity-timeline"
import type { ProjectActivity } from "@/queries/projects"

// ─── Activity Tab ───────────────────────────────────────────────────────────

interface ActivityTabProps {
  projectId: string
}

export function ActivityTab({ projectId }: ActivityTabProps) {
  const [cursors, setCursors] = useState<string[]>([])
  const currentCursor = cursors[cursors.length - 1] as string | undefined

  const { data, isPending } = useProjectActivity(projectId, currentCursor)

  // Accumulate all loaded events across pages
  const [previousEvents, setPreviousEvents] = useState<ProjectActivity[]>([])

  const allEvents = currentCursor
    ? [...previousEvents, ...(data?.events ?? [])]
    : (data?.events ?? [])

  function handleLoadMore() {
    if (!data?.nextCursor) return
    // Save current events before loading next page
    setPreviousEvents(allEvents)
    setCursors((prev) => [...prev, data.nextCursor!])
  }

  if (isPending && allEvents.length === 0) {
    return <ActivityTimelineSkeleton />
  }

  return (
    <div className="flex flex-col gap-4">
      <ActivityTimeline events={allEvents} />

      {data?.nextCursor ? (
        <div className="flex justify-center pb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLoadMore}
            disabled={isPending}
            className="text-[12px] text-muted-foreground"
          >
            {isPending ? "Loading..." : "Load more"}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
