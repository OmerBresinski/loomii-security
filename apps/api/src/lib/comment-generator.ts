/**
 * Comment Generator
 *
 * Generates a concise security review comment for posting to Linear/Notion.
 * Uses Claude Haiku via Bedrock for speed (2-3s generation).
 * Falls back to a deterministic template if LLM is unavailable.
 *
 * Format (Option B from TDD):
 *   Security Review — N findings:
 *   • Finding title (Severity)
 *   • Finding title (Severity)
 *   View full details → https://app.loomii.ai/reviews?review={reviewId}
 */
import { generateText } from "ai";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";

const bedrock = createAmazonBedrock({
  region: process.env.AWS_REGION ?? "us-east-1",
});

const HAIKU_MODEL_ID = "us.anthropic.claude-haiku-4-5-20250501-v1:0";

const COMMENT_SYSTEM_PROMPT = `You are a concise security review comment generator. Given a list of security findings, produce a brief summary comment suitable for posting on a Linear issue or Notion page.

Format:
Security Review — {N} findings:
• {Finding title} ({Severity})
• {Finding title} ({Severity})
...

View full details → {reviewUrl}

Rules:
- List ALL findings in bullet points
- Include severity in parentheses (Critical, High, Medium, Low)
- Order by severity (Critical first, then High, Medium, Low)
- Keep each bullet to one line — just the title and severity
- Do NOT add commentary, explanations, or recommendations
- Do NOT include a greeting or sign-off
- Output ONLY the formatted comment, nothing else`;

interface FindingSummary {
  title: string;
  severity: string;
}

// Severity ordering for deterministic fallback (lower = higher priority)
const SEVERITY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/**
 * Deterministic fallback comment when LLM is unavailable.
 * Produces identical format to the LLM output — just without AI polish.
 */
function generateFallbackComment(
  findings: FindingSummary[],
  reviewId: string
): string {
  const url = `https://app.loomii.ai/reviews?review=${reviewId}`;
  const sorted = [...findings].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99)
  );
  const bullets = sorted
    .map((f) => `• ${f.title} (${capitalize(f.severity)})`)
    .join("\n");
  return `Security Review \u2014 ${findings.length} findings:\n${bullets}\n\nView full details \u2192 ${url}`;
}

/**
 * Generate a review comment for posting to external sources.
 * Attempts LLM generation first, falls back to deterministic template on failure.
 */
export async function generateReviewComment(
  findings: FindingSummary[],
  reviewId: string
): Promise<string> {
  const reviewUrl = `https://app.loomii.ai/reviews?review=${reviewId}`;

  try {
    const { text } = await generateText({
      model: bedrock(HAIKU_MODEL_ID),
      system: COMMENT_SYSTEM_PROMPT,
      prompt: JSON.stringify({
        findings: findings.map((f) => ({
          title: f.title,
          severity: f.severity,
        })),
        reviewUrl,
      }),
      abortSignal: AbortSignal.timeout(10_000),
    });

    const trimmed = text.trim();

    // Guard against empty LLM responses
    if (!trimmed) {
      console.warn("[comment-generator] LLM returned empty response, using fallback");
      return generateFallbackComment(findings, reviewId);
    }

    return trimmed;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.warn(`[comment-generator] LLM generation failed (${message}), using fallback`);
    return generateFallbackComment(findings, reviewId);
  }
}
