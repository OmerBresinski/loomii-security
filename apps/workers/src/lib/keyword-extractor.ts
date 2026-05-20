/**
 * Keyword Extractor
 *
 * Simple pattern-matching keyword extraction from context text.
 * Maps detected terms to policy keywords for mandatory inclusion rules.
 * No LLM involved — purely regex-based for speed and determinism.
 *
 * Each rule maps a set of trigger patterns to the policy keywords they activate.
 * If any trigger pattern matches the context, all associated policy keywords
 * are added to the result set.
 */

export interface KeywordRule {
  /** Regex pattern to match against context text (case-insensitive) */
  patterns: RegExp;
  /** Policy keywords that should be activated when pattern matches */
  policyKeywords: string[];
}

/**
 * Keyword rules mapping context patterns to policy keywords.
 * When a pattern matches, the associated policy keywords are activated,
 * which forces inclusion of policies that contain those keywords.
 */
export const KEYWORD_RULES: KeywordRule[] = [
  {
    patterns: /\b(auth|login|logout|session|oauth|sso|sign.?in|sign.?up|credential|password|mfa|2fa|token)\b/i,
    policyKeywords: ["authentication", "login", "session", "credential", "oauth", "mfa"],
  },
  {
    patterns: /\b(access.?control|permission|rbac|role|privilege|admin|authorize|authorization|acl)\b/i,
    policyKeywords: ["access control", "authorization", "permission", "rbac", "role", "privilege"],
  },
  {
    patterns: /\b(encrypt|decrypt|tls|ssl|certificate|hash|crypto|secret|key.?management|plaintext|aes|rsa)\b/i,
    policyKeywords: ["encryption", "cryptography", "tls", "hash", "secret", "key management"],
  },
  {
    patterns: /\b(sql|inject|xss|cross.?site|sanitize|escape|parameterize|orm|nosql|ldap|template.?injection)\b/i,
    policyKeywords: ["injection", "sql", "xss", "sanitize", "escape", "parameterized"],
  },
  {
    patterns: /\b(threat.?model|security.?design|architecture.?review|abuse.?case|trust.?boundary)\b/i,
    policyKeywords: ["insecure design", "threat modeling", "secure design", "architecture"],
  },
  {
    patterns: /\b(config|hardening|default|header|cors|stack.?trace|error.?message|s3|bucket|cloud.?storage)\b/i,
    policyKeywords: ["misconfiguration", "default", "hardening", "headers", "cloud"],
  },
  {
    patterns: /\b(dependency|npm|package|library|cve|vulnerability|outdated|patch|upgrade|dependabot|snyk)\b/i,
    policyKeywords: ["dependency", "vulnerability", "cve", "outdated", "package", "supply chain"],
  },
  {
    patterns: /\b(log|monitor|audit|alert|siem|observability|tracing|incident)\b/i,
    policyKeywords: ["logging", "monitoring", "audit", "alerting", "detection"],
  },
  {
    patterns: /\b(ssrf|server.?side.?request|internal.?network|metadata|imds|localhost|127\.0\.0\.1)\b/i,
    policyKeywords: ["ssrf", "server-side request forgery", "internal", "metadata"],
  },
  {
    patterns: /\b(ci.?cd|pipeline|deploy|deserialization|serialize|integrity|code.?signing|supply.?chain)\b/i,
    policyKeywords: ["integrity", "ci/cd", "pipeline", "deserialization", "supply chain"],
  },
  {
    patterns: /\b(prompt|llm|gpt|claude|ai.?model|language.?model|chatbot|embedding|fine.?tun|rag)\b/i,
    policyKeywords: ["prompt injection", "llm", "prompt", "model"],
  },
  {
    patterns: /\b(plugin|tool.?call|function.?call|agent|action|extension|mcp)\b/i,
    policyKeywords: ["plugin", "tool", "function calling", "agent", "action"],
  },
  {
    patterns: /\b(pii|personal.?data|gdpr|privacy|sensitive.?data|data.?leak|exfiltrat)\b/i,
    policyKeywords: ["information disclosure", "pii", "privacy", "sensitive data", "data leakage"],
  },
  {
    patterns: /\b(rate.?limit|dos|denial.?of.?service|flood|throttl|resource.?exhaust|brute.?force)\b/i,
    policyKeywords: ["denial of service", "rate limit", "dos", "flooding", "brute force"],
  },
  {
    patterns: /\b(payment|stripe|billing|credit.?card|pci|financial|transaction)\b/i,
    policyKeywords: ["encryption", "sensitive data", "pii", "integrity"],
  },
  {
    patterns: /\b(upload|file|download|storage|attachment|blob|multipart)\b/i,
    policyKeywords: ["injection", "misconfiguration", "ssrf", "integrity"],
  },
];

/**
 * Extract policy keywords from context text using pattern matching.
 *
 * Returns deduplicated set of policy keywords that should trigger
 * mandatory policy inclusion.
 *
 * @param context - Text to extract keywords from (context bundle content, summaries, etc.)
 * @returns Array of unique policy keywords that matched
 */
export function extractKeywords(context: string): string[] {
  const matchedKeywords = new Set<string>();

  for (const rule of KEYWORD_RULES) {
    if (rule.patterns.test(context)) {
      for (const keyword of rule.policyKeywords) {
        matchedKeywords.add(keyword);
      }
    }
  }

  return Array.from(matchedKeywords);
}
