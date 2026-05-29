import { memo } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Shield01Icon,
  Alert01Icon,
  LinkSquare02Icon,
  Folder01Icon,
  FileCodeIcon,
} from "@hugeicons/core-free-icons"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { timeAgo } from "@/lib/format-time"
import type { NotificationItem } from "@/queries/notifications"

// ─── Constants ──────────────────────────────────────────────────────────────

const TYPE_ICONS: Record<string, { icon: typeof Shield01Icon; color: string }> = {
  review_completed: { icon: Shield01Icon, color: "#67E8F9" },
  high_risk_detected: { icon: Alert01Icon, color: "#F87171" },
  source_linked: { icon: LinkSquare02Icon, color: "#6EE7B7" },
  source_archived: { icon: Folder01Icon, color: "#FCD34D" },
  summary_updated: { icon: FileCodeIcon, color: "#A78BFA" },
}

const TYPE_LABELS: Record<string, string> = {
  review_completed: "Review",
  high_risk_detected: "Critical",
  source_linked: "Source",
  source_archived: "Archive",
  summary_updated: "Summary",
}

// ─── Component ──────────────────────────────────────────────────────────────

interface NotificationRowProps {
  notification: NotificationItem
}

export const NotificationRow = memo(function NotificationRow({ notification }: NotificationRowProps) {
  const iconConfig = TYPE_ICONS[notification.type]
  const label = TYPE_LABELS[notification.type] ?? notification.type

  return (
    <div
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          e.currentTarget.click()
        }
      }}
      className={`flex h-[44px] cursor-pointer items-center px-4 hover:bg-accent dark:hover:bg-[#25262A] ${
        !notification.read ? "bg-accent/30" : ""
      }`}
    >
      {/* Type icon */}
      <Tooltip>
        <TooltipTrigger>
          <div className="flex w-8 shrink-0 items-center justify-center">
            {iconConfig ? (
              <HugeiconsIcon
                icon={iconConfig.icon}
                size={16}
                color={iconConfig.color}
                strokeWidth={1.5}
              />
            ) : null}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {label}
        </TooltipContent>
      </Tooltip>

      {/* Title */}
      <div className="flex w-56 shrink-0 items-center pr-4 lg:w-72">
        <span
          className={`truncate text-[13px] ${
            !notification.read ? "font-medium text-foreground" : "text-foreground"
          }`}
        >
          {notification.title}
        </span>
      </div>

      {/* Body / description preview */}
      <div className="flex min-w-0 flex-1 items-center pr-4">
        <span className="truncate text-[13px] text-muted-foreground">
          {notification.body}
        </span>
      </div>

      {/* Time */}
      <div className="flex w-16 shrink-0 items-center justify-end text-[11px] text-muted-foreground">
        {timeAgo(notification.createdAt)}
      </div>
    </div>
  )
})
