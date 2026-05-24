// ─── Step 1: Connect Linear ─────────────────────────────────────────────────

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000"

interface ConnectLinearProps {
  connected: boolean
  onNext: () => void
  onSkip: () => void
}

export function ConnectLinear({
  connected,
  onNext,
  onSkip,
}: ConnectLinearProps) {
  function handleConnect() {
    // Redirect to backend OAuth flow for Linear
    const redirectUrl = encodeURIComponent(
      `${window.location.origin}/onboarding?step=0&oauth=linear`
    )
    window.location.href = `${API_BASE_URL}/api/v1/integrations/linear/connect?redirectUrl=${redirectUrl}`
  }

  return (
    <Card className="mx-auto w-full max-w-lg">
      <CardHeader className="text-center">
        <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-lg bg-muted">
          <img
            src="https://www.google.com/s2/favicons?domain=linear.app&sz=64"
            alt="Linear"
            className="size-6"
          />
        </div>
        <CardTitle className="text-base">Connect Linear</CardTitle>
        <CardDescription className="text-xs">
          Link your Linear workspace to monitor issues and projects for security
          risks.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        {connected ? (
          <div className="flex flex-col items-center gap-3">
            <Badge
              variant="secondary"
              className="bg-[oklch(0.72_0.12_155)]/10 text-[oklch(0.72_0.12_155)]"
            >
              Connected
            </Badge>
            <p className="text-xs text-muted-foreground">
              Your Linear workspace is connected.
            </p>
            <Button size="sm" onClick={onNext}>
              Continue
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <Button size="sm" onClick={handleConnect}>
              Connect Linear
            </Button>
            <button
              onClick={onSkip}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              Skip for now
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
