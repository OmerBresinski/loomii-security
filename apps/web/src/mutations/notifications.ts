import { type InfiniteData, useMutation, useQueryClient } from "@tanstack/react-query"
import { fetchApi } from "@/lib/api-client"
import {
  notificationKeys,
  type NotificationItem,
  type NotificationListResponse,
  type UnreadCountResponse,
} from "@/queries/notifications"

// ─── Types ──────────────────────────────────────────────────────────────────

interface MarkAsReadResponse {
  id: string
  read: boolean
}

interface MarkAllAsReadResponse {
  success: boolean
}

type NotificationPages = InfiniteData<NotificationListResponse, string | undefined>

// ─── Helpers ────────────────────────────────────────────────────────────────

function mapNotifications(
  old: NotificationPages | undefined,
  transform: (n: NotificationItem) => NotificationItem
): NotificationPages | undefined {
  if (!old) return old
  return {
    ...old,
    pages: old.pages.map((page) => ({
      ...page,
      notifications: page.notifications.map(transform),
    })),
  }
}

// ─── Mark Single Notification as Read ───────────────────────────────────────

/**
 * Optimistically marks a single notification as read.
 * - Updates the infinite list cache to flip `read: true`
 * - Decrements the unread count badge
 * - On error: invalidates all notification queries to revert
 */
export function useMarkAsRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["notifications", "mark-read"],
    mutationFn: (id: string) =>
      fetchApi<MarkAsReadResponse>(`/api/v1/notifications/${id}/read`, {
        method: "PATCH",
      }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.all })

      // Optimistically update all list caches (any filter variant)
      queryClient.setQueriesData<NotificationPages>(
        { queryKey: notificationKeys.list() },
        (old) => mapNotifications(old, (n) =>
          n.id === id ? { ...n, read: true } : n
        )
      )

      // Optimistically decrement unread count
      queryClient.setQueryData<UnreadCountResponse>(
        notificationKeys.unreadCount(),
        (old) => {
          if (!old || old.count <= 0) return old
          return { ...old, count: old.count - 1 }
        }
      )
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all })
    },
  })
}

// ─── Mark All Notifications as Read ─────────────────────────────────────────

/**
 * Optimistically marks all notifications as read.
 * - Updates all list caches to flip every item to `read: true`
 * - Sets the unread count to 0 with all byType values zeroed
 * - On error: invalidates all notification queries to revert
 */
export function useMarkAllAsRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["notifications", "mark-all-read"],
    mutationFn: () =>
      fetchApi<MarkAllAsReadResponse>("/api/v1/notifications/read-all", {
        method: "POST",
      }),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.all })

      // Mark all items as read in all list caches
      queryClient.setQueriesData<NotificationPages>(
        { queryKey: notificationKeys.list() },
        (old) => mapNotifications(old, (n) => ({ ...n, read: true }))
      )

      // Set unread count to 0
      queryClient.setQueryData<UnreadCountResponse>(
        notificationKeys.unreadCount(),
        {
          count: 0,
          byType: {
            review_completed: 0,
            high_risk_detected: 0,
            source_linked: 0,
            source_archived: 0,
            summary_updated: 0,
          },
        }
      )
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all })
    },
  })
}
