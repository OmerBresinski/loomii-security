import Markdown from "react-markdown"
import { HugeiconsIcon } from "@hugeicons/react"
import { SparklesIcon } from "@hugeicons/core-free-icons"
import { Skeleton } from "@/components/ui/skeleton"
import type { ProjectDetail } from "@loomii/shared"

// ─── Component ──────────────────────────────────────────────────────────────

interface SummaryCardProps {
  project?: ProjectDetail
  isPending: boolean
}

export function SummaryCard({ project, isPending }: SummaryCardProps) {
  if (isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-5 w-40" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    )
  }

  if (!project) return null

  const hasSummary = !!project.summary

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-medium">Project Summary</h2>
        <HugeiconsIcon
          icon={SparklesIcon}
          size={16}
          className="text-muted-foreground"
        />
      </div>

      {/* Content */}
      {hasSummary ? (
        <div className="flex flex-col gap-2">
          <div className="prose prose-base max-w-none overflow-hidden leading-relaxed text-foreground/90 dark:prose-invert [&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:tracking-wide [&_h2]:text-muted-foreground [&_h2]:uppercase [&_li]:my-1 [&_p]:my-1.5 [&_ul]:my-2 [&_ul]:pl-5">
            <Markdown>{project.summary}</Markdown>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border py-8 text-center">
          <div className="flex items-center gap-2">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="animate-spin text-muted-foreground"
            >
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            <span className="text-xs text-muted-foreground">
              Summary generating...
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground/60">
            This usually takes a few moments after project creation.
          </p>
        </div>
      )}
    </div>
  )
}
