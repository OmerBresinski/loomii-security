// ─── Step 2: Connect Notion ─────────────────────────────────────────────────

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { fetchApi, ApiError } from "@/lib/api-client"

interface ConnectNotionProps {
  connected: boolean
  onNext: () => void
  onSkip: () => void
  onBack: () => void
}

export function ConnectNotion({
  connected,
  onNext,
  onSkip,
  onBack,
}: ConnectNotionProps) {
  const [error, setError] = useState<string | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)

  async function handleConnect() {
    setError(null)
    setIsConnecting(true)
    try {
      const { redirectUrl } = await fetchApi<{ redirectUrl: string }>(
        "/api/v1/integrations/notion/connect",
        {
          method: "POST",
          body: { redirectUrl: `${window.location.origin}/onboarding` },
        }
      )
      window.location.href = redirectUrl
    } catch (err) {
      setIsConnecting(false)
      if (err instanceof ApiError && err.status === 409) {
        setError("Notion is already connected.")
      } else {
        setError("Failed to connect. Please try again.")
      }
    }
  }

  return (
    <Card className="mx-auto w-full max-w-lg">
      <CardHeader className="text-center">
        <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-lg bg-muted">
          <img
            src="https://www.google.com/s2/favicons?domain=notion.so&sz=64"
            alt="Notion"
            className="size-6"
          />
        </div>
        <CardTitle className="text-base">Connect Notion</CardTitle>
        <CardDescription className="text-xs">
          Link your Notion workspace to scan pages and databases for security
          findings.
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
              Your Notion workspace is connected.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={onBack}
                className="text-[11px] text-muted-foreground hover:text-foreground"
              >
                Back
              </button>
              <Button size="sm" onClick={onNext}>
                Continue
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <Button size="sm" onClick={handleConnect} disabled={isConnecting}>
              {isConnecting ? "Connecting..." : "Connect Notion"}
            </Button>
            {error && (
              <p className="text-[11px] text-destructive">{error}</p>
            )}
            <div className="flex items-center gap-3">
              <button
                onClick={onBack}
                className="text-[11px] text-muted-foreground hover:text-foreground"
              >
                Back
              </button>
              <button
                onClick={onSkip}
                className="text-[11px] text-muted-foreground hover:text-foreground"
              >
                Skip for now
              </button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
