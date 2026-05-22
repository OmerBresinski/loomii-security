import { useQueryClient } from "@tanstack/react-query"
import Markdown from "react-markdown"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
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

// ─── Review Status Indicator (shown when already triaged) ───────────────────

function ReviewStatusIndicator({ status }: { status: string | null }) {
  if (!status) return null

  const config: Record<string, { label: string; className: string }> = {
    APPROVED: { label: "Approved", className: "text-green-500 bg-green-500/10" },
    PUBLISHED: { label: "Published", className: "text-green-500 bg-green-500/10" },
    REJECTED: { label: "Rejected", className: "text-red-400 bg-red-500/10" },
    PENDING: { label: "Pending", className: "text-muted-foreground bg-muted" },
    GENERATING: { label: "Generating", className: "text-muted-foreground bg-muted" },
  }

  const c = config[status] ?? { label: status, className: "text-muted-foreground bg-muted" }

  return (
    <span className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${c.className}`}>
      {c.label}
    </span>
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
              {review.reviewStatus === "DRAFT" || review.reviewStatus === "IN_REVIEW" ? (
                <>
                  <button
                    onClick={handleApprove}
                    disabled={reviewStatusMutation.isPending}
                    className="rounded-md border border-border bg-transparent px-2.5 py-1 text-[11px] font-medium text-foreground/80 transition-colors hover:border-green-500/40 hover:text-green-500 disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    onClick={handleReject}
                    disabled={reviewStatusMutation.isPending}
                    className="rounded-md border border-border bg-transparent px-2.5 py-1 text-[11px] font-medium text-foreground/80 transition-colors hover:border-red-500/40 hover:text-red-500 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </>
              ) : (
                <ReviewStatusIndicator status={review.reviewStatus} />
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
              <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none text-[13px] leading-relaxed text-foreground/90 prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:text-[12px] prose-pre:bg-muted prose-pre:rounded-md prose-pre:text-[12px] prose-headings:text-sm prose-headings:font-medium">
                <Markdown>{review.summary}</Markdown>
              </div>
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
