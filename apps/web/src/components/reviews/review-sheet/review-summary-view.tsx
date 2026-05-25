import { useMemo } from "react"
import Markdown from "react-markdown"
import { SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { HugeiconsIcon } from "@hugeicons/react"
import { Tick02Icon } from "@hugeicons/core-free-icons"
import type { ReviewDetail, Finding } from "@/queries/reviews"
import { RiskIcon } from "./risk-icon"
import { FindingListItem } from "./finding-list-item"
import { DismissButton } from "./dismiss-button"
import { DismissedSection } from "./dismissed-section"
import type { DismissalReason } from "./constants"

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
  onFindingClick: (findingId: string) => void
  onDismiss: (findingId: string, reason: DismissalReason) => void
  onRestore: (findingId: string) => void
  onPublish: () => void
  isDismissing: boolean
  isRestoring: boolean
  isPublishing: boolean
}

export function ReviewSummaryView({
  review,
  isPending,
  onFindingClick,
  onDismiss,
  onRestore,
  onPublish,
  isDismissing,
  isRestoring,
  isPublishing,
}: ReviewSummaryViewProps) {
  // Split findings into active vs dismissed (memoized to avoid recompute on unrelated re-renders)
  const { activeFindings, dismissedFindings } = useMemo(() => {
    const active: Finding[] = []
    const dismissed: Finding[] = []
    for (const f of review?.findings ?? []) {
      if (f.status === "DISMISSED") {
        dismissed.push(f)
      } else {
        active.push(f)
      }
    }
    return { activeFindings: active, dismissedFindings: dismissed }
  }, [review?.findings])

  const isPublished = review?.reviewStatus === "PUBLISHED"
  const isReady = review?.reviewStatus === "READY"

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

          {/* Publish button (only in READY state) */}
          {isReady && review?.reviewId ? (
            <Button
              size="sm"
              onClick={onPublish}
              disabled={isPublishing || activeFindings.length === 0}
            >
              {isPublishing ? "Generating..." : "Publish Review"}
            </Button>
          ) : null}

          {/* Published badge */}
          {isPublished ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2.5 py-1 text-[11px] font-medium text-green-400">
              <HugeiconsIcon icon={Tick02Icon} size={12} strokeWidth={1.5} />
              Published
            </span>
          ) : null}
        </div>
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
            {isPublished ? "Confirmed" : ""} Findings ({activeFindings.length})
          </h4>

          {isPending && !review ? (
            <FindingsLoadingSkeleton />
          ) : activeFindings.length === 0 ? (
            <p className="py-4 text-center text-[12px] text-muted-foreground">
              No findings yet.
            </p>
          ) : (
            <div className="flex flex-col">
              {activeFindings.map((finding) => (
                <div key={finding.id} className="group flex items-center">
                  <div className="min-w-0 flex-1">
                    <FindingListItem
                      finding={finding}
                      onClick={onFindingClick}
                    />
                  </div>
                  {/* Dismiss icon — only show for untriaged findings in READY state */}
                  {isReady && finding.status !== "CONFIRMED" ? (
                    <div className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
                      <DismissButton
                        findingId={finding.id}
                        onDismiss={onDismiss}
                        disabled={isDismissing}
                      />
                    </div>
                  ) : null}
                  {/* Checkmark for confirmed findings */}
                  {isPublished ? (
                    <div className="shrink-0 pr-3 text-green-400">
                      <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={1.5} />
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}

          {/* Dismissed section (collapsed) */}
          <DismissedSection
            findings={dismissedFindings}
            onRestore={onRestore}
            isRestoring={isRestoring}
          />
        </div>
      </div>
    </>
  )
}
