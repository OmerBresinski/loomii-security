/**
 * Comment Generator
 *
 * Generates a concise security review comment for posting to Linear/Notion.
 * Uses Claude Haiku via Bedrock for speed (2-3s generation).
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

export async function generateReviewComment(
  findings: FindingSummary[],
  reviewId: string
): Promise<string> {
  const reviewUrl = `https://app.loomii.ai/reviews?review=${reviewId}`;

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

  return text.trim();
}
