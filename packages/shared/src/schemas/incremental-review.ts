import { z } from "zod";
import { ReviewFindingSchema } from "./review-output";

/**
 * Output schema for the incremental review agent.
 *
 * The LLM compares old vs new source content and existing findings,
 * then returns which findings to remove and which new findings to add.
 */
export const IncrementalReviewOutputSchema = z.object({
  /** Findings to remove — their referenced content no longer exists or was mitigated */
  remove: z.array(
    z.object({
      /** ID of the existing finding to remove */
      findingId: z.string(),
      /** Explanation of why this finding is no longer relevant (min 10 chars) */
      reason: z.string().min(10),
    })
  ),
  /** New findings to add — for content that was added/modified with security implications */
  add: z.array(ReviewFindingSchema),
});

export type IncrementalReviewOutput = z.infer<
  typeof IncrementalReviewOutputSchema
>;
