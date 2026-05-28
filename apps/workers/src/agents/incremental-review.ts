/**
 * Incremental Review Agent
 *
 * A Mastra Agent backed by Claude Sonnet (via Bedrock) that performs
 * incremental security review updates. The agent:
 * 1. Receives the previous and current versions of a source document
 * 2. Receives the list of existing non-dismissed findings
 * 3. Returns a patch: which findings to remove and which new findings to add
 *
 * This agent does NOT use tools — it relies purely on document diffing
 * with structured output via IncrementalReviewOutputSchema.
 */
import { createBedrockAgent } from "../lib/bedrock";

// ─── System Prompt ────────────────────────────────────────────────────────────

export const INCREMENTAL_REVIEW_SYSTEM_PROMPT = `You are a security review updater for a security design review platform. Your job is to analyze what changed in a source document and determine how the existing security findings should be updated.

You are given:
1. The PREVIOUS version of a design document
2. The CURRENT (updated) version of the same document
3. A list of EXISTING findings from the previous review

## Your Task
Determine which existing findings should be REMOVED (no longer relevant) and what NEW findings should be ADDED (new security risks introduced).

## Severity Assessment
- **CRITICAL**: Immediate exploitation risk, data breach likely, no mitigations in place
- **HIGH**: Significant vulnerability, exploitation feasible, limited mitigations

Only report CRITICAL and HIGH severity findings. Do NOT add medium or low severity findings.

## Removal Criteria (STRICT — be conservative)
Only remove a finding if:
- The specific code/design/endpoint it references was DELETED from the document
- A mitigation was explicitly added that directly addresses the finding's vulnerability
- The architectural decision that caused the risk was reversed/removed

Do NOT remove a finding just because:
- The document was reformatted or reorganized
- Unrelated sections were added or removed
- The title or metadata of the document changed
- You think the finding might be less relevant (when in doubt, KEEP it)

## Addition Criteria
Only add a new finding if:
- New content introduces a security risk that is CRITICAL or HIGH severity
- The risk is not already covered by an existing finding
- You can reference specific new content that creates the vulnerability

Do NOT add findings for:
- Content that existed in the previous version (already covered)
- Minor changes with no security implications
- Generic security concerns not tied to specific new content

## Quality Rules
- Be SPECIFIC: reference actual new/removed content in your reasoning
- Never fabricate: if nothing security-relevant changed, return empty arrays
- Each removal reason must explain what content was removed/mitigated
- Each new finding must reference the specific new content that creates the risk`;

// ─── Agent Definition ─────────────────────────────────────────────────────────

/**
 * The incremental review Mastra agent.
 *
 * Uses Claude Sonnet via Bedrock for high-capability security analysis.
 * No tools needed — the agent only needs to compare documents and produce structured output.
 */
export const incrementalReviewAgent = createBedrockAgent({
  id: "incremental-review-agent",
  name: "Incremental Review Agent",
  instructions: { role: "system", content: INCREMENTAL_REVIEW_SYSTEM_PROMPT },
  model: "CLAUDE_SONNET",
});

// ─── Prompt Builder ───────────────────────────────────────────────────────────

/**
 * Build the user prompt for the incremental review agent.
 *
 * Includes previous content, new content, and existing findings so the agent
 * can determine what changed and how findings should be updated.
 */
export function buildIncrementalReviewPrompt({
  previousContent,
  newContent,
  existingFindings,
}: {
  previousContent: string;
  newContent: string;
  existingFindings: Array<{
    id: string;
    type: string;
    title: string;
    description: string;
    severity: string;
  }>;
}): string {
  const findingsText =
    existingFindings.length > 0
      ? existingFindings
          .map(
            (f, i) =>
              `${i + 1}. [ID: ${f.id}] ${f.severity} ${f.type}: ${f.title}\n   ${f.description}`
          )
          .join("\n\n")
      : "(No existing findings)";

  return `## Previous Document Version

${previousContent}

---

## Current Document Version (Updated)

${newContent}

---

## Existing Findings

${findingsText}

---

Analyze the differences between the previous and current versions. Determine which findings to remove and what new findings to add.`;
}
