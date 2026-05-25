import { useState } from "react"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowRight01Icon, ArrowTurnBackwardIcon } from "@hugeicons/core-free-icons"
import type { Finding } from "@/queries/reviews"
import { dismissalReasonLabels, type DismissalReason } from "./constants"

interface DismissedSectionProps {
  findings: Finding[]
  onRestore: (findingId: string) => void
  isRestoring: boolean
}

export function DismissedSection({
  findings,
  onRestore,
  isRestoring,
}: DismissedSectionProps) {
  const [open, setOpen] = useState(false)

  if (findings.length === 0) return null

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-3">
      <CollapsibleTrigger className="flex w-full items-center gap-1.5 rounded px-3 py-2 text-[11px] text-muted-foreground transition-colors hover:bg-muted/50">
        <span className={`transition-transform ${open ? "rotate-90" : ""}`}>
          <HugeiconsIcon icon={ArrowRight01Icon} size={12} strokeWidth={1.5} />
        </span>
        <span>{findings.length} dismissed as false positive</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 flex flex-col gap-0.5 pl-2">
          {findings.map((finding) => (
            <div
              key={finding.id}
              className="flex items-center gap-2 rounded px-3 py-1.5"
            >
              <span className="flex-1 truncate text-[12px] text-muted-foreground line-through">
                {finding.title}
              </span>
              <span className="shrink-0 text-[10px] text-muted-foreground/60">
                {dismissalReasonLabels[
                  finding.dismissalReason as DismissalReason
                ] ?? "Dismissed"}
              </span>
              <button
                onClick={() => onRestore(finding.id)}
                disabled={isRestoring}
                className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none"
                title="Restore finding"
              >
                <HugeiconsIcon icon={ArrowTurnBackwardIcon} size={12} strokeWidth={1.2} />
              </button>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
