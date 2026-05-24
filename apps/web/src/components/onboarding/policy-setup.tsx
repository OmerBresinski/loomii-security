// ─── Step 3: Security Policy Setup ──────────────────────────────────────────

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { useConfigurePolicies } from "@/mutations/onboarding"

// ─── OWASP Policy Categories ────────────────────────────────────────────────

const OWASP_POLICIES = [
  {
    id: "A01",
    label: "Broken Access Control",
    description: "Authorization bypass, privilege escalation, IDOR",
  },
  {
    id: "A02",
    label: "Cryptographic Failures",
    description: "Weak encryption, data exposure, missing TLS",
  },
  {
    id: "A03",
    label: "Injection",
    description: "SQL, NoSQL, OS command, and LDAP injection",
  },
  {
    id: "A04",
    label: "Insecure Design",
    description: "Missing security controls, flawed architecture",
  },
  {
    id: "A05",
    label: "Security Misconfiguration",
    description: "Default configs, unnecessary features, error handling",
  },
  {
    id: "A06",
    label: "Vulnerable Components",
    description: "Known CVEs in dependencies, outdated libraries",
  },
  {
    id: "A07",
    label: "Auth & Session Failures",
    description: "Broken authentication, session management flaws",
  },
  {
    id: "A08",
    label: "Data Integrity Failures",
    description: "Insecure deserialization, untrusted CI/CD pipelines",
  },
  {
    id: "A09",
    label: "Logging & Monitoring Failures",
    description: "Insufficient logging, alerting, and audit trails",
  },
  {
    id: "A10",
    label: "Server-Side Request Forgery",
    description: "SSRF attacks, internal resource access",
  },
]

interface PolicySetupProps {
  onNext: () => void
  onSkip: () => void
}

export function PolicySetup({ onNext, onSkip }: PolicySetupProps) {
  // All OWASP defaults are on initially
  const [enabled, setEnabled] = useState<Record<string, boolean>>(
    Object.fromEntries(OWASP_POLICIES.map((p) => [p.id, true]))
  )

  const configurePolicies = useConfigurePolicies()

  function togglePolicy(id: string) {
    setEnabled((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function handleContinue() {
    const enabledPolicies = Object.entries(enabled)
      .filter(([, v]) => v)
      .map(([k]) => k)

    configurePolicies.mutate(
      { enabledPolicies },
      {
        onSuccess: () => onNext(),
      }
    )
  }

  const activeCount = Object.values(enabled).filter(Boolean).length

  return (
    <Card className="mx-auto w-full max-w-lg">
      <CardHeader className="text-center">
        <CardTitle className="text-base">Security Policies</CardTitle>
        <CardDescription className="text-xs">
          Configure which security policies to monitor. OWASP Top 10 defaults
          are enabled.
        </CardDescription>
        <div className="flex items-center justify-center gap-2 pt-2">
          <Badge variant="secondary" className="text-[10px]">
            {activeCount}/{OWASP_POLICIES.length} active
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="max-h-[320px] overflow-y-auto rounded-md border border-border/50">
          {OWASP_POLICIES.map((policy) => (
            <div
              key={policy.id}
              className="flex items-center justify-between border-b border-border/30 px-4 py-3 last:border-b-0"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5 pr-3">
                <span className="text-[13px] font-medium">{policy.label}</span>
                <span className="text-[11px] text-muted-foreground">
                  {policy.description}
                </span>
              </div>
              <Switch
                checked={enabled[policy.id]}
                onCheckedChange={() => togglePolicy(policy.id)}
              />
            </div>
          ))}
        </div>

        <div className="flex items-center justify-center gap-3 pt-2">
          <Button
            size="sm"
            onClick={handleContinue}
            disabled={configurePolicies.isPending}
          >
            {configurePolicies.isPending ? "Saving..." : "Continue"}
          </Button>
          <button
            onClick={onSkip}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            Skip (keep defaults)
          </button>
        </div>
      </CardContent>
    </Card>
  )
}
