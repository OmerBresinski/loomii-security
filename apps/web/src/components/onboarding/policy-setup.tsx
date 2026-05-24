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

interface PolicyCategory {
  id: string
  label: string
  description: string
  framework: string
}

const POLICY_CATEGORIES: PolicyCategory[] = [
  // OWASP Top 10 2021
  {
    id: "A01",
    label: "Broken Access Control",
    description: "Authorization bypass, privilege escalation, IDOR",
    framework: "OWASP Top 10",
  },
  {
    id: "A02",
    label: "Cryptographic Failures",
    description: "Weak encryption, data exposure, missing TLS",
    framework: "OWASP Top 10",
  },
  {
    id: "A03",
    label: "Injection",
    description: "SQL, NoSQL, OS command, and LDAP injection",
    framework: "OWASP Top 10",
  },
  {
    id: "A04",
    label: "Insecure Design",
    description: "Missing security controls, flawed architecture",
    framework: "OWASP Top 10",
  },
  {
    id: "A05",
    label: "Security Misconfiguration",
    description: "Default configs, unnecessary features, error handling",
    framework: "OWASP Top 10",
  },
  {
    id: "A06",
    label: "Vulnerable Components",
    description: "Known CVEs in dependencies, outdated libraries",
    framework: "OWASP Top 10",
  },
  {
    id: "A07",
    label: "Auth & Session Failures",
    description: "Broken authentication, session management flaws",
    framework: "OWASP Top 10",
  },
  {
    id: "A08",
    label: "Data Integrity Failures",
    description: "Insecure deserialization, untrusted CI/CD pipelines",
    framework: "OWASP Top 10",
  },
  {
    id: "A09",
    label: "Logging & Monitoring Failures",
    description: "Insufficient logging, alerting, and audit trails",
    framework: "OWASP Top 10",
  },
  {
    id: "A10",
    label: "Server-Side Request Forgery",
    description: "SSRF attacks, internal resource access",
    framework: "OWASP Top 10",
  },
  // OWASP LLM Top 10
  {
    id: "LLM01",
    label: "Prompt Injection",
    description: "Direct and indirect prompt manipulation attacks",
    framework: "OWASP LLM Top 10",
  },
  {
    id: "LLM02",
    label: "Insecure Output Handling",
    description: "Unvalidated LLM output passed to downstream systems",
    framework: "OWASP LLM Top 10",
  },
  {
    id: "LLM03",
    label: "Training Data Poisoning",
    description: "Manipulated training data introducing vulnerabilities",
    framework: "OWASP LLM Top 10",
  },
  {
    id: "LLM04",
    label: "Model Denial of Service",
    description: "Resource exhaustion via crafted inputs to LLMs",
    framework: "OWASP LLM Top 10",
  },
  {
    id: "LLM05",
    label: "Supply Chain Vulnerabilities",
    description: "Compromised model sources, plugins, or dependencies",
    framework: "OWASP LLM Top 10",
  },
  {
    id: "LLM06",
    label: "Sensitive Information Disclosure",
    description: "LLM revealing PII, secrets, or proprietary data",
    framework: "OWASP LLM Top 10",
  },
  {
    id: "LLM07",
    label: "Insecure Plugin Design",
    description: "Plugins with excessive permissions or no input validation",
    framework: "OWASP LLM Top 10",
  },
  {
    id: "LLM08",
    label: "Excessive Agency",
    description: "LLM granted too many capabilities or autonomy",
    framework: "OWASP LLM Top 10",
  },
  {
    id: "LLM09",
    label: "Overreliance",
    description: "Blind trust in LLM output without verification",
    framework: "OWASP LLM Top 10",
  },
  {
    id: "LLM10",
    label: "Model Theft",
    description: "Unauthorized extraction or replication of LLM models",
    framework: "OWASP LLM Top 10",
  },
]

interface PolicySetupProps {
  onNext: () => void
  onSkip: () => void
  onBack: () => void
}

export function PolicySetup({ onNext, onSkip, onBack }: PolicySetupProps) {
  // All policies enabled by default
  const [enabled, setEnabled] = useState<Record<string, boolean>>(
    Object.fromEntries(POLICY_CATEGORIES.map((p) => [p.id, true]))
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

  // Group by framework for display
  const frameworks = [...new Set(POLICY_CATEGORIES.map((p) => p.framework))]

  return (
    <Card className="mx-auto w-full max-w-lg">
      <CardHeader className="text-center">
        <CardTitle className="text-base">Security Policies</CardTitle>
        <CardDescription className="text-xs">
          Configure which security policies to monitor. All defaults are
          enabled.
        </CardDescription>
        <div className="flex items-center justify-center gap-2 pt-2">
          <Badge variant="secondary" className="text-[10px]">
            {activeCount}/{POLICY_CATEGORIES.length} active
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="max-h-[360px] overflow-y-auto rounded-md border border-border/50">
          {frameworks.map((framework) => (
            <div key={framework}>
              <div className="sticky top-0 z-10 border-b border-border/30 bg-card px-4 py-2">
                <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  {framework}
                </span>
              </div>
              {POLICY_CATEGORIES.filter((p) => p.framework === framework).map(
                (policy) => (
                  <div
                    key={policy.id}
                    className="flex items-center justify-between border-b border-border/30 px-4 py-3 last:border-b-0"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5 pr-3">
                      <span className="text-[13px] font-medium">
                        {policy.label}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {policy.description}
                      </span>
                    </div>
                    <Switch
                      checked={enabled[policy.id]}
                      onCheckedChange={() => togglePolicy(policy.id)}
                    />
                  </div>
                )
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={onBack}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            Back
          </button>
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
