import {
  infiniteQueryOptions,
  keepPreviousData,
  useInfiniteQuery,
} from "@tanstack/react-query"
import { fetchApi } from "@/lib/api-client"

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Review {
  id: string
  eventId: string
  status: "ASSEMBLING" | "READY" | "REVIEWING" | "COMPLETED" | "FAILED"
  riskLevel: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO" | null
  title: string | null
  summary: string | null
  findingCount: number
  createdAt: string
  updatedAt: string
}

export interface ReviewListResponse {
  data: Review[]
  nextCursor: string | null
  hasMore: boolean
}

export interface ReviewFilters {
  status?: string[]
  riskLevel?: string[]
  search?: string
}

// ─── Query Options ──────────────────────────────────────────────────────────

function buildQueryParams(filters: ReviewFilters, cursor: string | null): string {
  const params = new URLSearchParams()

  if (filters.status && filters.status.length > 0) {
    params.set("status", filters.status.join(","))
  }
  if (filters.riskLevel && filters.riskLevel.length > 0) {
    params.set("riskLevel", filters.riskLevel.join(","))
  }
  if (filters.search) {
    params.set("search", filters.search)
  }
  if (cursor) {
    params.set("cursor", cursor)
  }

  params.set("limit", "20")
  const str = params.toString()
  return str ? `?${str}` : ""
}

export function reviewsInfiniteQueryOptions(filters: ReviewFilters) {
  return infiniteQueryOptions({
    queryKey: ["reviews", filters] as const,
    queryFn: ({ pageParam, signal }) =>
      fetchApi<ReviewListResponse>(
        `/api/v1/reviews${buildQueryParams(filters, pageParam)}`,
        { signal }
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: 4_000,
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
    placeholderData: keepPreviousData,
  })
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useReviews(filters: ReviewFilters) {
  return useInfiniteQuery(reviewsInfiniteQueryOptions(filters))
}
