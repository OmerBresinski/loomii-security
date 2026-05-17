import { z } from "zod";
import {
  IntegrationProvider,
  FindingStatus,
  EventType,
} from "../constants";

// ===========================================
// Event Schemas (API-facing)
// ===========================================

/**
 * All supported event type values for validation
 */
const EVENT_TYPE_VALUES = [
  EventType.ISSUE_CREATED,
  EventType.ISSUE_UPDATED,
  EventType.ISSUE_DELETED,
  EventType.COMMENT_CREATED,
  EventType.COMMENT_UPDATED,
  EventType.PAGE_CREATED,
  EventType.PAGE_UPDATED,
  EventType.PAGE_DELETED,
  EventType.DATABASE_UPDATED,
] as const;

/**
 * Schema for an event response (output)
 * Note: No tenantId exposed in API responses
 */
export const EventSchema = z.object({
  id: z.string().cuid(),
  integrationId: z.string().cuid(),
  source: z.enum([IntegrationProvider.LINEAR, IntegrationProvider.NOTION]),
  externalId: z.string(),
  type: z.enum(EVENT_TYPE_VALUES),
  status: z.enum([
    FindingStatus.PENDING,
    FindingStatus.PROCESSING,
    FindingStatus.COMPLETED,
    FindingStatus.FAILED,
  ]),
  payload: z.unknown(),
  processedAt: z.string().datetime().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Event = z.infer<typeof EventSchema>;

/**
 * Schema for listing events (query params)
 */
export const ListEventsQuerySchema = z.object({
  source: z
    .enum([IntegrationProvider.LINEAR, IntegrationProvider.NOTION])
    .optional(),
  type: z.enum(EVENT_TYPE_VALUES).optional(),
  status: z
    .enum([
      FindingStatus.PENDING,
      FindingStatus.PROCESSING,
      FindingStatus.COMPLETED,
      FindingStatus.FAILED,
    ])
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});
export type ListEventsQuery = z.infer<typeof ListEventsQuerySchema>;

/**
 * Schema for paginated event list response
 */
export const EventListResponseSchema = z.object({
  data: z.array(EventSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});
export type EventListResponse = z.infer<typeof EventListResponseSchema>;

/**
 * Schema for Linear webhook payload validation
 */
export const LinearWebhookPayloadSchema = z.object({
  action: z.string(),
  type: z.string(),
  data: z.record(z.unknown()),
  createdAt: z.string().datetime(),
  organizationId: z.string().optional(),
  webhookId: z.string().optional(),
});
export type LinearWebhookPayload = z.infer<typeof LinearWebhookPayloadSchema>;
