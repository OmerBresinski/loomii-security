import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
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

const riskColors: Record<string, string> = {
  CRITICAL: "bg-red-500/10 text-red-600 dark:text-red-400",
  HIGH: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  MEDIUM: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  LOW: "bg-green-500/10 text-green-600 dark:text-green-400",
  INFO: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
}

const statusColors: Record<string, string> = {
  ASSEMBLING: "bg-muted text-muted-foreground",
  READY: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  REVIEWING: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  COMPLETED: "bg-green-500/10 text-green-600 dark:text-green-400",
  FAILED: "bg-red-500/10 text-red-600 dark:text-red-400",
}

// ─── Component ──────────────────────────────────────────────────────────────

interface ReviewCardProps {
  review: Review
}

export function ReviewCard({ review }: ReviewCardProps) {
  return (
    <Card className="hover:border-primary/20">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 pb-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-medium leading-tight">
            {review.title ?? "Untitled review"}
          </h3>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {review.riskLevel && (
            <Badge
              variant="secondary"
              className={`text-[10px] font-medium ${riskColors[review.riskLevel] ?? ""}`}
            >
              {review.riskLevel}
            </Badge>
          )}
          <Badge
            variant="secondary"
            className={`text-[10px] font-medium ${statusColors[review.status] ?? ""}`}
          >
            {review.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pb-3 pt-0">
        {review.summary && (
          <p className="mb-2 line-clamp-2 text-xs text-muted-foreground">
            {review.summary}
          </p>
        )}
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span>
            {review.findingCount} {review.findingCount === 1 ? "finding" : "findings"}
          </span>
          <span>{timeAgo(review.createdAt)}</span>
        </div>
      </CardContent>
    </Card>
  )
}
