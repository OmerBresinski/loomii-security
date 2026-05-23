import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

// ─── Review Triage Status Icons ─────────────────────────────────────────────

const reviewStatusLabels: Record<string, string> = {
  PENDING: "Pending",
  GENERATING: "Generating",
  DRAFT: "Needs Review",
  IN_REVIEW: "In Review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  PUBLISHED: "Published",
}

function ReviewStatusIconSvg({ status }: { status: string | null }) {
  switch (status) {
    case "APPROVED":
    case "PUBLISHED":
      // Soft green filled circle with check
      return (
        <svg width="15" height="15" viewBox="0 0 16 16">
          <circle cx="8" cy="8" r="7" fill="oklch(0.72 0.12 155)" />
          <path
            d="M5 8l2 2 4-4"
            stroke="white"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )
    case "REJECTED":
      // Soft rose filled circle with X
      return (
        <svg width="15" height="15" viewBox="0 0 16 16">
          <circle cx="8" cy="8" r="7" fill="oklch(0.7 0.12 15)" />
          <path
            d="M6 6l4 4M10 6l-4 4"
            stroke="white"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      )
    case "IN_REVIEW":
      // Soft lavender half-filled circle
      return (
        <svg width="15" height="15" viewBox="0 0 16 16">
          <circle
            cx="8"
            cy="8"
            r="6.5"
            fill="none"
            stroke="oklch(0.72 0.12 280)"
            strokeWidth="1.5"
          />
          <path d="M8 1.5 A6.5 6.5 0 0 1 8 14.5" fill="oklch(0.72 0.12 280)" />
        </svg>
      )
    case "DRAFT":
      // Soft amber empty circle
      return (
        <svg width="15" height="15" viewBox="0 0 16 16">
          <circle
            cx="8"
            cy="8"
            r="6.5"
            fill="none"
            stroke="oklch(0.75 0.12 70)"
            strokeWidth="1.5"
          />
        </svg>
      )
    case "GENERATING":
      // Soft gray dashed circle
      return (
        <svg width="15" height="15" viewBox="0 0 16 16">
          <circle
            cx="8"
            cy="8"
            r="6.5"
            fill="none"
            stroke="oklch(0.6 0.02 260)"
            strokeWidth="1.5"
            strokeDasharray="2.5 2"
          />
        </svg>
      )
    case "PENDING":
    default:
      // Very soft gray dashed circle
      return (
        <svg width="15" height="15" viewBox="0 0 16 16">
          <circle
            cx="8"
            cy="8"
            r="6.5"
            fill="none"
            stroke="oklch(0.55 0.01 260)"
            strokeWidth="1.5"
            strokeDasharray="2.5 2"
          />
        </svg>
      )
  }
}

// ─── Exported Component ─────────────────────────────────────────────────────

interface ReviewStatusIconProps {
  status: string | null
}

export function ReviewStatusIcon({ status }: ReviewStatusIconProps) {
  const label = status ? (reviewStatusLabels[status] ?? status) : "Unknown"

  return (
    <Tooltip>
      <TooltipTrigger>
        <div className="flex w-8 shrink-0 items-center justify-center">
          <ReviewStatusIconSvg status={status} />
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
