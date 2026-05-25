import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import {
  DISMISSAL_REASONS,
  dismissalReasonLabels,
  type DismissalReason,
} from "./constants"
import { useState } from "react"

interface DismissButtonProps {
  onDismiss: (reason: DismissalReason) => void
  disabled?: boolean
}

export function DismissButton({ onDismiss, disabled }: DismissButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          disabled={disabled}
          className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-50"
          title="Dismiss finding"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M3.5 3.5L10.5 10.5M10.5 3.5L3.5 10.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-48 p-1">
        <div className="flex flex-col">
          {DISMISSAL_REASONS.map((reason) => (
            <button
              key={reason}
              onClick={() => {
                onDismiss(reason)
                setOpen(false)
              }}
              className="rounded px-2.5 py-1.5 text-left text-[12px] text-foreground/90 transition-colors hover:bg-muted"
            >
              {dismissalReasonLabels[reason]}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
