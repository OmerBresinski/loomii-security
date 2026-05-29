import { memo } from "react"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import {
  Link01Icon,
  Unlink01Icon,
  Archive01Icon,
  SparklesIcon,
  FileScanIcon,
} from "@hugeicons/core-free-icons"
import type { ProjectActivity } from "@/queries/projects"

// ─── Event Type Config ──────────────────────────────────────────────────────

interface EventConfig {
  icon: IconSvgElement
  color: string
  label: (data: Record<string, unknown>) => string
}

const eventConfigs: Record<string, EventConfig> = {
  source_linked: {
    icon: Link01Icon,
    color: "text-blue-300",
    label: (data) => {
      const source = data.sourceId as string | undefined
      const method = data.linkedBy as string | undefined
      if (method === "AUTO") return `Auto-linked source ${source ?? ""}`
      return `Linked source ${source ?? ""}`
    },
  },
  source_unlinked: {
    icon: Unlink01Icon,
    color: "text-muted-foreground/60",
    label: (data) => {
      const source = data.sourceId as string | undefined
      return `Unlinked source ${source ?? ""}`
    },
  },
  source_archived: {
    icon: Archive01Icon,
    color: "text-amber-300",
    label: (data) => {
      const source = data.sourceId as string | undefined
      const reason = data.reason as string | undefined
      if (reason) return `Archived source ${source ?? ""} — ${reason}`
      return `Archived source ${source ?? ""}`
    },
  },
  review_generated: {
    icon: FileScanIcon,
    color: "text-green-300",
    label: (data) => {
      const title = data.title as string | undefined
      if (title) return `Review generated: ${title}`
      return "Security review generated"
    },
  },
  summary_updated: {
    icon: SparklesIcon,
    color: "text-purple-300",
    label: () => "Project summary updated",
  },
}

const fallbackConfig: EventConfig = {
  icon: Link01Icon,
  color: "text-muted-foreground/60",
  label: (data) => (data.description as string) ?? "Activity event",
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatTimestamp(isoDate: string): string {
  const date = new Date(isoDate)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMinutes = Math.floor(diffMs / 60_000)

  if (diffMinutes < 1) return "just now"
  if (diffMinutes < 60) return `${diffMinutes}m ago`

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h ago`

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

// ─── Activity Event Component ───────────────────────────────────────────────

interface ActivityEventProps {
  event: ProjectActivity
  isLast?: boolean
}

export const ActivityEvent = memo(function ActivityEvent({ event, isLast }: ActivityEventProps) {
  const config = eventConfigs[event.type] ?? fallbackConfig
  const description = config.label(event.data)

  return (
    <div className="relative ml-[20px] flex h-[44px] items-center gap-3">
      {/* Timeline line */}
      {!isLast ? (
        <div className="absolute top-full left-[6px] h-full w-px bg-border/60" />
      ) : null}

      {/* Icon */}
      <div className="relative z-10 shrink-0">
        <HugeiconsIcon
          icon={config.icon}
          size={14}
          strokeWidth={1.5}
          className={config.color}
        />
      </div>

      {/* Content */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[13px] font-normal">
          {description}
        </span>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {formatTimestamp(event.timestamp)}
        </span>
      </div>
    </div>
  )
})
