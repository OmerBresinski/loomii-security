import { useQueryClient } from "@tanstack/react-query"
import Markdown from "react-markdown"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
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

// ─── Risk Icon (matches list row icons) ─────────────────────────────────────

const riskLabels: Record<string, string> = {
  CRITICAL: "Critical",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
  INFO: "Info",
}

function RiskIcon({ level }: { level: string | null }) {
  if (!level) return null

  if (level === "CRITICAL") {
    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        className="text-muted-foreground text-primary/60 dark:text-muted-foreground"
      >
        <rect width="16" height="16" rx="3" fill="currentColor" />
        <text
          x="8"
          y="12"
          textAnchor="middle"
          fontSize="11"
          fontWeight="bold"
          fill="var(--background)"
        >
          !
        </text>
      </svg>
    )
  }

  const activeBars =
    level === "HIGH" ? 3 : level === "MEDIUM" ? 2 : level === "LOW" ? 1 : 0
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      className="text-primary/60 dark:text-muted-foreground"
    >
      <rect x="2" y="10" width="3" height="5" rx="0.5" fill="currentColor" opacity={activeBars >= 1 ? 1 : 0.3} />
      <rect x="6.5" y="6" width="3" height="9" rx="0.5" fill="currentColor" opacity={activeBars >= 2 ? 1 : 0.3} />
      <rect x="11" y="2" width="3" height="13" rx="0.5" fill="currentColor" opacity={activeBars >= 3 ? 1 : 0.3} />
    </svg>
  )
}

// ─── Review Status Stepper ──────────────────────────────────────────────────

const REVIEW_STEPS = [
  { key: "DRAFT", label: "Draft" },
  { key: "IN_REVIEW", label: "Review" },
  { key: "APPROVED", label: "Approved" },
  { key: "PUBLISHED", label: "Published" },
] as const

function ReviewStepper({
  status,
  onAdvance,
  onReject,
  isUpdating,
}: {
  status: string | null
  onAdvance?: (nextStatus: string) => void
  onReject?: () => void
  isUpdating?: boolean
}) {
  if (!status) return null

  if (status === "REJECTED") {
    return (
      <div className="flex items-center gap-2">
        <span className="rounded-md bg-red-500/10 px-2.5 py-1 text-[11px] font-medium text-red-400">
          Rejected
        </span>
      </div>
    )
  }

  const currentIdx = REVIEW_STEPS.findIndex((s) => s.key === status)

  // Determine the contextual action for the current step
  const action =
    status === "DRAFT"
      ? { label: "Start Review", next: "IN_REVIEW" }
      : status === "IN_REVIEW"
        ? { label: "Approve", next: "APPROVED" }
        : status === "APPROVED"
          ? { label: "Publish", next: "PUBLISHED" }
          : null

  return (
    <div className="flex min-h-[28px] w-full items-center gap-3">
      {/* Dot stepper */}
      <div className="flex flex-1 items-center">
        {REVIEW_STEPS.map((step, idx) => {
          const isCompleted = idx < currentIdx
          const isCurrent = idx === currentIdx

          const dotColor = isCompleted
            ? "bg-[oklch(0.72_0.12_155)]"
            : isCurrent
              ? "bg-[oklch(0.72_0.12_280)]"
              : "bg-muted-foreground/20"

          const textColor = isCompleted
            ? "text-[oklch(0.72_0.12_155)]"
            : isCurrent
              ? "text-[oklch(0.72_0.12_280)]"
              : "text-muted-foreground/40"

          const lineColor = isCompleted
            ? "bg-[oklch(0.72_0.12_155)]/40"
            : "bg-muted-foreground/15"

          return (
            <div key={step.key} className="flex flex-1 items-center">
              <div className="flex items-center gap-2">
                <div className={`size-2.5 rounded-full ${dotColor}`} />
                <span className={`text-[12px] font-medium ${textColor}`}>
                  {step.label}
                </span>
              </div>
              {idx < REVIEW_STEPS.length - 1 && (
                <div className={`mx-3 h-px flex-1 ${lineColor}`} />
              )}
            </div>
          )
        })}
      </div>

      {/* Contextual action buttons */}
      {action && (
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            onClick={() => onAdvance?.(action.next)}
            disabled={isUpdating}
            className="rounded-md border border-border bg-transparent px-2.5 py-1 text-[11px] font-medium text-foreground/70 transition-colors hover:border-[oklch(0.72_0.12_155)]/50 hover:text-[oklch(0.72_0.12_155)] disabled:opacity-50"
          >
            {action.label}
          </button>
          {status === "IN_REVIEW" && (
            <button
              onClick={onReject}
              disabled={isUpdating}
              className="rounded-md border border-border bg-transparent px-2.5 py-1 text-[11px] font-medium text-foreground/70 transition-colors hover:border-[oklch(0.7_0.12_15)]/50 hover:text-[oklch(0.7_0.12_15)] disabled:opacity-50"
            >
              Reject
            </button>
          )}
        </div>
      )}
    </div>
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

  function handleAdvance(nextStatus: string) {
    if (!review?.reviewId) return
    reviewStatusMutation.mutate({
      reviewDbId: review.reviewId,
      status: nextStatus as "APPROVED" | "REJECTED",
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
                {review?.riskLevel && (
                  <Tooltip>
                    <TooltipTrigger>
                      <RiskIcon level={review.riskLevel} />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      {riskLabels[review.riskLevel]}
                    </TooltipContent>
                  </Tooltip>
                )}
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
            <div className="mt-3">
              <ReviewStepper
                status={review.reviewStatus}
                onAdvance={handleAdvance}
                onReject={handleReject}
                isUpdating={reviewStatusMutation.isPending}
              />
            </div>
          )}
        </SheetHeader>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Summary */}
          {review?.summary && (
            <div className="mb-6">
              <div className="prose prose-sm max-w-none text-[13px] leading-relaxed text-foreground/90 prose-neutral dark:prose-invert prose-headings:text-sm prose-headings:font-medium prose-p:my-2 prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:text-[12px] prose-pre:rounded-md prose-pre:bg-muted prose-pre:text-[12px] prose-ol:my-2 prose-ul:my-2 prose-li:my-0.5">
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
