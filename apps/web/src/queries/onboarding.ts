import { queryOptions, useQuery } from "@tanstack/react-query"
import { fetchApi } from "@/lib/api-client"

// ─── Types ──────────────────────────────────────────────────────────────────

export interface OnboardingState {
  currentStep: number
  completed: boolean
  linearConnected: boolean
  notionConnected: boolean
  policiesConfigured: boolean
  monitoringConfigured: boolean
  syncCompleted: boolean
}

export interface OnboardingStateResponse {
  onboarding: OnboardingState
}

export interface LinearProject {
  id: string
  name: string
  teamName: string
}

export interface LinearTeam {
  id: string
  name: string
  key: string
}

export interface NotionPage {
  id: string
  title: string
  icon: string | null
  parentTitle: string | null
}

export interface MonitoringScopeResponse {
  linearTeams: LinearTeam[]
  linearProjects: LinearProject[]
  notionPages: NotionPage[]
}

export interface SyncStatus {
  status: "idle" | "syncing" | "completed" | "error"
  progress: number
  message: string
}

// ─── Query Key Factory ──────────────────────────────────────────────────────

export const onboardingKeys = {
  all: ["onboarding"] as const,
  state: () => [...onboardingKeys.all, "state"] as const,
  scope: () => [...onboardingKeys.all, "scope"] as const,
  sync: () => [...onboardingKeys.all, "sync"] as const,
}

// ─── Query Options ──────────────────────────────────────────────────────────

export function onboardingStateQueryOptions() {
  return queryOptions({
    queryKey: onboardingKeys.state(),
    queryFn: ({ signal }) =>
      fetchApi<OnboardingStateResponse>("/api/v1/onboarding", { signal }),
    staleTime: 10_000,
  })
}

export function monitoringScopeQueryOptions() {
  return queryOptions({
    queryKey: onboardingKeys.scope(),
    queryFn: ({ signal }) =>
      fetchApi<MonitoringScopeResponse>("/api/v1/onboarding/scope", { signal }),
    staleTime: 30_000,
  })
}

export function syncStatusQueryOptions(enabled: boolean) {
  return queryOptions({
    queryKey: onboardingKeys.sync(),
    queryFn: ({ signal }) =>
      fetchApi<SyncStatus>("/api/v1/onboarding/sync/status", { signal }),
    refetchInterval: enabled ? 2_000 : false,
    staleTime: 0,
    enabled,
  })
}

// ─── Hooks ──────────────────────────────────────────────────────────────────

export function useOnboardingState() {
  return useQuery(onboardingStateQueryOptions())
}

export function useMonitoringScope() {
  return useQuery(monitoringScopeQueryOptions())
}

export function useSyncStatus(enabled: boolean) {
  return useQuery(syncStatusQueryOptions(enabled))
}
