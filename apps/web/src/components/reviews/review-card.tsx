import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { ProjectBadge } from "@/components/reviews/project-badge"
import { ReviewStatusIcon } from "@/components/reviews/review-status-icon"
import type { Review } from "@/queries/reviews"

// ─── Helpers ────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = now - then

  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`

  return new Date(dateStr).toLocaleDateString()
}

// ─── Risk Icons ─────────────────────────────────────────────────────────────

const riskLabels: Record<string, string> = {
  CRITICAL: "Critical",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
  INFO: "Info",
}

function RiskIcon({ level }: { level: string }) {
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
      <rect
        x="2"
        y="10"
        width="3"
        height="5"
        rx="0.5"
        fill="currentColor"
        opacity={activeBars >= 1 ? 1 : 0.3}
      />
      <rect
        x="6.5"
        y="6"
        width="3"
        height="9"
        rx="0.5"
        fill="currentColor"
        opacity={activeBars >= 2 ? 1 : 0.3}
      />
      <rect
        x="11"
        y="2"
        width="3"
        height="13"
        rx="0.5"
        fill="currentColor"
        opacity={activeBars >= 3 ? 1 : 0.3}
      />
    </svg>
  )
}

// ─── Source ─────────────────────────────────────────────────────────────────

const sourceFavicons: Record<string, string> = {
  LINEAR: "https://www.google.com/s2/favicons?domain=linear.app&sz=64",
  NOTION: "https://www.google.com/s2/favicons?domain=notion.so&sz=64",
  GITHUB: "https://www.google.com/s2/favicons?domain=github.com&sz=64",
}

const sourceLabels: Record<string, string> = {
  LINEAR: "Linear",
  NOTION: "Notion",
  GITHUB: "GitHub",
}

// ─── Component ──────────────────────────────────────────────────────────────

interface ReviewRowProps {
  review: Review
}

export function ReviewRow({ review }: ReviewRowProps) {
  return (
    <div className="flex h-12 cursor-pointer items-center px-4 hover:bg-accent dark:hover:bg-[#25262A]">
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
