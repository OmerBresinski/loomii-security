import { useCallback } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  notificationsInfiniteQueryOptions,
  type NotificationFilters,
} from "@/queries/notifications"
import { useMarkAllAsRead } from "@/mutations/notifications"

// ─── Constants ──────────────────────────────────────────────────────────────

const FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "review_completed", label: "Reviews" },
  { value: "high_risk_detected", label: "Critical" },
  { value: "source_linked", label: "Sources" },
  { value: "summary_updated", label: "Summaries" },
] as const

// ─── Component ──────────────────────────────────────────────────────────────

interface NotificationsToolbarProps {
  activeTab: string
  onTabChange: (value: string) => void
  hasNotifications: boolean
}

export function NotificationsToolbar({
  activeTab,
  onTabChange,
  hasNotifications,
}: NotificationsToolbarProps) {
  const queryClient = useQueryClient()
  const markAllRead = useMarkAllAsRead()

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

  return (
    <div className="flex items-center gap-3 pb-4">
      <Tabs
        value={activeTab}
        onValueChange={onTabChange}
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
      {hasNotifications && (
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
  )
}
