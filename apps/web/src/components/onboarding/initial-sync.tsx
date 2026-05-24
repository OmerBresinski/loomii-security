// ─── Step 5: Initial Sync (Two-Stage Backfill Progress) ──────────────────────

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useSyncStatus, type SyncStatus } from "@/queries/onboarding"
import { useStartSync, useCompleteOnboarding } from "@/mutations/onboarding"

interface InitialSyncProps {
  onComplete: () => void
}

// ─── Stage Indicator ─────────────────────────────────────────────────────────

function StageIndicator({ status }: { status: SyncStatus["status"] }) {
  const stage1Active = status === "scanning"
  const stage1Complete = status === "classifying" || status === "triage_complete"
  const stage2Active = status === "classifying"
  const stage2Complete = status === "triage_complete"

  return (
    <div className="flex w-full max-w-xs items-center gap-2">
      {/* Stage 1 dot */}
      <div className="flex items-center gap-1.5">
        <div
          className={`size-2.5 rounded-full ${
            stage1Complete
              ? "bg-[oklch(0.72_0.12_155)]"
              : stage1Active
                ? "bg-[oklch(0.72_0.12_280)]"
                : "bg-muted-foreground/20"
          }`}
        />
        <span
          className={`text-[11px] font-medium ${
            stage1Active
              ? "text-foreground"
              : stage1Complete
                ? "text-muted-foreground"
                : "text-muted-foreground/50"
          }`}
        >
          Scan
        </span>
      </div>

      {/* Connector line */}
      <div
        className={`h-px flex-1 ${
          stage1Complete ? "bg-[oklch(0.72_0.12_155)]/40" : "bg-muted-foreground/15"
        }`}
      />

      {/* Stage 2 dot */}
      <div className="flex items-center gap-1.5">
        <div
          className={`size-2.5 rounded-full ${
            stage2Complete
              ? "bg-[oklch(0.72_0.12_155)]"
              : stage2Active
                ? "bg-[oklch(0.72_0.12_280)]"
                : "bg-muted-foreground/20"
          }`}
        />
        <span
          className={`text-[11px] font-medium ${
            stage2Active
              ? "text-foreground"
              : stage2Complete
                ? "text-muted-foreground"
                : "text-muted-foreground/50"
          }`}
        >
          Classify
        </span>
      </div>
    </div>
  )
}

// ─── Status Icons ────────────────────────────────────────────────────────────

function SpinnerIcon() {
  return (
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
  )
}

function CheckIcon() {
  return (
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
  )
}

function ErrorIcon() {
  return (
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
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function InitialSync({ onComplete }: InitialSyncProps) {
  const startSync = useStartSync()
  const completeOnboarding = useCompleteOnboarding()

  // Poll for sync status. Polling stops on terminal states (query options).
  const { data: syncStatus } = useSyncStatus(true)

  const progress = syncStatus?.progress ?? 0
  const status = syncStatus?.status ?? "idle"
  const total = syncStatus?.total ?? 0
  const projects = syncStatus?.projects ?? 0
  const classified = syncStatus?.classified ?? 0
  const highRisk = syncStatus?.highRisk ?? 0

  // Event handler: retry on error
  function handleRetry() {
    startSync.mutate()
  }

  // Event handler: user confirms completion → POST /complete → redirect
  function handleContinue() {
    completeOnboarding.mutate(undefined, {
      onSuccess: () => onComplete(),
    })
  }

  return (
    <Card className="mx-auto w-full max-w-lg">
      <CardHeader className="text-center">
        <CardTitle className="text-base">Initial Scan</CardTitle>
        <CardDescription className="text-xs">
          Scanning your connected workspaces, organizing into projects, and
          classifying security risk.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-5 py-8">
        {/* Status icon */}
        <div className="flex size-16 items-center justify-center">
          {status === "triage_complete" ? (
            <CheckIcon />
          ) : status === "error" ? (
            <ErrorIcon />
          ) : (
            <SpinnerIcon />
          )}
        </div>

        {/* Stage indicator (visible during scanning/classifying/complete) */}
        {(status === "scanning" || status === "classifying" || status === "triage_complete") && (
          <StageIndicator status={status} />
        )}

        {/* Progress bar */}
        {status !== "error" && status !== "triage_complete" && (
          <div className="w-full max-w-xs">
            <Progress value={progress} />
          </div>
        )}

        {/* Dynamic status message + stats */}
        <div className="flex flex-col items-center gap-2">
          {status === "scanning" && (
            <>
              <p className="text-[13px] text-muted-foreground">
                Scanning & organizing your workspace...
              </p>
              <div className="flex items-center gap-2">
                {total > 0 && (
                  <Badge variant="secondary" className="text-[11px] font-normal">
                    {total} items found
                  </Badge>
                )}
                {projects > 0 && (
                  <Badge variant="secondary" className="text-[11px] font-normal">
                    {projects} projects
                  </Badge>
                )}
              </div>
            </>
          )}

          {status === "classifying" && (
            <>
              <p className="text-[13px] text-muted-foreground">
                Classifying risk...{" "}
                <span className="tabular-nums">
                  {classified}/{total} triaged
                </span>
              </p>
              <div className="flex items-center gap-2">
                {projects > 0 && (
                  <Badge variant="secondary" className="text-[11px] font-normal">
                    {projects} projects
                  </Badge>
                )}
                {highRisk > 0 && (
                  <Badge
                    variant="secondary"
                    className="text-[11px] font-normal text-destructive"
                  >
                    {highRisk} high-risk
                  </Badge>
                )}
              </div>
            </>
          )}

          {status === "triage_complete" && (
            <>
              <p className="text-[13px] font-medium text-foreground">
                Scan complete!
              </p>
              <p className="text-[11px] text-muted-foreground">
                {projects} projects found, {highRisk} items flagged for review.
              </p>
              <Button
                size="sm"
                className="mt-3 h-8 text-xs"
                onClick={handleContinue}
                disabled={completeOnboarding.isPending}
              >
                {completeOnboarding.isPending ? "Finishing..." : "Continue to Reviews"}
              </Button>
            </>
          )}

          {status === "error" && (
            <>
              <p className="text-[13px] text-destructive">
                Something went wrong. Please try again.
              </p>
              {startSync.isError && (
                <p className="text-[11px] text-muted-foreground">
                  Retry failed. Please check your connection.
                </p>
              )}
              <Button
                variant="outline"
                size="sm"
                className="mt-2 h-8 text-xs"
                onClick={handleRetry}
                disabled={startSync.isPending}
              >
                {startSync.isPending ? "Retrying..." : "Retry"}
              </Button>
            </>
          )}

          {(status === "idle" || !syncStatus) && (
            <p className="text-[13px] text-muted-foreground">
              Preparing initial scan...
            </p>
          )}
        </div>

        {/* Progress percentage */}
        {status !== "error" && status !== "triage_complete" && (
          <span className="text-[11px] tabular-nums text-muted-foreground/60">
            {progress}%
          </span>
        )}
      </CardContent>
    </Card>
  )
}
