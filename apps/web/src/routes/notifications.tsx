import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { fetchApi } from "@/lib/api-client"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import {
  useNotifications,
  notificationKeys,
  type NotificationFilters,
  type NotificationItem,
} from "@/queries/notifications"

// ─── Constants ──────────────────────────────────────────────────────────────

const NOTIFICATION_TYPE_META: Record<
  string,
  { label: string; color: string; borderColor: string }
> = {
  review_completed: {
    label: "Review",
    color: "text-sky-700 dark:text-sky-400",
    borderColor: "border-l-sky-500",
  },
  high_risk_detected: {
    label: "Critical",
    color: "text-red-700 dark:text-red-400",
    borderColor: "border-l-red-500",
  },
  source_linked: {
    label: "Source",
    color: "text-emerald-700 dark:text-emerald-400",
    borderColor: "border-l-emerald-500",
  },
  source_archived: {
    label: "Archive",
    color: "text-amber-700 dark:text-amber-400",
    borderColor: "border-l-amber-500",
  },
  summary_updated: {
    label: "Summary",
    color: "text-violet-700 dark:text-violet-400",
    borderColor: "border-l-violet-500",
  },
}

const FILTER_OPTIONS = [
  { value: undefined, label: "All" },
  { value: "unread", label: "Unread" },
  { value: "review_completed", label: "Reviews" },
  { value: "high_risk_detected", label: "Critical" },
  { value: "source_linked", label: "Sources" },
  { value: "summary_updated", label: "Summaries" },
] as const

// ─── Relative Time ──────────────────────────────────────────────────────────

function formatRelativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then

  const seconds = Math.floor(diffMs / 1000)
  if (seconds < 60) return "just now"

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  if (days === 1) return "yesterday"
  if (days < 7) return `${days}d ago`

  return new Date(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })
}

// ─── Mark All Read Mutation ─────────────────────────────────────────────────

function useMarkAllRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["notifications", "mark-all-read"],
    mutationFn: () =>
      fetchApi<{ success: boolean }>("/api/v1/notifications/read-all", {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all })
    },
  })
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const navigate = useNavigate()
  const [activeFilter, setActiveFilter] = useState<string | undefined>(
    undefined
  )

  // Build query filters from active filter chip
  const filters: NotificationFilters = useMemo(() => {
    if (activeFilter === "unread") return { unread: true }
    if (activeFilter) return { type: activeFilter }
    return {}
  }, [activeFilter])

  // Infinite query
  const { data, isPending, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useNotifications(filters)

  // Flatten pages
  const allNotifications = useMemo(
    () => data?.pages.flatMap((page) => page.notifications) ?? [],
    [data]
  )

  // Mark all read mutation
  const markAllRead = useMarkAllRead()

  // Infinite scroll sentinel
  const parentRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) return

    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          fetchNextPage()
        }
      },
      { root: parentRef.current, rootMargin: "200px" }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  // Click handler — navigate to linkUrl
  const handleClick = useCallback(
    (notification: NotificationItem) => {
      if (notification.linkUrl) {
        navigate({ to: notification.linkUrl })
      }
    },
    [navigate]
  )

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col overflow-hidden p-6">
      {/* Filter Chips + Mark All Read */}
      <div className="flex items-center justify-between pb-4">
        <div className="flex flex-wrap gap-1.5">
          {FILTER_OPTIONS.map((option) => (
            <button
              key={option.label}
              onClick={() => setActiveFilter(option.value)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                activeFilter === option.value
                  ? "border-foreground/20 bg-foreground/5 text-foreground"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        {allNotifications.length > 0 && (
          <button
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
            className="shrink-0 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            {markAllRead.isPending ? "Marking..." : "Mark all as read"}
          </button>
        )}
      </div>

      {/* List */}
      {isPending ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col gap-2 rounded-lg border border-border/50 p-4"
            >
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-full max-w-sm" />
            </div>
          ))}
        </div>
      ) : allNotifications.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg p-8 text-center">
          <p className="text-sm font-medium text-foreground">
            No notifications yet
          </p>
          <p className="text-xs text-muted-foreground">
            {activeFilter
              ? "No notifications match this filter."
              : "You'll receive notifications when security reviews are completed or risks are detected."}
          </p>
        </div>
      ) : (
        <div
          ref={parentRef}
          className="min-h-0 flex-1 overflow-y-auto rounded-lg"
        >
          <div className="flex flex-col gap-1">
            {allNotifications.map((notification) => (
              <NotificationRow
                key={notification.id}
                notification={notification}
                onClick={handleClick}
              />
            ))}
          </div>

          {isFetchingNextPage && (
            <div className="flex h-12 items-center justify-center text-xs text-muted-foreground">
              Loading more...
            </div>
          )}
          <div ref={sentinelRef} aria-hidden className="h-px" />
        </div>
      )}
    </div>
  )
}

// ─── Notification Row ───────────────────────────────────────────────────────

function NotificationRow({
  notification,
  onClick,
}: {
  notification: NotificationItem
  onClick: (notification: NotificationItem) => void
}) {
  const meta = NOTIFICATION_TYPE_META[notification.type]
  const borderColor = meta?.borderColor ?? "border-l-border"

  return (
    <button
      onClick={() => onClick(notification)}
      className={`group flex w-full items-start gap-3 rounded-lg border border-l-[3px] border-border/50 ${borderColor} bg-card p-4 text-left transition-colors hover:bg-accent/50 ${
        !notification.read ? "bg-accent/20" : ""
      }`}
    >
      {/* Unread dot */}
      <div className="flex shrink-0 pt-1.5">
        <div
          className={`size-2 rounded-full ${
            !notification.read ? "bg-primary" : "bg-transparent"
          }`}
        />
      </div>

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span
            className={`text-sm leading-tight font-medium ${
              !notification.read ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            {notification.title}
          </span>
          {meta && (
            <Badge
              variant="outline"
              className={`shrink-0 text-[10px] ${meta.color}`}
            >
              {meta.label}
            </Badge>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {notification.body}
        </p>
      </div>

      {/* Timestamp */}
      <span className="shrink-0 text-[11px] text-muted-foreground/70">
        {formatRelativeTime(notification.createdAt)}
      </span>
    </button>
  )
}
