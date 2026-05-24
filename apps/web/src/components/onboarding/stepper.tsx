// ─── Onboarding Stepper ─────────────────────────────────────────────────────

interface StepperProps {
  currentStep: number
  steps: { label: string; key: string }[]
}

export function Stepper({ currentStep, steps }: StepperProps) {
  return (
    <div className="flex w-full items-center justify-center py-6">
      <div className="flex items-center gap-0">
        {steps.map((step, idx) => {
          const isCompleted = idx < currentStep
          const isCurrent = idx === currentStep
          const isUpcoming = idx > currentStep

          return (
            <div key={step.key} className="flex items-center">
              {/* Step circle + label */}
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={`flex size-8 items-center justify-center rounded-full border-2 text-xs font-medium transition-colors ${
                    isCompleted
                      ? "border-[oklch(0.72_0.12_155)] bg-[oklch(0.72_0.12_155)] text-white"
                      : isCurrent
                        ? "border-[oklch(0.72_0.12_280)] bg-[oklch(0.72_0.12_280)]/10 text-[oklch(0.72_0.12_280)]"
                        : "border-muted-foreground/20 text-muted-foreground/40"
                  }`}
                >
                  {isCompleted ? (
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 14 14"
                      fill="none"
                      className="text-white"
                    >
                      <path
                        d="M11.5 4L5.5 10L2.5 7"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    idx + 1
                  )}
                </div>
                <span
                  className={`text-[11px] font-medium whitespace-nowrap ${
                    isCompleted
                      ? "text-[oklch(0.72_0.12_155)]"
                      : isCurrent
                        ? "text-foreground"
                        : "text-muted-foreground/50"
                  }`}
                >
                  {step.label}
                </span>
              </div>

              {/* Connector line */}
              {idx < steps.length - 1 && (
                <div
                  className={`mx-3 h-0.5 w-12 rounded-full ${
                    isCompleted
                      ? "bg-[oklch(0.72_0.12_155)]"
                      : isUpcoming
                        ? "bg-muted-foreground/15"
                        : "bg-muted-foreground/25"
                  }`}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
