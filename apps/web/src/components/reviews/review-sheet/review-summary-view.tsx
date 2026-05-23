import Markdown from "react-markdown"
import { SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import type { ReviewDetail } from "@/queries/reviews"
import { RiskIcon } from "./risk-icon"
import { ReviewStepper } from "./review-stepper"
import { FindingListItem } from "./finding-list-item"

// ─── Prose class for markdown content ───────────────────────────────────────

const proseClasses =
  "prose prose-sm max-w-none text-[13px] leading-relaxed text-foreground/90 prose-neutral dark:prose-invert prose-headings:text-sm prose-headings:font-medium prose-p:my-2 prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:text-[12px] prose-pre:rounded-md prose-pre:bg-muted prose-pre:text-[12px] prose-ol:my-2 prose-ul:my-2 prose-li:my-0.5"

// ─── Findings Loading Skeleton ──────────────────────────────────────────────

function FindingsLoadingSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex h-10 items-center gap-2 px-3">
          <Skeleton className="size-3.5 rounded-full" />
          <Skeleton className="h-3 flex-1" />
          <Skeleton className="h-4 w-14 rounded-full" />
        </div>
      ))}
    </div>
  )
}

// ─── Review Summary View ────────────────────────────────────────────────────

interface ReviewSummaryViewProps {
  review: ReviewDetail | undefined
  isPending: boolean
  onAdvance: (nextStatus: string) => void
  onReject: () => void
  isStatusUpdating: boolean
  onFindingClick: (findingId: string) => void
}

export function ReviewSummaryView({
  review,
  isPending,
  onAdvance,
  onReject,
  isStatusUpdating,
  onFindingClick,
}: ReviewSummaryViewProps) {
  return (
    <>
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
              {review?.riskLevel ? (
                <RiskIcon level={review.riskLevel} />
              ) : null}
              {review?.externalId ? (
                <span className="text-xs text-muted-foreground uppercase">
                  {review.externalId}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Review-level actions */}
        {review?.reviewId ? (
          <div className="mt-3">
            <ReviewStepper
              status={review.reviewStatus}
              onAdvance={onAdvance}
              onReject={onReject}
              isUpdating={isStatusUpdating}
            />
          </div>
        ) : null}
      </SheetHeader>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Summary */}
        {review?.summary ? (
          <div className="mb-6">
            <div className={proseClasses}>
              <Markdown>{review.summary}</Markdown>
            </div>
          </div>
        ) : null}

        {/* Findings list */}
        <div>
          <h4 className="mb-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Findings ({review?.findings.length ?? 0})
          </h4>

          {isPending && !review ? (
            <FindingsLoadingSkeleton />
          ) : review?.findings.length === 0 ? (
            <p className="py-4 text-center text-[12px] text-muted-foreground">
              No findings yet.
            </p>
          ) : (
            <div className="flex flex-col">
              {review?.findings.map((finding) => (
                <FindingListItem
                  key={finding.id}
                  finding={finding}
                  onClick={() => onFindingClick(finding.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
