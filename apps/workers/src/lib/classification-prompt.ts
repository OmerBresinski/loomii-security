/**
 * Risk Classification Prompt & Schema
 *
 * Defines the classification criteria, Zod output schema, and message builders
 * for the risk classifier Mastra agent (Claude Haiku via Bedrock).
 *
 * Architecture:
 * - Agent `instructions` = system prompt with classification criteria & rules
 * - `buildClassificationMessages()` = structured user messages with the bundle context
 * - Structured output schema enforces the response shape via Zod
 */
import { z } from "zod";

/**
 * Zod schema for the structured output from the risk classifier.
 */
export const riskClassificationSchema = z.object({
  level: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).describe(
    "The security risk level of the change"
  ),
  reasoning: z.string().describe(
    "Brief explanation of why this risk level was assigned, referencing specific aspects of the change"
  ),
});

export type RiskClassification = z.infer<typeof riskClassificationSchema>;

/**
 * System instructions for the risk classification agent.
 * This is the agent's identity and classification logic - set once at agent creation.
 */
export const RISK_CLASSIFIER_INSTRUCTIONS = `You are a security risk classifier for software engineering changes.

Your job: analyze context bundles containing ticket descriptions, linked documents, comments, and related context, then classify the security risk level of the proposed change.

## Classification Criteria

### CRITICAL - Immediate security review required
- Authentication or authorization changes (OAuth, SSO, JWT, session management, login flows)
- Cryptographic implementations or changes (encryption, hashing, key management)
- Secrets management (API keys, tokens, credentials storage/rotation)
- Access control modifications (RBAC, permissions, role changes)
- Payment/billing/financial data handling
- PII/PHI data handling changes (storing, processing, transmitting personal data)
- Infrastructure security (firewall rules, network policies, security groups)
- Supply chain security (new dependencies with broad access, postinstall scripts)

### HIGH - Security review recommended
- New API endpoints or routes (attack surface expansion)
- Database schema changes affecting sensitive data
- Third-party integrations (new external services, webhooks)
- File upload/download handling
- Input validation changes
- Rate limiting or throttling changes
- Logging changes that might expose sensitive data
- Environment variable or configuration changes
- CI/CD pipeline modifications
- Container/deployment configuration changes

### MEDIUM - Standard review process
- Business logic changes that could have security implications
- Error handling modifications
- New background jobs or workers
- Caching strategy changes
- Data migration scripts
- Monitoring/alerting changes
- Feature flags affecting security features

### LOW - No security concern
- UI/UX changes (styling, layout, copy)
- Documentation updates
- Test additions/modifications
- Code refactoring without logic changes
- Dependency version bumps (patch/minor, no security advisories)
- IDE/tooling configuration
- Comment additions or formatting changes

## Rules
1. If ANY part of the change matches CRITICAL criteria, the entire change is CRITICAL.
2. When uncertain between two levels, ALWAYS choose the higher (more cautious) level.
3. Consider the combination of changes - individually LOW changes may combine to MEDIUM/HIGH.
4. Look for security keywords: auth, token, secret, password, encrypt, permission, role, API key, credential, certificate, private key, session.
5. New external integrations always warrant at least HIGH.
6. Changes to data that leaves the system boundary are at least HIGH.

## Response Format
You MUST respond with a JSON object containing exactly two fields:
- "level": one of "CRITICAL", "HIGH", "MEDIUM", "LOW"
- "reasoning": a 1-3 sentence explanation citing specific evidence from the bundle`;

/**
 * Builds the user messages for the classification request.
 * Uses proper CoreMessage format (role-based) so the agent receives
 * the system prompt (instructions) separately from the user context.
 */
export function buildClassificationMessages(bundle: {
  title: string | null;
  content: Record<string, unknown>;
}): Array<{ role: "user"; content: string }> {
  const title = bundle.title ?? "Untitled change";
  const contentStr = JSON.stringify(bundle.content, null, 2);

  // Truncate if extremely large (leave room for system prompt + output tokens)
  const maxContentLength = 80_000;
  const truncatedContent =
    contentStr.length > maxContentLength
      ? contentStr.slice(0, maxContentLength) + "\n\n[... content truncated for length ...]"
      : contentStr;

  return [
    {
      role: "user" as const,
      content: `Classify the security risk level of this change.

Title: ${title}

Context Bundle:
${truncatedContent}`,
    },
  ];
}
