import { queryOptions, useQuery } from "@tanstack/react-query"
import { fetchApi } from "@/lib/api-client"

// ─── Types ──────────────────────────────────────────────────────────────────

export interface NotificationPreference {
  type: string
  label: string
  description: string
  enabled: boolean
}

export interface NotificationPreferencesResponse {
  preferences: NotificationPreference[]
}

export interface Integration {
  id: string
  provider: "LINEAR" | "NOTION" | "GITHUB"
  workspaceName: string
  status: "ACTIVE" | "ERROR" | "EXPIRED"
  connectedAt: string
  connectedBy: string
}

export interface IntegrationsResponse {
  integrations: Integration[]
}

export interface TeamMember {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  role: "ADMIN" | "SECURITY_LEAD" | "DEVELOPER" | "VIEWER"
  lastActiveAt: string | null
  createdAt: string
}

export interface TeamMembersResponse {
  members: TeamMember[]
}

// ─── Query Key Factory ──────────────────────────────────────────────────────

export const settingsKeys = {
  all: ["settings"] as const,
  notifications: () => [...settingsKeys.all, "notifications"] as const,
  integrations: () => [...settingsKeys.all, "integrations"] as const,
  team: () => [...settingsKeys.all, "team"] as const,
}

// ─── Query Options ──────────────────────────────────────────────────────────

export function notificationPreferencesQueryOptions() {
  return queryOptions({
    queryKey: settingsKeys.notifications(),
    queryFn: ({ signal }) =>
      fetchApi<NotificationPreferencesResponse>(
        "/api/v1/settings/notifications",
        { signal }
      ),
    staleTime: 60_000,
  })
}

export function integrationsQueryOptions() {
  return queryOptions({
    queryKey: settingsKeys.integrations(),
    queryFn: ({ signal }) =>
      fetchApi<IntegrationsResponse>("/api/v1/settings/integrations", {
        signal,
      }),
    staleTime: 30_000,
  })
}

export function teamMembersQueryOptions() {
  return queryOptions({
    queryKey: settingsKeys.team(),
    queryFn: ({ signal }) =>
      fetchApi<TeamMembersResponse>("/api/v1/settings/team", { signal }),
    staleTime: 30_000,
  })
}

// ─── Hooks ──────────────────────────────────────────────────────────────────

export function useNotificationPreferences() {
  return useQuery(notificationPreferencesQueryOptions())
}

export function useIntegrations() {
  return useQuery(integrationsQueryOptions())
}

export function useTeamMembers() {
  return useQuery(teamMembersQueryOptions())
}
