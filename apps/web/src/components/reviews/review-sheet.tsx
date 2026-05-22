import { useQueryClient } from "@tanstack/react-query"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { FindingRow } from "@/components/reviews/finding-row"
import {
  useReviewDetail,
  reviewDetailQueryOptions,
  type Review,
  type ReviewDetail,
  type Finding,
} from "@/queries/reviews"
import {
  useUpdateFindingStatus,
  useUpdateReviewStatus,
} from "@/mutations/reviews"

// ─── Seed cache from list data ──────────────────────────────────────────────

/**
 * Pre-populate the query cache with list-level data so the sheet
 * renders header info instantly without showing a loading skeleton.
 * This is called once when the sheet opens, not on every render.
 */
function seedCacheFromList(
  queryClient: ReturnType<typeof useQueryClient>,
  review: Review
) {
  const key = reviewDetailQueryOptions(review.id).queryKey
  // Only seed if we don't already have real data cached
  if (!queryClient.getQueryData(key)) {
    queryClient.setQueryData<ReviewDetail>(key, {
      id: review.id,
      status: review.status,
      riskLevel: review.riskLevel,
      title: review.title,
      summary: review.summary,
      confidence: null,
      source: review.source,
      externalId: review.externalId,
      reviewId: null,
      reviewStatus: null,
      createdAt: review.createdAt,
      findings: [],
    })
  }
}

// ─── Risk Badge ─────────────────────────────────────────────────────────────

function RiskBadge({ level }: { level: string | null }) {
  if (!level) return null

  const colorMap: Record<string, string> = {
    CRITICAL: "bg-red-500/10 text-red-600 dark:text-red-400",
    HIGH: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
    MEDIUM: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    LOW: "bg-green-500/10 text-green-600 dark:text-green-400",
    INFO: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  }

  return (
    <Badge
      variant="secondary"
      className={`h-5 text-[10px] ${colorMap[level] ?? ""}`}
    >
      {level}
    </Badge>
  )
}

// ─── Status Badge ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    ASSEMBLING: "Assembling",
    READY: "Todo",
    REVIEWING: "In Review",
    COMPLETED: "Done",
    FAILED: "Failed",
  }

  return (
    <Badge variant="outline" className="h-5 text-[10px]">
      {labels[status] ?? status}
    </Badge>
  )
}

// ─── Component ──────────────────────────────────────────────────────────────

interface ReviewSheetProps {
  reviewId: string | null
  /** Review from the list — used to seed cache for instant header */
  listReview?: Review | null
  onClose: () => void
}

export function ReviewSheet({
  reviewId,
  listReview,
  onClose,
}: ReviewSheetProps) {
  const queryClient = useQueryClient()
  const isOpen = !!reviewId

  // Seed cache from list data (only if we don't have detail cached already)
  if (isOpen && listReview) {
    seedCacheFromList(queryClient, listReview)
  }

  const { data: review, isPending } = useReviewDetail(reviewId ?? "")

  const findingMutation = useUpdateFindingStatus(reviewId ?? "")
  const reviewStatusMutation = useUpdateReviewStatus(reviewId ?? "")

  function handleFindingStatusChange(
    findingId: string,
    status: Finding["status"]
  ) {
    findingMutation.mutate({ findingId, status })
  }

  function handleApprove() {
    if (!review?.reviewId) return
    reviewStatusMutation.mutate({
      reviewDbId: review.reviewId,
      status: "APPROVED",
    })
  }

  function handleReject() {
    if (!review?.reviewId) return
    reviewStatusMutation.mutate({
      reviewDbId: review.reviewId,
      status: "REJECTED",
    })
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-[40vw] overflow-hidden sm:max-w-none dark:bg-[#2C2D30]"
      >
        {/* Header */}
        <SheetHeader className="border-b border-border/50 pb-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <SheetTitle className="pr-8 text-sm">
                {isPending && !review ? (
                  <Skeleton className="h-4 w-3/4" />
                ) : (
                  (review?.title ?? "Untitled review")
                )}
              </SheetTitle>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {review && <StatusBadge status={review.status} />}
                {review && <RiskBadge level={review.riskLevel} />}
                {review?.externalId && (
                  <span className="text-[10px] text-muted-foreground uppercase">
                    {review.externalId}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Review-level actions */}
          {review?.reviewId && (
            <div className="mt-3 flex items-center gap-2">
              <Button
                size="sm"
                variant="default"
                onClick={handleApprove}
                disabled={reviewStatusMutation.isPending}
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={handleReject}
                disabled={reviewStatusMutation.isPending}
              >
                Reject
              </Button>
              {review.reviewStatus && (
                <span className="ml-auto text-[10px] text-muted-foreground">
                  Review: {review.reviewStatus}
                </span>
              )}
            </div>
          )}
        </SheetHeader>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Summary */}
          {review?.summary && (
            <div className="mb-6">
              <h4 className="mb-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                Summary
              </h4>
              <p className="text-[13px] leading-relaxed text-foreground/90">
                {review.summary}
              </p>
            </div>
          )}

          {/* Findings */}
          <div>
            <h4 className="mb-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Findings ({review?.findings.length ?? 0})
            </h4>

            {isPending && !review ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex h-10 items-center gap-2 px-3">
                    <Skeleton className="size-3.5 rounded-full" />
                    <Skeleton className="h-3 flex-1" />
                    <Skeleton className="h-4 w-14 rounded-full" />
                  </div>
                ))}
              </div>
            ) : review?.findings.length === 0 ? (
              <p className="py-4 text-center text-[12px] text-muted-foreground">
                No findings yet.
              </p>
            ) : (
              <div className="rounded-md border border-border/50">
                {review?.findings.map((finding) => (
                  <FindingRow
                    key={finding.id}
                    finding={finding}
                    onStatusChange={handleFindingStatusChange}
                    isUpdating={
                      findingMutation.isPending &&
                      findingMutation.variables?.findingId === finding.id
                    }
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
