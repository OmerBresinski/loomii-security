import { useCallback, useEffect, useMemo, useRef } from "react"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { useVirtualizer } from "@tanstack/react-virtual"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Shield01Icon,
  Alert01Icon,
  LinkSquare02Icon,
  Folder01Icon,
  FileCodeIcon,
} from "@hugeicons/core-free-icons"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  useNotifications,
  notificationsInfiniteQueryOptions,
  type NotificationFilters,
  type NotificationItem,
} from "@/queries/notifications"
import { useMarkAsRead, useMarkAllAsRead } from "@/mutations/notifications"

// ─── Constants ──────────────────────────────────────────────────────────────

const NOTIFICATION_TYPE_META: Record<string, { label: string }> = {
  review_completed: { label: "Review" },
  high_risk_detected: { label: "Critical" },
  source_linked: { label: "Source" },
  source_archived: { label: "Archive" },
  summary_updated: { label: "Summary" },
}

const FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "review_completed", label: "Reviews" },
  { value: "high_risk_detected", label: "Critical" },
  { value: "source_linked", label: "Sources" },
  { value: "summary_updated", label: "Summaries" },
] as const

// ─── Relative Time ──────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = now - then

  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`

  return new Date(dateStr).toLocaleDateString()
}

// ─── Type Icon ──────────────────────────────────────────────────────────────

const TYPE_ICONS: Record<string, { icon: typeof Shield01Icon; color: string }> = {
  review_completed: { icon: Shield01Icon, color: "#67E8F9" },
  high_risk_detected: { icon: Alert01Icon, color: "#F87171" },
  source_linked: { icon: LinkSquare02Icon, color: "#6EE7B7" },
  source_archived: { icon: Folder01Icon, color: "#FCD34D" },
  summary_updated: { icon: FileCodeIcon, color: "#A78BFA" },
}

function TypeIcon({ type }: { type: string }) {
  const config = TYPE_ICONS[type]
  if (!config) return null

  return (
    <HugeiconsIcon
      icon={config.icon}
      size={16}
      color={config.color}
    />
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // Read filter from URL search params (reactive)
  const search = useSearch({ strict: false }) as { filter?: string }
  const activeTab = search.filter ?? "all"

  // Build query filters from active tab
  const filters: NotificationFilters = useMemo(() => {
    if (activeTab === "unread") return { unread: true }
    if (activeTab && activeTab !== "all") return { type: activeTab }
    return {}
  }, [activeTab])

  // Tab change updates URL
  const handleTabChange = useCallback(
    (value: string) => {
      navigate({
        search: { filter: value === "all" ? undefined : value } as Record<
          string,
          string | undefined
        >,
        replace: true,
      })
    },
    [navigate]
  )

  // Prefetch on hover (30s stale time prevents excessive refetches)
  const prefetchFilter = useCallback(
    (filterValue: string) => {
      const f: NotificationFilters =
        filterValue === "unread"
          ? { unread: true }
          : filterValue !== "all"
            ? { type: filterValue }
            : {}
      queryClient.prefetchInfiniteQuery({
        ...notificationsInfiniteQueryOptions(f),
        staleTime: 30_000,
      })
    },
    [queryClient]
  )

  // Infinite query
  const { data, isPending, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useNotifications(filters)

  // Flatten pages
  const allNotifications = useMemo(
    () => data?.pages.flatMap((page) => page.notifications) ?? [],
    [data]
  )

  // Mark all read mutation
  const markAllRead = useMarkAllAsRead()

  // Mark single as read mutation
  const markAsRead = useMarkAsRead()

  // Virtualizer
  const parentRef = useRef<HTMLDivElement>(null)
  const rowCount = allNotifications.length
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,
    overscan: 5,
  })

  const virtualItems = virtualizer.getVirtualItems()

  // Infinite scroll sentinel
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

  // Click handler — mark as read + navigate to linkUrl
  const handleClick = useCallback(
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
      {/* Toolbar */}
      <div className="flex items-center gap-3 pb-4">
        <Tabs
          value={activeTab}
          onValueChange={handleTabChange}
          className="flex-1"
        >
          <TabsList variant="line">
            {FILTER_OPTIONS.map((option) => (
              <div
                key={option.label}
                onMouseEnter={() => prefetchFilter(option.value)}
              >
                <TabsTrigger value={option.value ?? "all"}>
                  {option.label}
                </TabsTrigger>
              </div>
            ))}
          </TabsList>
        </Tabs>
        {allNotifications.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground"
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
          >
            {markAllRead.isPending ? "Marking..." : "Mark all as read"}
          </Button>
        )}
      </div>

      {/* Table */}
      {isPending ? (
        <div className="flex flex-col rounded-md">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="flex h-12 items-center px-4">
              <Skeleton className="h-4 w-full max-w-md" />
            </div>
          ))}
        </div>
      ) : allNotifications.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-md p-6 text-center">
          <p className="text-sm font-medium">No notifications yet</p>
          <p className="text-xs text-muted-foreground">
            {activeTab !== "all"
              ? "No notifications match this filter."
              : "You'll receive notifications when security reviews are completed or risks are detected."}
          </p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col rounded-md">
          {/* Scrollable rows */}
          <div ref={parentRef} className="min-h-0 flex-1 overflow-y-auto">
            <div
              className="relative w-full"
              style={{ height: `${virtualizer.getTotalSize()}px` }}
            >
              {virtualItems.map((virtualRow) => {
                const notification = allNotifications[virtualRow.index]
                return (
                  <div
                    key={virtualRow.key}
                    className="absolute left-0 top-0 w-full"
                    style={{
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    onClick={() => handleClick(notification)}
                  >
                    <NotificationRow notification={notification} />
                  </div>
                )
              })}
            </div>
            {isFetchingNextPage && (
              <div className="flex h-12 items-center justify-center text-xs text-muted-foreground">
                Loading more...
              </div>
            )}
            {/* Sentinel element for IntersectionObserver infinite scroll */}
            <div ref={sentinelRef} aria-hidden className="h-px" />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Notification Row ───────────────────────────────────────────────────────

function NotificationRow({
  notification,
}: {
  notification: NotificationItem
}) {
  const meta = NOTIFICATION_TYPE_META[notification.type]

  return (
    <div
      className={`flex h-12 cursor-pointer items-center px-4 hover:bg-accent dark:hover:bg-[#25262A] ${
        !notification.read ? "bg-accent/30" : ""
      }`}
    >
      {/* Type icon */}
      <Tooltip>
        <TooltipTrigger>
          <div className="flex w-8 shrink-0 items-center justify-center">
            <TypeIcon type={notification.type} />
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {meta?.label ?? notification.type}
        </TooltipContent>
      </Tooltip>

      {/* Title */}
      <div className="flex w-56 shrink-0 items-center pr-4 lg:w-72">
        <span
          className={`truncate text-[13px] ${
            !notification.read ? "font-medium text-foreground" : "text-foreground"
          }`}
        >
          {notification.title}
        </span>
      </div>

      {/* Body / description preview */}
      <div className="flex min-w-0 flex-1 items-center pr-4">
        <span className="truncate text-[13px] text-muted-foreground">
          {notification.body}
        </span>
      </div>

      {/* Time */}
      <div className="flex w-16 shrink-0 items-center justify-end text-[11px] text-muted-foreground">
        {timeAgo(notification.createdAt)}
      </div>
    </div>
  )
}
