import { queryOptions, useQuery } from "@tanstack/react-query"
import { fetchApi } from "@/lib/api-client"

// ─── Types ──────────────────────────────────────────────────────────────────

export interface UsageBreakdown {
  model?: string
  operation?: string
  costCents: number
  totalTokens: number
  requests: number
}

export interface UsageTotals {
  costCents: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  requests: number
}

export interface UsageResponse {
  allTime: UsageTotals
  last30Days: UsageTotals
  byModel: UsageBreakdown[]
  byOperation: UsageBreakdown[]
}

export interface DailyUsage {
  date: string
  costCents: number
  totalTokens: number
  requests: number
}

export interface DailyUsageResponse {
  daily: DailyUsage[]
}

// ─── Query Options ──────────────────────────────────────────────────────────

export function usageQueryOptions() {
  return queryOptions({
    queryKey: ["usage"],
    queryFn: ({ signal }) => fetchApi<UsageResponse>("/api/v1/usage", { signal }),
    staleTime: 60_000,
  })
}

export function dailyUsageQueryOptions() {
  return queryOptions({
    queryKey: ["usage", "daily"],
    queryFn: ({ signal }) => fetchApi<DailyUsageResponse>("/api/v1/usage/daily", { signal }),
    staleTime: 60_000,
  })
}

// ─── Hooks ──────────────────────────────────────────────────────────────────

export function useUsage() {
  return useQuery(usageQueryOptions())
}

export function useDailyUsage() {
  return useQuery(dailyUsageQueryOptions())
}
