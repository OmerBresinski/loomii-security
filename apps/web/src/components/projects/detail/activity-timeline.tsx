import { Skeleton } from "@/components/ui/skeleton"
import type { ProjectActivity } from "@/queries/projects"
import { ActivityEvent } from "./activity-event"

// ─── Loading Skeleton ───────────────────────────────────────────────────────

export function ActivityTimelineSkeleton() {
  return (
    <div className="flex flex-col gap-0">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="relative flex gap-3 pb-6">
          {i < 5 ? (
            <div className="absolute top-5 left-[6px] bottom-0 w-px bg-border/40" />
          ) : null}
          <Skeleton className="size-3.5 shrink-0" />
          <div className="flex flex-1 items-center gap-2 pt-px">
            <Skeleton className="h-3 flex-1" />
            <Skeleton className="h-3 w-12" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Activity Timeline ──────────────────────────────────────────────────────

interface ActivityTimelineProps {
  events: ProjectActivity[]
}

export function ActivityTimeline({ events }: ActivityTimelineProps) {
  if (events.length === 0) {
    return (
      <p className="py-8 text-center text-[12px] text-muted-foreground">
        No activity yet.
      </p>
    )
  }

  return (
    <div className="flex flex-col">
      {events.map((event, idx) => (
        <ActivityEvent
          key={`${event.type}-${event.timestamp}-${idx}`}
          event={event}
          isLast={idx === events.length - 1}
        />
      ))}
    </div>
  )
}
