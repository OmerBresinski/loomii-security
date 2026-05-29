import { useState, useCallback, useMemo, memo } from "react"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  useProjectReviews,
  type ProjectReview,
} from "@/queries/projects"
import type { ReviewFilters } from "@/queries/reviews"
import { reviewDetailQueryOptions, type Review } from "@/queries/reviews"
import { ReviewSheet } from "@/components/reviews/review-sheet"
import { ReviewStatusIcon } from "@/components/reviews/review-status-icon"
import { RiskIcon, riskLabels } from "@/components/shared/risk-icon"
import { timeAgo } from "@/lib/format-time"
import { sourceFavicons, sourceLabels } from "@/lib/source-constants"

// ─── Review Row ─────────────────────────────────────────────────────────────

interface ProjectReviewRowProps {
  review: ProjectReview
  onClick?: () => void
  onMouseEnter?: () => void
}

const ProjectReviewRow = memo(function ProjectReviewRow({
  review,
  onClick,
  onMouseEnter,
}: ProjectReviewRowProps) {
  return (
    <div
      className="flex h-[44px] cursor-pointer items-center px-4 hover:bg-accent dark:hover:bg-[#25262A]"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
    >
      {/* Risk */}
      <Tooltip>
        <TooltipTrigger>
          <div className="flex w-8 shrink-0 items-center justify-center">
            {review.riskLevel ? <RiskIcon level={review.riskLevel} /> : null}
          </div>
        </TooltipTrigger>
        {review.riskLevel && (
          <TooltipContent side="top" className="text-xs">
            {riskLabels[review.riskLevel]}
          </TooltipContent>
        )}
      </Tooltip>

      {/* External ID */}
      <div className="flex w-16 shrink-0 items-center overflow-hidden pr-1 tabular-nums">
        <span className="truncate text-[11px] text-muted-foreground uppercase">
          {review.externalId}
        </span>
      </div>

      {/* Status */}
      <ReviewStatusIcon status={review.reviewStatus} />

      {/* Title */}
      <div className="flex min-w-0 flex-1 items-center pr-4 pl-2">
        <span className="truncate text-[13px]">
          {review.title ?? "Untitled review"}
        </span>
      </div>

      {/* Source */}
      <div
        className="flex w-16 shrink-0 items-center justify-center"
        title={sourceLabels[review.source] ?? review.source}
      >
        <img
          src={sourceFavicons[review.source]}
          alt={sourceLabels[review.source] ?? review.source}
          width={18}
          height={18}
          loading="lazy"
          decoding="async"
        />
      </div>

      {/* Findings */}
      <div className="flex w-20 shrink-0 items-center justify-end text-[11px] text-muted-foreground">
        {review.findingCount}{" "}
        {review.findingCount === 1 ? "finding" : "findings"}
      </div>

      {/* Time */}
      <div className="flex w-16 shrink-0 items-center justify-end text-[11px] text-muted-foreground">
        {timeAgo(review.createdAt)}
      </div>
    </div>
  )
})

// ─── Reviews Tab ────────────────────────────────────────────────────────────

interface ReviewsTabProps {
  projectId: string
}

export function ReviewsTab({ projectId }: ReviewsTabProps) {
  const [filters] = useState<ReviewFilters>({})
  const { data, isPending } = useProjectReviews(projectId, filters)
  const queryClient = useQueryClient()
  const search = useSearch({ from: "/projects/$projectId" })
  const navigate = useNavigate()

  const reviews = useMemo(() => data?.reviews ?? [], [data?.reviews])

  // Active review from URL
  const activeReviewId = search.review ?? null

  // Find active review from list (for placeholder data)
  const activeListReview = useMemo(() => {
    if (!activeReviewId) return null
    const found = reviews.find((r) => r.id === activeReviewId)
    if (!found) return null
    // Convert ProjectReview to Review shape for the sheet placeholder
    return {
      id: found.id,
      eventId: "",
      status: found.status,
      riskLevel: found.riskLevel,
      title: found.title,
      summary: found.summary,
      findingCount: found.findingCount,
      source: found.source,
      externalId: found.externalId,
      project: { id: projectId, name: "" },
      createdAt: found.createdAt,
      updatedAt: found.createdAt,
    } as Review
  }, [reviews, activeReviewId, projectId])

  const openSheet = useCallback(
    (reviewId: string) => {
      const nextReviewId = reviewId === activeReviewId ? undefined : reviewId
      navigate({
        search: {
          ...search,
          review: nextReviewId,
        } as Record<string, string | undefined>,
        replace: true,
      })
    },
    [navigate, search, activeReviewId]
  )

  const closeSheet = useCallback(() => {
    const rest = Object.fromEntries(
      Object.entries(search).filter(([key]) => key !== "review")
    )
    navigate({
      search: rest as Record<string, string | undefined>,
      replace: true,
    })
  }, [navigate, search])

  const prefetchReview = useCallback(
    (reviewId: string) => {
      queryClient.prefetchQuery(reviewDetailQueryOptions(reviewId))
    },
    [queryClient]
  )

  return (
    <div className="flex flex-col">
      {/* Review List */}
      {isPending ? (
        <div className="flex flex-col">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex h-[44px] items-center gap-3 px-4">
              <Skeleton className="size-4 rounded" />
              <Skeleton className="h-3 w-12" />
              <Skeleton className="size-4 rounded-full" />
              <Skeleton className="h-3.5 flex-1" />
              <Skeleton className="size-4 rounded" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      ) : reviews.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
          <p className="text-sm font-medium">No reviews yet</p>
          <p className="text-xs text-muted-foreground">
            Reviews will appear here as sources in this project are analyzed.
          </p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-col">
          {reviews.map((review) => (
            <ProjectReviewRow
              key={review.id}
              review={review}
              onClick={() => openSheet(review.id)}
              onMouseEnter={() => prefetchReview(review.id)}
            />
          ))}
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
