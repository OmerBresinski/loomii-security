import { z } from "zod";
import {
  RiskLevel,
  ReviewStatus,
} from "../constants";

// ===========================================
// Context Bundle / Review Schemas (API-facing)
// ===========================================

/**
 * Schema for creating a review request (input)
 */
export const CreateReviewRequestSchema = z.object({
  eventId: z.string().cuid(),
  title: z.string().min(1).max(500).optional(),
});
export type CreateReviewRequest = z.infer<typeof CreateReviewRequestSchema>;

/**
 * Schema for a review/context bundle response (output)
 * Note: No internal fields like tenantId exposed in API responses
 */
export const ReviewSchema = z.object({
  id: z.string().cuid(),
  eventId: z.string().cuid(),
  status: z.enum([
    ReviewStatus.ASSEMBLING,
    ReviewStatus.READY,
    ReviewStatus.REVIEWING,
    ReviewStatus.COMPLETED,
    ReviewStatus.FAILED,
  ]),
  riskLevel: z
    .enum([
      RiskLevel.CRITICAL,
      RiskLevel.HIGH,
      RiskLevel.MEDIUM,
      RiskLevel.LOW,
      RiskLevel.INFO,
    ])
    .nullable(),
  title: z.string().nullable(),
  summary: z.string().nullable(),
  content: z.unknown().nullable(),
  reviewOutput: z.unknown().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Review = z.infer<typeof ReviewSchema>;

/**
 * Schema for listing reviews (query params)
 */
export const ListReviewsQuerySchema = z.object({
  status: z
    .enum([
      ReviewStatus.ASSEMBLING,
      ReviewStatus.READY,
      ReviewStatus.REVIEWING,
      ReviewStatus.COMPLETED,
      ReviewStatus.FAILED,
    ])
    .optional(),
  riskLevel: z
    .enum([
      RiskLevel.CRITICAL,
      RiskLevel.HIGH,
      RiskLevel.MEDIUM,
      RiskLevel.LOW,
      RiskLevel.INFO,
    ])
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});
export type ListReviewsQuery = z.infer<typeof ListReviewsQuerySchema>;

/**
 * Schema for paginated review list response
 */
export const ReviewListResponseSchema = z.object({
  data: z.array(ReviewSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});
export type ReviewListResponse = z.infer<typeof ReviewListResponseSchema>;
