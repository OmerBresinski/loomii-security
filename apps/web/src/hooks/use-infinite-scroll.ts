import { useEffect, useRef, type RefObject } from "react"

interface UseInfiniteScrollOptions {
  hasNextPage: boolean
  isFetchingNextPage: boolean
  fetchNextPage: () => void
  /** Pass an existing scroll container ref (e.g. from virtualizer) */
  scrollRef?: RefObject<HTMLDivElement | null>
  rootMargin?: string
}

/**
 * Sets up an IntersectionObserver on a sentinel element for infinite scroll.
 * Returns a sentinelRef to attach to a zero-height element at the list bottom.
 * Optionally accepts an external scrollRef; creates one internally if not provided.
 */
export function useInfiniteScroll({
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  scrollRef: externalScrollRef,
  rootMargin = "200px",
}: UseInfiniteScrollOptions) {
  const internalScrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const scrollRef = externalScrollRef ?? internalScrollRef

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
      { root: scrollRef.current, rootMargin }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, rootMargin, scrollRef])

  return { scrollRef, sentinelRef }
}
