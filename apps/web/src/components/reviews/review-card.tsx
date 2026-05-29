import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { ProjectBadge } from "@/components/reviews/project-badge"
import { ReviewStatusIcon } from "@/components/reviews/review-status-icon"
import { RiskIcon, riskLabels } from "@/components/shared/risk-icon"
import { timeAgo } from "@/lib/format-time"
import { sourceFavicons, sourceLabels } from "@/lib/source-constants"
import type { Review } from "@/queries/reviews"

// ─── Component ──────────────────────────────────────────────────────────────

interface ReviewRowProps {
  review: Review
}

export function ReviewRow({ review }: ReviewRowProps) {
  return (
    <div className="flex h-[44px] cursor-pointer items-center px-4 hover:bg-accent dark:hover:bg-[#25262A]">
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

      {/* Project Badge */}
      {review.project && (
        <div className="flex shrink-0 items-center pr-3">
          <ProjectBadge project={review.project} />
        </div>
      )}

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
}
