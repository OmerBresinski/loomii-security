// ─── Backfill Complete Banner ─────────────────────────────────────────────────

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useOnboardingState } from "@/queries/onboarding"
import {
  getBackfillBannerDismissed,
  setBackfillBannerDismissed,
} from "@/lib/api-client"

export function BackfillBanner() {
  const [dismissed, setDismissed] = useState(getBackfillBannerDismissed)
  const { data } = useOnboardingState()

  const stats = data?.onboarding?.lastBackfillStats

  // Don't render if: dismissed, no stats, or backfill hasn't completed
  if (dismissed || !stats) return null

  function handleDismiss() {
    setBackfillBannerDismissed()
    setDismissed(true)
  }

  return (
    <div className="mb-4 flex items-center justify-between rounded-md border border-border/50 bg-muted/50 px-4 py-3">
      <div className="flex items-center gap-3">
        <Badge variant="secondary" className="text-[11px] font-normal">
          Scan complete
        </Badge>
        <p className="text-[13px] text-muted-foreground">
          {stats.total} items scanned, {stats.highRisk} security reviews in
          progress. Reviews will appear here as they're generated.
        </p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 shrink-0 text-xs text-muted-foreground"
        onClick={handleDismiss}
      >
        Got it
      </Button>
    </div>
  )
}
