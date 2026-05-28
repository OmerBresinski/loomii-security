import { useRef } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll"
import { NotificationRow } from "@/components/notifications/notification-row"
import type { NotificationItem } from "@/queries/notifications"

// ─── Component ──────────────────────────────────────────────────────────────

interface NotificationsListProps {
  notifications: NotificationItem[]
  isFetchingNextPage: boolean
  hasNextPage: boolean
  fetchNextPage: () => void
  onRowClick: (notification: NotificationItem) => void
}

export function NotificationsList({
  notifications,
  isFetchingNextPage,
  hasNextPage,
  fetchNextPage,
  onRowClick,
}: NotificationsListProps) {
  const parentRef = useRef<HTMLDivElement>(null)

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: notifications.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44,
    overscan: 5,
  })

  const { sentinelRef } = useInfiniteScroll({
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    scrollRef: parentRef,
  })

  const virtualItems = virtualizer.getVirtualItems()

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-md">
      <div ref={parentRef} className="min-h-0 flex-1 overflow-y-auto rounded-2xl">
        <div
          className="relative w-full"
          style={{ height: `${virtualizer.getTotalSize()}px` }}
        >
          {virtualItems.map((virtualRow) => {
            const notification = notifications[virtualRow.index]
            return (
              <div
                key={virtualRow.key}
                className="absolute top-0 left-0 w-full"
                style={{
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                onClick={() => onRowClick(notification)}
              >
                <NotificationRow notification={notification} />
              </div>
            )
          })}
        </div>
        {isFetchingNextPage && (
          <div className="flex h-[44px] items-center justify-center text-xs text-muted-foreground">
            Loading more...
          </div>
        )}
        <div ref={sentinelRef} aria-hidden className="h-px" />
      </div>
    </div>
  )
}
