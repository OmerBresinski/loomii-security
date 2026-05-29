// ─── Step 1: Connect Linear ─────────────────────────────────────────────────

import {
  ConnectIntegration,
  type ProviderConfig,
} from "./connect-integration"

const linearConfig: ProviderConfig = {
  name: "Linear",
  endpoint: "/api/v1/integrations/linear/connect",
  faviconDomain: "linear.app",
  description:
    "Link your Linear workspace to monitor issues and projects for security risks.",
}

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
  return (
    <ConnectIntegration
      config={linearConfig}
      connected={connected}
      onNext={onNext}
      onSkip={onSkip}
    />
  )
}
