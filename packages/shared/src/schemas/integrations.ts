import { z } from "zod";
import { IntegrationProvider, IntegrationStatus } from "../constants";

// ===========================================
// Integration Schemas (API-facing)
// ===========================================

/**
 * Schema for initiating an OAuth integration connection (input)
 */
export const ConnectIntegrationRequestSchema = z.object({
  provider: z.enum([IntegrationProvider.LINEAR, IntegrationProvider.NOTION]),
  redirectUrl: z.string().url().optional(),
});
export type ConnectIntegrationRequest = z.infer<
  typeof ConnectIntegrationRequestSchema
>;

/**
 * Schema for an integration response (output)
 * Note: Tokens are never exposed in API responses
 */
export const IntegrationSchema = z.object({
  id: z.string().cuid(),
  provider: z.enum([IntegrationProvider.LINEAR, IntegrationProvider.NOTION]),
  status: z.enum([
    IntegrationStatus.ACTIVE,
    IntegrationStatus.DISCONNECTED,
    IntegrationStatus.ERROR,
    IntegrationStatus.PENDING,
  ]),
  externalId: z.string().nullable(),
  lastSyncAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Integration = z.infer<typeof IntegrationSchema>;

/**
 * Schema for listing integrations response
 */
export const IntegrationListResponseSchema = z.object({
  data: z.array(IntegrationSchema),
});
export type IntegrationListResponse = z.infer<
  typeof IntegrationListResponseSchema
>;

/**
 * Schema for disconnect request
 */
export const DisconnectIntegrationRequestSchema = z.object({
  provider: z.enum([IntegrationProvider.LINEAR, IntegrationProvider.NOTION]),
});
export type DisconnectIntegrationRequest = z.infer<
  typeof DisconnectIntegrationRequestSchema
>;
