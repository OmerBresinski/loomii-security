import { queryOptions, useQuery, keepPreviousData } from "@tanstack/react-query"
import { fetchApi } from "@/lib/api-client"
import type {
  ProjectListResponse,
  ProjectDetail,
} from "@loomii/shared"

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ProjectSource {
  id: string
  sourceType: "NOTION_PAGE" | "LINEAR_ISSUE"
  sourceId: string
  sourceUrl: string | null
  title: string | null
  isArchived: boolean
  linkedAt: string
}

export interface ProjectSourcesResponse {
  sources: ProjectSource[]
}

export interface ProjectReview {
  id: string
  status: "ASSEMBLING" | "READY" | "REVIEWING" | "COMPLETED" | "FAILED"
  reviewStatus: string | null
  riskLevel: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO" | null
  title: string | null
  summary: string | null
  findingCount: number
  source: "LINEAR" | "NOTION" | "GITHUB"
  externalId: string
  createdAt: string
}

export interface ProjectReviewsResponse {
  reviews: ProjectReview[]
}

export interface ReviewFilters {
  status?: string[]
  riskLevel?: string[]
}

export interface ProjectActivity {
  id: string
  type: string
  description: string
  createdAt: string
  actor: string | null
}

export interface ProjectActivityResponse {
  activity: ProjectActivity[]
}

export interface SourceSearchResult {
  id: string
  sourceType: "NOTION_PAGE" | "LINEAR_ISSUE"
  sourceId: string
  title: string
  provider: "LINEAR" | "NOTION"
}

export interface SourceSearchResponse {
  results: SourceSearchResult[]
}

// ─── Query Key Factory ──────────────────────────────────────────────────────

export const projectKeys = {
  all: ["projects"] as const,
  detail: (id: string) => ["projects", id] as const,
  sources: (id: string) => ["projects", id, "sources"] as const,
  reviews: (id: string, filters?: ReviewFilters) =>
    ["projects", id, "reviews", filters] as const,
  activity: (id: string) => ["projects", id, "activity"] as const,
  sourceSearch: (query: string, type?: string) =>
    ["sources", "search", query, type] as const,
}

// ─── Query Options ──────────────────────────────────────────────────────────

/** All projects list – polls every 30s */
export function projectsQueryOptions() {
  return queryOptions({
    queryKey: projectKeys.all,
    queryFn: ({ signal }) =>
      fetchApi<ProjectListResponse>("/api/v1/projects", { signal }),
    staleTime: 30_000,
    refetchInterval: 30_000,
  })
}

/** Single project detail */
export function projectDetailQueryOptions(projectId: string) {
  return queryOptions({
    queryKey: projectKeys.detail(projectId),
    queryFn: ({ signal }) =>
      fetchApi<ProjectDetail>(`/api/v1/projects/${projectId}`, { signal }),
    enabled: projectId.length > 0,
    staleTime: 10_000,
  })
}

/** Sources linked to a project */
export function projectSourcesQueryOptions(projectId: string) {
  return queryOptions({
    queryKey: projectKeys.sources(projectId),
    queryFn: ({ signal }) =>
      fetchApi<ProjectSourcesResponse>(
        `/api/v1/projects/${projectId}/sources`,
        { signal }
      ),
    enabled: projectId.length > 0,
    staleTime: 10_000,
  })
}

/** Reviews for a project – polls every 5s */
export function projectReviewsQueryOptions(
  projectId: string,
  filters?: ReviewFilters
) {
  const params = new URLSearchParams()
  if (filters?.status && filters.status.length > 0) {
    params.set("status", filters.status.join(","))
  }
  if (filters?.riskLevel && filters.riskLevel.length > 0) {
    params.set("riskLevel", filters.riskLevel.join(","))
  }
  const qs = params.toString()
  const path = `/api/v1/projects/${projectId}/reviews${qs ? `?${qs}` : ""}`

  return queryOptions({
    queryKey: projectKeys.reviews(projectId, filters),
    queryFn: ({ signal }) =>
      fetchApi<ProjectReviewsResponse>(path, { signal }),
    enabled: projectId.length > 0,
    staleTime: 5_000,
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
    placeholderData: keepPreviousData,
  })
}

/** Activity feed for a project */
export function projectActivityQueryOptions(projectId: string) {
  return queryOptions({
    queryKey: projectKeys.activity(projectId),
    queryFn: ({ signal }) =>
      fetchApi<ProjectActivityResponse>(
        `/api/v1/projects/${projectId}/activity`,
        { signal }
      ),
  })
}

/** Source search – enabled only when query >= 2 chars, stale for 10s */
export function sourceSearchQueryOptions(query: string, type?: string) {
  const params = new URLSearchParams()
  params.set("q", query)
  if (type) params.set("type", type)
  const path = `/api/v1/sources/search?${params.toString()}`

  return queryOptions({
    queryKey: projectKeys.sourceSearch(query, type),
    queryFn: ({ signal }) => fetchApi<SourceSearchResponse>(path, { signal }),
    enabled: query.length >= 2,
    staleTime: 10_000,
  })
}

// ─── Hooks ──────────────────────────────────────────────────────────────────

export function useProjects() {
  return useQuery(projectsQueryOptions())
}

export function useProjectDetail(projectId: string) {
  return useQuery(projectDetailQueryOptions(projectId))
}

export function useProjectSources(projectId: string) {
  return useQuery(projectSourcesQueryOptions(projectId))
}

export function useProjectReviews(projectId: string, filters?: ReviewFilters) {
  return useQuery(projectReviewsQueryOptions(projectId, filters))
}

export function useProjectActivity(projectId: string) {
  return useQuery(projectActivityQueryOptions(projectId))
}

export function useSourceSearch(query: string, type?: string) {
  return useQuery(sourceSearchQueryOptions(query, type))
}
