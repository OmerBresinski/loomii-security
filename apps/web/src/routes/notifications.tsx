import { useCallback, useMemo } from "react"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { Skeleton } from "@/components/ui/skeleton"
import { NotificationsToolbar } from "@/components/notifications/notifications-toolbar"
import { NotificationsList } from "@/components/notifications/notifications-list"
import {
  useNotifications,
  type NotificationFilters,
  type NotificationItem,
} from "@/queries/notifications"
import { useMarkAsRead } from "@/mutations/notifications"

// ─── Page ───────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as { filter?: string }
  const markAsRead = useMarkAsRead()

  // Derive filter from URL — computed during render, no effect needed
  const activeTab = search.filter ?? "all"
  const filters: NotificationFilters = useMemo(() => {
    if (activeTab === "unread") return { unread: true }
    if (activeTab !== "all") return { type: activeTab }
    return {}
  }, [activeTab])

  // Data
  const { data, isPending, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useNotifications(filters)

  // Flatten pages — only recomputes when data reference changes
  const notifications = useMemo(
    () => data?.pages.flatMap((page) => page.notifications) ?? [],
    [data]
  )

  // Event handlers — logic in handlers, not effects
  const handleTabChange = useCallback(
    (value: string) => {
      navigate({
        to: "/notifications",
        search: { filter: value === "all" ? undefined : value },
        replace: true,
      })
    },
    [navigate]
  )

  const handleRowClick = useCallback(
    (notification: NotificationItem) => {
      if (!notification.read) {
        markAsRead.mutate(notification.id)
      }
      if (notification.linkUrl) {
        navigate({ to: notification.linkUrl })
      }
    },
    [navigate, markAsRead]
  )

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col overflow-hidden p-6">
      <NotificationsToolbar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        hasNotifications={notifications.length > 0}
      />

      {isPending ? (
        <NotificationsLoadingSkeleton />
      ) : notifications.length === 0 ? (
        <NotificationsEmptyState activeTab={activeTab} />
      ) : (
        <NotificationsList
          notifications={notifications}
          isFetchingNextPage={isFetchingNextPage}
          hasNextPage={hasNextPage}
          fetchNextPage={fetchNextPage}
          onRowClick={handleRowClick}
        />
      )}
    </div>
  )
}

// ─── Loading Skeleton ───────────────────────────────────────────────────────

function NotificationsLoadingSkeleton() {
  return (
    <div className="flex flex-col rounded-md">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="flex h-[44px] items-center px-4">
          <Skeleton className="h-4 w-full max-w-md" />
        </div>
      ))}
    </div>
  )
}

// ─── Empty State ────────────────────────────────────────────────────────────

function NotificationsEmptyState({ activeTab }: { activeTab: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-md p-6 text-center">
      <p className="text-sm font-medium">No notifications yet</p>
      <p className="text-xs text-muted-foreground">
        {activeTab !== "all"
          ? "No notifications match this filter."
          : "You'll receive notifications when security reviews are completed or risks are detected."}
      </p>
    </div>
  )
}
