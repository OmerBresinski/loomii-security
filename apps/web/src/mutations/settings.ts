import { useMutation, useQueryClient } from "@tanstack/react-query"
import { fetchApi } from "@/lib/api-client"
import {
  settingsKeys,
  type NotificationPreferencesResponse,
  type TeamMembersResponse,
  type TeamMember,
} from "@/queries/settings"
import type { UserRole } from "@/lib/api-client"

// ─── Notification Preference Toggle ────────────────────────────────────────

export function useToggleNotificationPreference() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["settings", "notifications", "toggle"],
    mutationFn: ({ type, enabled }: { type: string; enabled: boolean }) =>
      fetchApi<{ type: string; enabled: boolean }>(
        "/api/v1/settings/notifications",
        { method: "PATCH", body: { type, enabled } }
      ),

    onMutate: async ({ type, enabled }) => {
      await queryClient.cancelQueries({
        queryKey: settingsKeys.notifications(),
      })

      const previous =
        queryClient.getQueryData<NotificationPreferencesResponse>(
          settingsKeys.notifications()
        )

      if (previous) {
        queryClient.setQueryData<NotificationPreferencesResponse>(
          settingsKeys.notifications(),
          {
            preferences: previous.preferences.map((p) =>
              p.type === type ? { ...p, enabled } : p
            ),
          }
        )
      }

      return { previous }
    },

    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          settingsKeys.notifications(),
          context.previous
        )
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.notifications() })
    },
  })
}

// ─── Disconnect Integration ─────────────────────────────────────────────────

export function useDisconnectIntegration() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["settings", "integrations", "disconnect"],
    mutationFn: (integrationId: string) =>
      fetchApi<{ success: boolean }>(
        `/api/v1/settings/integrations/${integrationId}`,
        { method: "DELETE" }
      ),

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.integrations() })
    },
  })
}

// ─── Update Member Role ─────────────────────────────────────────────────────

export function useUpdateMemberRole() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["settings", "team", "updateRole"],
    mutationFn: ({
      memberId,
      role,
    }: {
      memberId: string
      role: UserRole
    }) =>
      fetchApi<{ id: string; role: UserRole }>(
        `/api/v1/settings/team/${memberId}/role`,
        { method: "PATCH", body: { role } }
      ),

    onMutate: async ({ memberId, role }) => {
      await queryClient.cancelQueries({ queryKey: settingsKeys.team() })

      const previous = queryClient.getQueryData<TeamMembersResponse>(
        settingsKeys.team()
      )

      if (previous) {
        queryClient.setQueryData<TeamMembersResponse>(settingsKeys.team(), {
          members: previous.members.map((m) =>
            m.id === memberId ? { ...m, role } : m
          ),
        })
      }

      return { previous }
    },

    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(settingsKeys.team(), context.previous)
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.team() })
    },
  })
}

// ─── Invite Member ──────────────────────────────────────────────────────────

export function useInviteMember() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["settings", "team", "invite"],
    mutationFn: ({ email, role }: { email: string; role: UserRole }) =>
      fetchApi<TeamMember>("/api/v1/settings/team/invite", {
        method: "POST",
        body: { email, role },
      }),

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.team() })
    },
  })
}
