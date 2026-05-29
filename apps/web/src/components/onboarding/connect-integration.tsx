// ─── Shared integration connection card ─────────────────────────────────────

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

export interface ProviderConfig {
  name: string
  endpoint: string
  faviconDomain: string
  description: string
}

export interface ConnectIntegrationProps {
  config: ProviderConfig
  connected: boolean
  onNext: () => void
  onBack?: () => void
  onSkip?: () => void
}

export function ConnectIntegration({
  config,
  connected,
  onNext,
  onBack,
  onSkip,
}: ConnectIntegrationProps) {
  const [error, setError] = useState<string | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)

  async function handleConnect() {
    setError(null)
    setIsConnecting(true)
    try {
      const { redirectUrl } = await fetchApi<{ redirectUrl: string }>(
        config.endpoint,
        {
          method: "POST",
          body: { redirectUrl: `${window.location.origin}/onboarding` },
        }
      )
      window.location.href = redirectUrl
    } catch (err) {
      setIsConnecting(false)
      if (err instanceof ApiError && err.status === 409) {
        setError(`${config.name} is already connected.`)
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
            src={`https://www.google.com/s2/favicons?domain=${config.faviconDomain}&sz=64`}
            alt={config.name}
            className="size-6"
          />
        </div>
        <CardTitle className="text-base">Connect {config.name}</CardTitle>
        <CardDescription className="text-xs">
          {config.description}
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
              Your {config.name} workspace is connected.
            </p>
            <div className="flex items-center gap-3">
              {onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  className="text-[11px] text-muted-foreground hover:text-foreground"
                >
                  Back
                </button>
              )}
              <Button type="button" size="sm" onClick={onNext}>
                Continue
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <Button type="button" size="sm" onClick={handleConnect} disabled={isConnecting}>
              {isConnecting ? "Connecting..." : `Connect ${config.name}`}
            </Button>
            {error && (
              <p className="text-[11px] text-destructive">{error}</p>
            )}
            <div className="flex items-center gap-3">
              {onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  className="text-[11px] text-muted-foreground hover:text-foreground"
                >
                  Back
                </button>
              )}
              {onSkip && (
                <button
                  type="button"
                  onClick={onSkip}
                  className="text-[11px] text-muted-foreground hover:text-foreground"
                >
                  Skip for now
                </button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
