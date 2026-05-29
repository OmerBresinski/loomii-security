// ─── Step 2: Connect Notion ─────────────────────────────────────────────────

import {
  ConnectIntegration,
  type ProviderConfig,
} from "./connect-integration"

const notionConfig: ProviderConfig = {
  name: "Notion",
  endpoint: "/api/v1/integrations/notion/connect",
  faviconDomain: "notion.so",
  description:
    "Link your Notion workspace to scan pages and databases for security findings.",
}

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
  return (
    <ConnectIntegration
      config={notionConfig}
      connected={connected}
      onNext={onNext}
      onSkip={onSkip}
      onBack={onBack}
    />
  )
}
