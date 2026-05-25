/**
 * fetchReviewHistory Tool
 *
 * Mastra tool that retrieves the last 5 reviews in the same tenant/project
 * for continuity. The agent uses historical reviews to:
 * - Maintain consistent severity assessments
 * - Reference previously identified threats
 * - Avoid duplicating prior findings
 * - Track the evolution of security posture
 *
 * SLA: Retrieval completes within 1 second.
 */
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { db } from "@loomii/db";

/** Maximum historical reviews to return */
const HISTORY_LIMIT = 5;

export const fetchHistoryTool = createTool({
  id: "fetch-review-history",
  description:
    "Retrieve the last 5 published or approved design reviews for this tenant. Use this to maintain consistency with prior reviews, reference previously identified threats, and track how the security posture has evolved. Call this before generating your review to ensure continuity.",
  inputSchema: z.object({
    lookbackDays: z
      .number()
      .min(1)
      .max(90)
      .default(30)
      .describe("Number of days to look back for historical reviews (default: 30)"),
  }),
  outputSchema: z.object({
    reviews: z.array(
      z.object({
        id: z.string(),
        summary: z.string().nullable(),
        severity: z.string().nullable(),
        confidence: z.number().nullable(),
        status: z.string(),
        modelUsed: z.string().nullable(),
        createdAt: z.string(),
        findingsSummary: z.object({
          total: z.number(),
          threats: z.number(),
          requirements: z.number(),
          mitigations: z.number(),
          criticalCount: z.number(),
          highCount: z.number(),
        }),
      })
    ),
    totalHistorical: z.number(),
  }),
  execute: async (inputData, context) => {
    const tenantId = context?.requestContext?.get("tenantId") as
      | string
      | undefined;

    if (!tenantId) {
      return { reviews: [], totalHistorical: 0 };
    }

    const { lookbackDays } = inputData;
    const lookbackDate = new Date();
    lookbackDate.setDate(lookbackDate.getDate() - lookbackDays);

    // Fetch recent reviews with finding counts
    const reviews = await db.review.findMany({
      where: {
        tenantId,
        status: { in: ["PUBLISHED", "READY"] },
        createdAt: { gte: lookbackDate },
      },
      orderBy: { createdAt: "desc" },
      take: HISTORY_LIMIT,
      select: {
        id: true,
        summary: true,
        severity: true,
        confidence: true,
        status: true,
        modelUsed: true,
        createdAt: true,
        findings: {
          select: {
            type: true,
            severity: true,
          },
        },
      },
    });

    const formattedReviews = reviews.map((review) => ({
      id: review.id,
      summary: review.summary,
      severity: review.severity,
      confidence: review.confidence != null ? review.confidence * 100 : null, // Convert 0-1 to 0-100 for agent
      status: review.status,
      modelUsed: review.modelUsed,
      createdAt: review.createdAt.toISOString(),
      findingsSummary: {
        total: review.findings.length,
        threats: review.findings.filter((f) => f.type === "THREAT").length,
        requirements: review.findings.filter((f) => f.type === "REQUIREMENT").length,
        mitigations: review.findings.filter((f) => f.type === "MITIGATION").length,
        criticalCount: review.findings.filter((f) => f.severity === "CRITICAL").length,
        highCount: review.findings.filter((f) => f.severity === "HIGH").length,
      },
    }));

    return {
      reviews: formattedReviews,
      totalHistorical: formattedReviews.length,
    };
  },
});
