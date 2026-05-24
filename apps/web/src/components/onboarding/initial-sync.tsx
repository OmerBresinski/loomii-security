// ─── Step 5: Initial Sync ────────────────────────────────────────────────────

import { useEffect, useRef } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { useSyncStatus } from "@/queries/onboarding"
import { useStartSync, useCompleteOnboarding } from "@/mutations/onboarding"

interface InitialSyncProps {
  onComplete: () => void
}

export function InitialSync({ onComplete }: InitialSyncProps) {
  const startSync = useStartSync()
  const completeOnboarding = useCompleteOnboarding()
  const hasStarted = useRef(false)

  // Start the sync on mount
  useEffect(() => {
    if (!hasStarted.current) {
      hasStarted.current = true
      startSync.mutate()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Poll for sync status
  const { data: syncStatus } = useSyncStatus(hasStarted.current)

  // When sync completes, mark onboarding as done and redirect
  useEffect(() => {
    if (syncStatus?.status === "completed") {
      completeOnboarding.mutate(undefined, {
        onSuccess: () => onComplete(),
      })
    }
  }, [syncStatus?.status]) // eslint-disable-line react-hooks/exhaustive-deps

  const progress = syncStatus?.progress ?? 0
  const message = syncStatus?.message ?? "Preparing initial sync..."
  const status = syncStatus?.status ?? "idle"

  return (
    <Card className="mx-auto w-full max-w-lg">
      <CardHeader className="text-center">
        <CardTitle className="text-base">Initial Sync</CardTitle>
        <CardDescription className="text-xs">
          Scanning your connected workspaces for the first time. This usually
          takes a minute or two.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-6 py-8">
        {/* Sync animation */}
        <div className="flex size-16 items-center justify-center">
          {status === "completed" ? (
            <div className="flex size-14 items-center justify-center rounded-full bg-[oklch(0.72_0.12_155)]/10">
              <svg
                width="28"
                height="28"
                viewBox="0 0 28 28"
                fill="none"
                className="text-[oklch(0.72_0.12_155)]"
              >
                <path
                  d="M7 14L12 19L21 10"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          ) : status === "error" ? (
            <div className="flex size-14 items-center justify-center rounded-full bg-destructive/10">
              <svg
                width="28"
                height="28"
                viewBox="0 0 28 28"
                fill="none"
                className="text-destructive"
              >
                <path
                  d="M9 9L19 19M19 9L9 19"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          ) : (
            <div className="flex size-14 items-center justify-center rounded-full bg-muted">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                className="animate-spin text-muted-foreground"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeDasharray="60"
                  strokeDashoffset="15"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          )}
        </div>

        {/* Progress bar */}
        <div className="w-full max-w-xs">
          <Progress value={progress} />
        </div>

        {/* Status message */}
        <p className="text-[13px] text-muted-foreground">{message}</p>

        {/* Percentage */}
        <span className="text-[11px] tabular-nums text-muted-foreground/60">
          {progress}%
        </span>
      </CardContent>
    </Card>
  )
}
