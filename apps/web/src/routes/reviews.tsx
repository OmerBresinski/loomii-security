import { useCallback, useEffect, useMemo, useRef } from "react"
import { useSearch, useNavigate } from "@tanstack/react-router"
import { useVirtualizer } from "@tanstack/react-virtual"
import { Skeleton } from "@/components/ui/skeleton"
import { ReviewCard } from "@/components/reviews/review-card"
import { ReviewFiltersBar } from "@/components/reviews/review-filters"
import { ReviewSearch } from "@/components/reviews/review-search"
import { useReviews, type ReviewFilters } from "@/queries/reviews"

// ─── Page ───────────────────────────────────────────────────────────────────

export default function ReviewsPage() {
  const search = useSearch({ strict: false }) as Record<string, string | undefined>
  const navigate = useNavigate()

  // Parse URL search params into filters
  const filters: ReviewFilters = useMemo(() => ({
    status: search.status ? search.status.split(",") : undefined,
    riskLevel: search.riskLevel ? search.riskLevel.split(",") : undefined,
    search: search.q || undefined,
  }), [search.status, search.riskLevel, search.q])

  // Update URL when filters change
  const setFilters = useCallback(
    (next: ReviewFilters) => {
      navigate({
        search: {
          ...(next.status && next.status.length > 0 ? { status: next.status.join(",") } : {}),
          ...(next.riskLevel && next.riskLevel.length > 0 ? { riskLevel: next.riskLevel.join(",") } : {}),
          ...(next.search ? { q: next.search } : {}),
        } as any,
        replace: true,
      })
    },
    [navigate]
  )

  const setSearch = useCallback(
    (q: string) => {
      setFilters({ ...filters, search: q || undefined })
    },
    [filters, setFilters]
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

  // Virtualizer
  const parentRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: hasNextPage ? allReviews.length + 1 : allReviews.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 120,
    overscan: 5,
  })

  const virtualItems = virtualizer.getVirtualItems()

  // Infinite scroll: fetch next page when last item is visible
  useEffect(() => {
    const lastItem = virtualItems[virtualItems.length - 1]
    if (!lastItem) return

    if (
      lastItem.index >= allReviews.length - 1 &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      fetchNextPage()
    }
  }, [virtualItems, allReviews.length, hasNextPage, isFetchingNextPage, fetchNextPage])

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-3 border-b px-6 py-3">
        <ReviewSearch value={filters.search ?? ""} onChange={setSearch} />
        <ReviewFiltersBar filters={filters} onFiltersChange={setFilters} />
      </div>

      {/* Feed */}
      {isPending ? (
        <div className="flex flex-col gap-3 p-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[100px] w-full rounded-md" />
          ))}
        </div>
      ) : allReviews.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
          <p className="text-sm font-medium">No reviews found</p>
          <p className="text-xs text-muted-foreground">
            {filters.search || filters.status?.length || filters.riskLevel?.length
              ? "Try adjusting your filters or search query."
              : "Security reviews will appear here once your integrations are connected."}
          </p>
        </div>
      ) : (
        <div ref={parentRef} className="flex-1 overflow-y-auto">
          <div
            className="relative w-full"
            style={{ height: `${virtualizer.getTotalSize()}px` }}
          >
            {virtualItems.map((virtualRow) => {
              const isLoaderRow = virtualRow.index >= allReviews.length

              return (
                <div
                  key={virtualRow.key}
                  className="absolute left-0 top-0 w-full px-6 py-1.5"
                  style={{
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {isLoaderRow ? (
                    <Skeleton className="h-[100px] w-full rounded-md" />
                  ) : (
                    <ReviewCard review={allReviews[virtualRow.index]} />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
