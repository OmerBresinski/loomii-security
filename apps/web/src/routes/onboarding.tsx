// ─── Onboarding Wizard Page ──────────────────────────────────────────────────

import { useCallback, useEffect } from "react"
import { useNavigate } from "@tanstack/react-router"
import { Skeleton } from "@/components/ui/skeleton"
import { Stepper } from "@/components/onboarding/stepper"
import { ConnectLinear } from "@/components/onboarding/connect-linear"
import { ConnectNotion } from "@/components/onboarding/connect-notion"
import { PolicySetup } from "@/components/onboarding/policy-setup"
import { MonitoringScope } from "@/components/onboarding/monitoring-scope"
import { InitialSync } from "@/components/onboarding/initial-sync"
import { useOnboardingState } from "@/queries/onboarding"
import { useSaveOnboardingStep } from "@/mutations/onboarding"

// ─── Step Definitions ───────────────────────────────────────────────────────

const STEPS = [
  { key: "linear", label: "Linear" },
  { key: "notion", label: "Notion" },
  { key: "policies", label: "Policies" },
  { key: "scope", label: "Scope" },
  { key: "sync", label: "Sync" },
]

// ─── Page Component ─────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const navigate = useNavigate()
  const { data, isPending } = useOnboardingState()
  const saveStep = useSaveOnboardingStep()

  const onboarding = data?.onboarding

  // Current step from server state (persisted for resume)
  const currentStep = onboarding?.currentStep ?? 0

  const goToStep = useCallback(
    (step: number) => {
      saveStep.mutate({ step })
    },
    [saveStep]
  )

  const handleNext = useCallback(() => {
    goToStep(currentStep + 1)
  }, [currentStep, goToStep])

  const handleBack = useCallback(() => {
    if (currentStep > 0) {
      goToStep(currentStep - 1)
    }
  }, [currentStep, goToStep])

  const handleSkip = useCallback(() => {
    goToStep(currentStep + 1)
  }, [currentStep, goToStep])

  const handleComplete = useCallback(() => {
    navigate({ to: "/reviews" })
  }, [navigate])

  // If onboarding already completed, redirect immediately
  const isCompleted = onboarding?.completed ?? false
  useEffect(() => {
    if (isCompleted) {
      navigate({ to: "/reviews" })
    }
  }, [isCompleted, navigate])

  // Loading state
  if (isPending) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6">
        <div className="flex w-full max-w-lg flex-col gap-6">
          <Skeleton className="mx-auto h-8 w-72" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      </div>
    )
  }

  if (isCompleted) {
    return null
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 flex-col items-center px-6 pt-8 pb-2">
        <h1 className="text-sm font-semibold">Welcome to Loomii</h1>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Let&apos;s set up your security monitoring in a few quick steps.
        </p>
      </div>

      {/* Stepper */}
      <div className="shrink-0 px-6">
        <Stepper currentStep={currentStep} steps={STEPS} />
      </div>

      {/* Step Content */}
      <div className="flex min-h-0 flex-1 items-start justify-center overflow-y-auto px-6 pb-8 pt-4">
        {currentStep === 0 && (
          <ConnectLinear
            connected={onboarding?.linearConnected ?? false}
            onNext={handleNext}
            onSkip={handleSkip}
          />
        )}
        {currentStep === 1 && (
          <ConnectNotion
            connected={onboarding?.notionConnected ?? false}
            onNext={handleNext}
            onSkip={handleSkip}
            onBack={handleBack}
          />
        )}
        {currentStep === 2 && (
          <PolicySetup onNext={handleNext} onSkip={handleSkip} onBack={handleBack} />
        )}
        {currentStep === 3 && (
          <MonitoringScope onNext={handleNext} onSkip={handleSkip} onBack={handleBack} />
        )}
        {currentStep === 4 && <InitialSync onComplete={handleComplete} />}
      </div>
    </div>
  )
}
