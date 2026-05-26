// ─── Onboarding Wizard Page ──────────────────────────────────────────────────

import { useNavigate, useParams } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { Stepper } from "@/components/onboarding/stepper"
import { ConnectLinear } from "@/components/onboarding/connect-linear"
import { ConnectNotion } from "@/components/onboarding/connect-notion"
import { PolicySetup } from "@/components/onboarding/policy-setup"
import { MonitoringScope } from "@/components/onboarding/monitoring-scope"
import { InitialSync } from "@/components/onboarding/initial-sync"
import {
  useOnboardingState,
  onboardingStateQueryOptions,
} from "@/queries/onboarding"
import { useSaveOnboardingStep, useStartSync } from "@/mutations/onboarding"

// ─── Step Definitions ───────────────────────────────────────────────────────

export const ONBOARDING_STEPS = [
  { key: "linear", label: "Linear" },
  { key: "notion", label: "Notion" },
  { key: "policies", label: "Policies" },
  { key: "scope", label: "Scope" },
  { key: "sync", label: "Sync" },
] as const

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number]["key"]

const STEP_INDEX: Record<string, number> = Object.fromEntries(
  ONBOARDING_STEPS.map((s, i) => [s.key, i])
)

// Mutable copy for Stepper prop (hoisted to avoid allocation per render)
const STEPS_ARRAY = ONBOARDING_STEPS.map((s) => ({ key: s.key, label: s.label }))

// ─── Page Component ─────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const navigate = useNavigate()
  const { step } = useParams({ from: "/onboarding/$step" })
  const queryClient = useQueryClient()
  const { data } = useOnboardingState()
  const saveStep = useSaveOnboardingStep()
  const startSync = useStartSync()

  const onboarding = data?.onboarding
  const currentStepIndex = STEP_INDEX[step] ?? 0

  function goToStep(stepKey: string) {
    const stepIndex = STEP_INDEX[stepKey] ?? 0
    saveStep.mutate({ step: stepIndex })
    navigate({ to: "/onboarding/$step", params: { step: stepKey } })

    // Trigger the backfill when entering the sync step
    if (stepKey === "sync") {
      startSync.mutate()
    }
  }

  function handleNext() {
    const nextStep = ONBOARDING_STEPS[currentStepIndex + 1]
    if (nextStep) goToStep(nextStep.key)
  }

  function handleBack() {
    const prevStep = ONBOARDING_STEPS[currentStepIndex - 1]
    if (prevStep) goToStep(prevStep.key)
  }

  function handleSkip() {
    handleNext()
  }

  function handleComplete() {
    queryClient.invalidateQueries({
      queryKey: onboardingStateQueryOptions().queryKey,
    })
    navigate({ to: "/projects" })
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
        <Stepper currentStep={currentStepIndex} steps={STEPS_ARRAY} />
      </div>

      {/* Step Content */}
      <div className="flex min-h-0 flex-1 items-start justify-center overflow-y-auto px-6 pb-8 pt-4">
        {step === "linear" && (
          <ConnectLinear
            connected={onboarding?.linearConnected ?? false}
            onNext={handleNext}
            onSkip={handleSkip}
          />
        )}
        {step === "notion" && (
          <ConnectNotion
            connected={onboarding?.notionConnected ?? false}
            onNext={handleNext}
            onSkip={handleSkip}
            onBack={handleBack}
          />
        )}
        {step === "policies" && (
          <PolicySetup onNext={handleNext} onSkip={handleSkip} onBack={handleBack} />
        )}
        {step === "scope" && (
          <MonitoringScope onNext={handleNext} onSkip={handleSkip} onBack={handleBack} />
        )}
        {step === "sync" && <InitialSync onComplete={handleComplete} />}
      </div>
    </div>
  )
}
