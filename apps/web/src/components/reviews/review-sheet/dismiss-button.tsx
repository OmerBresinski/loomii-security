import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { HugeiconsIcon } from "@hugeicons/react"
import { Cancel01Icon } from "@hugeicons/core-free-icons"
import {
  DISMISSAL_REASONS,
  dismissalReasonLabels,
  type DismissalReason,
} from "./constants"
import { useState } from "react"

interface DismissButtonProps {
  findingId: string
  onDismiss: (findingId: string, reason: DismissalReason) => void
  disabled?: boolean
}

export function DismissButton({ findingId, onDismiss, disabled }: DismissButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          disabled={disabled}
          className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-50"
          title="Dismiss finding"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={1.5} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-48 p-1">
        <div className="flex flex-col">
          {DISMISSAL_REASONS.map((reason) => (
            <button
              key={reason}
              onClick={() => {
                onDismiss(findingId, reason)
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
