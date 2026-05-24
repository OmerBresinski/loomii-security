// ─── Step 2: Connect Notion ─────────────────────────────────────────────────

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { fetchApi } from "@/lib/api-client"

interface ConnectNotionProps {
  connected: boolean
  onNext: () => void
  onSkip: () => void
}

export function ConnectNotion({
  connected,
  onNext,
  onSkip,
}: ConnectNotionProps) {
  async function handleConnect() {
    // Call POST endpoint which returns the OAuth redirect URL
    const { redirectUrl } = await fetchApi<{ redirectUrl: string }>(
      "/api/v1/integrations/notion/connect",
      {
        method: "POST",
        body: { redirectUrl: `${window.location.origin}/onboarding` },
      }
    )
    window.location.href = redirectUrl
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
            <Button size="sm" onClick={onNext}>
              Continue
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <Button size="sm" onClick={handleConnect}>
              Connect Notion
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
