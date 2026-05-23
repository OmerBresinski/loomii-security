import {
  queryOptions,
  useQuery,
  infiniteQueryOptions,
  useInfiniteQuery,
} from "@tanstack/react-query"
import { fetchApi } from "@/lib/api-client"

// ─── Types ──────────────────────────────────────────────────────────────────

export interface UnreadCountResponse {
  count: number
  byType: Record<string, number>
}

export interface NotificationItem {
  id: string
  type: string
  title: string
  body: string
  linkUrl: string | null
  read: boolean
  createdAt: string
}

export interface NotificationListResponse {
  notifications: NotificationItem[]
  nextCursor: string | null
}

export interface NotificationFilters {
  unread?: boolean
  type?: string
}

// ─── Query Key Factory ──────────────────────────────────────────────────────

export const notificationKeys = {
  all: ["notifications"] as const,
  unreadCount: () => [...notificationKeys.all, "unread-count"] as const,
  list: (filters?: NotificationFilters) =>
    [...notificationKeys.all, "list", filters ?? {}] as const,
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

export function notificationsInfiniteQueryOptions(
  filters?: NotificationFilters
) {
  return infiniteQueryOptions({
    queryKey: notificationKeys.list(filters),
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams()
      if (filters?.unread) params.set("unread", "true")
      if (filters?.type) params.set("type", filters.type)
      if (pageParam) params.set("cursor", pageParam)
      params.set("limit", "20")
      const qs = params.toString()
      return fetchApi<NotificationListResponse>(
        `/api/v1/notifications${qs ? `?${qs}` : ""}`,
        { signal }
      )
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    refetchOnWindowFocus: true,
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

/**
 * Infinite query for the notification list.
 * Supports filters: unread-only and by notification type.
 */
export function useNotifications(filters?: NotificationFilters) {
  return useInfiniteQuery(notificationsInfiniteQueryOptions(filters))
}
