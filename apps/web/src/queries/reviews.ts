import {
  infiniteQueryOptions,
  queryOptions,
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
} from "@tanstack/react-query"
import { fetchApi } from "@/lib/api-client"

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Review {
  id: string
  eventId: string
  status: "ASSEMBLING" | "READY" | "REVIEWING" | "COMPLETED" | "FAILED"
  reviewStatus: "PENDING" | "GENERATING" | "DRAFT" | "IN_REVIEW" | "APPROVED" | "REJECTED" | "PUBLISHED" | null
  riskLevel: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO" | null
  title: string | null
  summary: string | null
  findingCount: number
  source: "LINEAR" | "NOTION" | "GITHUB"
  externalId: string
  project: { id: string; name: string } | null
  createdAt: string
  updatedAt: string
}

export interface Finding {
  id: string
  type: "THREAT" | "REQUIREMENT" | "MITIGATION" | "OBSERVATION"
  title: string
  description: string | null
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | null
  strideCategory: string | null
  effortEstimate: string | null
  status: "OPEN" | "ACCEPTED" | "REJECTED" | "RESOLVED" | "DEFERRED"
}

export interface ReviewDetail {
  id: string
  status: "ASSEMBLING" | "READY" | "REVIEWING" | "COMPLETED" | "FAILED"
  riskLevel: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO" | null
  title: string | null
  summary: string | null
  confidence: number | null
  source: "LINEAR" | "NOTION" | "GITHUB"
  externalId: string
  reviewId: string | null
  reviewStatus: string | null
  createdAt: string
  findings: Finding[]
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

// ─── Query Key Factory ──────────────────────────────────────────────────────

export const reviewKeys = {
  all: ["reviews"] as const,
  lists: () => [...reviewKeys.all, "list"] as const,
  detail: (id: string) => [...reviewKeys.all, id] as const,
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
    staleTime: 10_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    placeholderData: keepPreviousData,
  })
}

/** Single review detail with findings */
export function reviewDetailQueryOptions(reviewId: string) {
  return queryOptions({
    queryKey: reviewKeys.detail(reviewId),
    queryFn: ({ signal }) =>
      fetchApi<ReviewDetail>(`/api/v1/reviews/${reviewId}`, { signal }),
    enabled: reviewId.length > 0,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  })
}

// ─── Hooks ──────────────────────────────────────────────────────────────────

export function useReviews(filters: ReviewFilters) {
  return useInfiniteQuery(reviewsInfiniteQueryOptions(filters))
}

export function useReviewDetail(reviewId: string) {
  return useQuery({
    ...reviewDetailQueryOptions(reviewId),
    placeholderData: keepPreviousData,
  })
}
