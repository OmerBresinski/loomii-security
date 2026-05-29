import { memo } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowUpRight01Icon } from "@hugeicons/core-free-icons"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { Finding } from "@/queries/reviews"
import { findingTypeLabels } from "./constants"
import { FindingTypeIcon, FindingSeverityIcon } from "./finding-icons"

// ─── Finding List Item (clickable row) ──────────────────────────────────────

interface FindingListItemProps {
  finding: Finding
  onClick: (findingId: string) => void
}

export const FindingListItem = memo(function FindingListItem({ finding, onClick }: FindingListItemProps) {
  return (
    <div
      className="group flex h-11 cursor-pointer items-center gap-2.5 border-b border-border/30 px-3 last:border-b-0 hover:bg-accent/50 dark:hover:bg-[#25262A]/50"
      onClick={() => onClick(finding.id)}
    >
      {/* Type Icon with tooltip */}
      <Tooltip>
        <TooltipTrigger>
          <div className="flex shrink-0 items-center">
            <FindingTypeIcon type={finding.type} />
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {findingTypeLabels[finding.type] ?? finding.type}
        </TooltipContent>
      </Tooltip>

      {/* Title */}
      <span className="min-w-0 flex-1 truncate text-[13px]">
        {finding.title}
      </span>

      {/* Severity */}
      {finding.severity ? (
        <div className="flex shrink-0 items-center">
          <FindingSeverityIcon severity={finding.severity} />
        </div>
      ) : null}

      {/* Arrow icon (shows on hover) */}
      <HugeiconsIcon
        icon={ArrowUpRight01Icon}
        size={14}
        className="shrink-0 text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100"
      />
    </div>
  )
})
