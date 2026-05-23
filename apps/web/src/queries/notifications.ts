import { queryOptions, useQuery } from "@tanstack/react-query"
import { fetchApi } from "@/lib/api-client"

// ─── Types ──────────────────────────────────────────────────────────────────

export interface UnreadCountResponse {
  count: number
  byType: Record<string, number>
}

// ─── Query Key Factory ──────────────────────────────────────────────────────

export const notificationKeys = {
  all: ["notifications"] as const,
  unreadCount: () => [...notificationKeys.all, "unread-count"] as const,
  list: () => [...notificationKeys.all, "list"] as const,
}

// ─── Query Options ──────────────────────────────────────────────────────────

export function unreadCountQueryOptions() {
  return queryOptions({
    queryKey: notificationKeys.unreadCount(),
    queryFn: ({ signal }) =>
      fetchApi<UnreadCountResponse>("/api/v1/notifications/unread-count", {
        signal,
      }),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
  })
}

// ─── Hooks ──────────────────────────────────────────────────────────────────

/**
 * Polls the unread notification count every 30 seconds.
 * Refetches on window focus for immediate updates after tab switch.
 */
export function useUnreadCount() {
  return useQuery(unreadCountQueryOptions())
}
