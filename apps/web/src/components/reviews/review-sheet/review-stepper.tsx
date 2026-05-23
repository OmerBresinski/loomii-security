import { REVIEW_STEPS } from "./constants"

// ─── Review Status Stepper ──────────────────────────────────────────────────

interface ReviewStepperProps {
  status: string | null
  onAdvance?: (nextStatus: string) => void
  onReject?: () => void
  isUpdating?: boolean
}

export function ReviewStepper({
  status,
  onAdvance,
  onReject,
  isUpdating,
}: ReviewStepperProps) {
  if (!status) return null

  if (status === "REJECTED") {
    return (
      <div className="flex items-center gap-2">
        <span className="rounded-md bg-red-500/10 px-2.5 py-1 text-[11px] font-medium text-red-400">
          Rejected
        </span>
      </div>
    )
  }

  const currentIdx = REVIEW_STEPS.findIndex((s) => s.key === status)

  // Determine the contextual action for the current step
  const action =
    status === "DRAFT"
      ? { label: "Start Review", next: "IN_REVIEW" }
      : status === "IN_REVIEW"
        ? { label: "Approve", next: "APPROVED" }
        : status === "APPROVED"
          ? { label: "Publish", next: "PUBLISHED" }
          : null

  return (
    <div className="flex min-h-[28px] w-full items-center gap-3">
      {/* Dot stepper */}
      <div className="flex flex-1 items-center">
        {REVIEW_STEPS.map((step, idx) => {
          const isCompleted = idx < currentIdx
          const isCurrent = idx === currentIdx

          const dotColor = isCompleted
            ? "bg-[oklch(0.72_0.12_155)]"
            : isCurrent
              ? "bg-[oklch(0.72_0.12_280)]"
              : "bg-muted-foreground/20"

          const textColor = isCompleted
            ? "text-[oklch(0.72_0.12_155)]"
            : isCurrent
              ? "text-[oklch(0.72_0.12_280)]"
              : "text-muted-foreground/40"

          const lineColor = isCompleted
            ? "bg-[oklch(0.72_0.12_155)]/40"
            : "bg-muted-foreground/15"

          return (
            <div key={step.key} className="flex flex-1 items-center">
              <div className="flex items-center gap-2">
                <div className={`size-2.5 rounded-full ${dotColor}`} />
                <span className={`text-[12px] font-medium ${textColor}`}>
                  {step.label}
                </span>
              </div>
              {idx < REVIEW_STEPS.length - 1 && (
                <div className={`mx-3 h-px flex-1 ${lineColor}`} />
              )}
            </div>
          )
        })}
      </div>

      {/* Contextual action buttons */}
      {action ? (
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            onClick={() => onAdvance?.(action.next)}
            disabled={isUpdating}
            className="rounded-md border border-border bg-transparent px-2.5 py-1 text-[11px] font-medium text-foreground/70 transition-colors hover:border-[oklch(0.72_0.12_155)]/50 hover:text-[oklch(0.72_0.12_155)] disabled:opacity-50"
          >
            {action.label}
          </button>
          {status === "IN_REVIEW" && (
            <button
              onClick={onReject}
              disabled={isUpdating}
              className="rounded-md border border-border bg-transparent px-2.5 py-1 text-[11px] font-medium text-foreground/70 transition-colors hover:border-[oklch(0.7_0.12_15)]/50 hover:text-[oklch(0.7_0.12_15)] disabled:opacity-50"
            >
              Reject
            </button>
          )}
        </div>
      ) : null}
    </div>
  )
}
