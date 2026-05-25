import { useCallback, useEffect, useMemo, useRef } from "react"
import { getRouteApi, useNavigate } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { useVirtualizer } from "@tanstack/react-virtual"
import { Skeleton } from "@/components/ui/skeleton"
import { ReviewRow } from "@/components/reviews/review-card"
import { ReviewFiltersBar } from "@/components/reviews/review-filters"
import { ReviewSearch } from "@/components/reviews/review-search"
import { ReviewSheet } from "@/components/reviews/review-sheet"
import { BackfillBanner } from "@/components/reviews/backfill-banner"
import {
  useReviews,
  reviewDetailQueryOptions,
  type ReviewFilters,
} from "@/queries/reviews"

// ─── Page ───────────────────────────────────────────────────────────────────

const routeApi = getRouteApi("/reviews")

const EMPTY_SEARCH = { status: undefined, riskLevel: undefined, q: undefined, review: undefined }

export default function ReviewsPage() {
  const rawSearch = routeApi.useSearch()
  const search = rawSearch ?? EMPTY_SEARCH
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // Parse URL search params into filters
  const filters: ReviewFilters = useMemo(() => ({
    status: search.status ? search.status.split(",") : undefined,
    riskLevel: search.riskLevel ? search.riskLevel.split(",") : undefined,
    search: search.q || undefined,
  }), [search.status, search.riskLevel, search.q])

  // Active review ID from URL
  const activeReviewId = search.review ?? null

  // Use ref for current search state to avoid stale closures in callbacks
  const searchRef = useRef(search)
  searchRef.current = search

  // Update URL when filters change (preserves review param)
  const setFilters = useCallback(
    (next: ReviewFilters) => {
      const current = searchRef.current
      navigate({
        search: {
          status: next.status && next.status.length > 0 ? next.status.join(",") : undefined,
          riskLevel: next.riskLevel && next.riskLevel.length > 0 ? next.riskLevel.join(",") : undefined,
          q: next.search || undefined,
          review: current.review,
        },
        replace: true,
      })
    },
    [navigate]
  )

  const setSearch = useCallback(
    (q: string) => {
      const current = searchRef.current
      navigate({
        search: {
          status: current.status,
          riskLevel: current.riskLevel,
          q: q || undefined,
          review: current.review,
        },
        replace: true,
      })
    },
    [navigate]
  )

  // Open/close sheet via URL — stable callbacks using ref
  const openSheet = useCallback(
    (reviewId: string) => {
      const current = searchRef.current
      const nextReviewId = reviewId === current.review ? undefined : reviewId
      navigate({
        search: {
          status: current.status,
          riskLevel: current.riskLevel,
          q: current.q,
          review: nextReviewId,
        },
        replace: true,
      })
    },
    [navigate]
  )

  const closeSheet = useCallback(() => {
    const current = searchRef.current
    navigate({
      search: {
        status: current.status,
        riskLevel: current.riskLevel,
        q: current.q,
        review: undefined,
      },
      replace: true,
    })
  }, [navigate])

  // Prefetch review detail on hover
  const prefetchReview = useCallback(
    (reviewId: string) => {
      queryClient.prefetchQuery(reviewDetailQueryOptions(reviewId))
    },
    [queryClient]
  )

  // Query
  const {
    data,
    isPending,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useReviews(filters)

  // Flatten pages into a single array
  const allReviews = useMemo(
    () => data?.pages.flatMap((page) => page.data) ?? [],
    [data]
  )

  // Find the active review from list data (for cache seeding)
  const activeListReview = useMemo(
    () => (activeReviewId ? allReviews.find((r) => r.id === activeReviewId) ?? null : null),
    [allReviews, activeReviewId]
  )

  // Virtualizer
  const parentRef = useRef<HTMLDivElement>(null)
  const rowCount = allReviews.length
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,
    overscan: 5,
  })

  const virtualItems = virtualizer.getVirtualItems()

  // Infinite scroll: use IntersectionObserver on a sentinel element
  const sentinelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) return

    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          fetchNextPage()
        }
      },
      { root: parentRef.current, rootMargin: "200px" }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col overflow-hidden p-6">
      {/* Toolbar */}
      <div className="flex items-center gap-3 pb-4">
        <ReviewSearch value={filters.search ?? ""} onChange={setSearch} />
        <ReviewFiltersBar filters={filters} onFiltersChange={setFilters} />
      </div>

      {/* Backfill complete banner (dismissable, post-onboarding) */}
      <BackfillBanner />

      {/* Table */}
      {isPending ? (
        <div className="flex flex-col rounded-md">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="flex h-12 items-center px-4">
              <Skeleton className="h-4 w-full max-w-md" />
            </div>
          ))}
        </div>
      ) : allReviews.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-md p-6 text-center">
          <p className="text-sm font-medium">No reviews found</p>
          <p className="text-xs text-muted-foreground">
            {filters.search || filters.status?.length || filters.riskLevel?.length
              ? "Try adjusting your filters or search query."
              : "Security reviews will appear here once your integrations are connected."}
          </p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col rounded-md">
          {/* Scrollable rows */}
          <div ref={parentRef} className="min-h-0 flex-1 overflow-y-auto">
            <div
              className="relative w-full"
              style={{ height: `${virtualizer.getTotalSize()}px` }}
            >
              {virtualItems.map((virtualRow) => {
                const review = allReviews[virtualRow.index]
                return (
                  <div
                    key={virtualRow.key}
                    className="absolute left-0 top-0 w-full"
                    style={{
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    onClick={() => openSheet(review.id)}
                    onMouseEnter={() => prefetchReview(review.id)}
                  >
                    <ReviewRow review={review} />
                  </div>
                )
              })}
            </div>
            {isFetchingNextPage && (
              <div className="flex h-12 items-center justify-center text-xs text-muted-foreground">
                Loading more...
              </div>
            )}
            {/* Sentinel element for IntersectionObserver infinite scroll */}
            <div ref={sentinelRef} aria-hidden className="h-px" />
          </div>
        </div>
      )}

      {/* Review Side Sheet */}
      <ReviewSheet
        reviewId={activeReviewId}
        listReview={activeListReview}
        onClose={closeSheet}
      />
    </div>
  )
}
