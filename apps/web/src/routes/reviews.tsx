import { useCallback, useEffect, useMemo, useRef } from "react"
import { useSearch, useNavigate } from "@tanstack/react-router"
import { useVirtualizer } from "@tanstack/react-virtual"
import { Skeleton } from "@/components/ui/skeleton"
import { ReviewRow } from "@/components/reviews/review-card"
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
  const rowCount = allReviews.length
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,
    overscan: 5,
  })

  const virtualItems = virtualizer.getVirtualItems()

  // Infinite scroll: fetch next page when user scrolls near the bottom
  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) return

    const scrollEl = parentRef.current
    if (!scrollEl) return

    function onScroll() {
      if (!scrollEl || !hasNextPage || isFetchingNextPage) return
      const { scrollTop, scrollHeight, clientHeight } = scrollEl
      // Trigger when within 200px of the bottom
      if (scrollHeight - scrollTop - clientHeight < 200) {
        fetchNextPage()
      }
    }

    scrollEl.addEventListener("scroll", onScroll, { passive: true })
    return () => scrollEl.removeEventListener("scroll", onScroll)
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col overflow-hidden p-6">
      {/* Toolbar */}
      <div className="flex items-center gap-3 pb-4">
        <ReviewSearch value={filters.search ?? ""} onChange={setSearch} />
        <ReviewFiltersBar filters={filters} onFiltersChange={setFilters} />
      </div>

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
              {virtualItems.map((virtualRow) => (
                <div
                  key={virtualRow.key}
                  className="absolute left-0 top-0 w-full"
                  style={{
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <ReviewRow review={allReviews[virtualRow.index]} />
                </div>
              ))}
            </div>
            {isFetchingNextPage && (
              <div className="flex h-12 items-center justify-center text-xs text-muted-foreground">
                Loading more...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
