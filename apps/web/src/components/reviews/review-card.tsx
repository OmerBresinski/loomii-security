import { Badge } from "@/components/ui/badge"
import { HugeiconsIcon } from "@hugeicons/react"
import { GithubIcon, NotionIcon } from "@hugeicons/core-free-icons"
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

const riskStyles: Record<string, string> = {
  CRITICAL: "bg-red-500/10 text-red-600 dark:text-red-400",
  HIGH: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  MEDIUM: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  LOW: "bg-green-500/10 text-green-600 dark:text-green-400",
  INFO: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
}

const riskLabels: Record<string, string> = {
  CRITICAL: "Critical",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
  INFO: "Info",
}

const statusStyles: Record<string, string> = {
  ASSEMBLING: "bg-muted text-muted-foreground",
  READY: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  REVIEWING: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  COMPLETED: "bg-green-500/10 text-green-600 dark:text-green-400",
  FAILED: "bg-red-500/10 text-red-600 dark:text-red-400",
}

const sourceLabels: Record<string, string> = {
  LINEAR: "Linear",
  NOTION: "Notion",
  GITHUB: "GitHub",
}

function SourceIcon({ source }: { source: string }) {
  switch (source) {
    case "GITHUB":
      return <HugeiconsIcon icon={GithubIcon} size={14} strokeWidth={1.5} />
    case "NOTION":
      return <HugeiconsIcon icon={NotionIcon} size={20} strokeWidth={1.5} />
    case "LINEAR":
      return (
        <svg width="14" height="14" viewBox="0 0 100 100" fill="currentColor">
          <path d="M1.22541 61.5228c-.2225-.9485.90748-1.5459 1.59638-.8437L39.3342 98.1845c.7025.7025.1004 1.8189-.8484 1.5765C20.0515 95.5703 5.16312 80.4479 1.22541 61.5228ZM.00189 46.8891c-.01764.2833.00951.5765.09498.8748l52.135 52.1349c.2984.0866.5765.1139.8749.095 7.3517-.5765 14.2664-2.7908 20.3487-6.2442L1.56667 21.8612C-1.69665 28.0346-.60928 39.4444.00189 46.8891ZM12.751 7.15679c-1.00514.80879-.88783 2.32934.15587 3.37304L88.4716 72.0944c1.0437 1.0437 2.5765.9949 3.3731-.1559 4.2568-6.1572 7.0764-13.2453 8.0012-20.8196.0901-.7372-.1694-1.4749-.7053-2.0108L50.9739 1.04082c-.536-.536-1.2737-.79538-2.0109-.70524-7.5742.92479-14.6624 3.74438-20.8196 8.00121l-.0653.04624Z" />
        </svg>
      )
    default:
      return null
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

interface ReviewRowProps {
  review: Review
}

export function ReviewRow({ review }: ReviewRowProps) {
  return (
    <div className="flex h-12 cursor-pointer items-center border-b border-border/60 px-4 hover:bg-primary/[0.03]">
      {/* External ID */}
      <div className="w-24 shrink-0 pr-3">
        <span className="text-xs uppercase text-muted-foreground">{review.externalId}</span>
      </div>

      {/* Title */}
      <div className="min-w-0 flex-1 pr-4">
        <span className="truncate text-sm">
          {review.title ?? "Untitled review"}
        </span>
      </div>

      {/* Source */}
      <div
        className="flex w-16 shrink-0 items-center justify-center text-muted-foreground"
        title={sourceLabels[review.source] ?? review.source}
      >
        <SourceIcon source={review.source} />
      </div>

      {/* Risk */}
      <div className="w-20 shrink-0 text-center">
        {review.riskLevel && (
          <Badge
            variant="secondary"
            className={`text-[10px] font-normal ${riskStyles[review.riskLevel] ?? ""}`}
          >
            {riskLabels[review.riskLevel] ?? review.riskLevel}
          </Badge>
        )}
      </div>

      {/* Status */}
      <div className="w-24 shrink-0 text-center">
        <Badge
          variant="secondary"
          className={`text-[10px] font-normal ${statusStyles[review.status] ?? ""}`}
        >
          {review.status.charAt(0) + review.status.slice(1).toLowerCase()}
        </Badge>
      </div>

      {/* Findings */}
      <div className="w-20 shrink-0 text-right text-xs text-muted-foreground">
        {review.findingCount}{" "}
        {review.findingCount === 1 ? "finding" : "findings"}
      </div>

      {/* Time */}
      <div className="w-16 shrink-0 text-right text-xs text-muted-foreground">
        {timeAgo(review.createdAt)}
      </div>
    </div>
  )
}
