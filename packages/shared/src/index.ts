// @loomii/shared - Shared types, schemas, constants, and utilities
// Single source of truth for the Loomii monorepo

// Constants (enums as const objects)
export {
  RiskLevel,
  EventType,
  IntegrationProvider,
  IntegrationStatus,
  ReviewStatus,
  FindingStatus,
  Role,
} from "./constants";

// Zod schemas
export {
  // Reviews
  CreateReviewRequestSchema,
  ReviewSchema,
  ListReviewsQuerySchema,
  ReviewListResponseSchema,
  // Integrations
  ConnectIntegrationRequestSchema,
  IntegrationSchema,
  IntegrationListResponseSchema,
  DisconnectIntegrationRequestSchema,
  // Events
  EventSchema,
  ListEventsQuerySchema,
  EventListResponseSchema,
  LinearWebhookPayloadSchema,
  // Projects
  ProjectSourceInputSchema,
  CreateProjectRequestSchema,
  UpdateProjectRequestSchema,
  LinkSourcesRequestSchema,
  ArchiveSourceRequestSchema,
  RelinkSourceRequestSchema,
  ProjectListItemSchema,
  ProjectListResponseSchema,
  ProjectDetailSchema,
} from "./schemas";

// Types (inferred from Zod schemas)
export type {
  CreateReviewRequest,
  Review,
  ListReviewsQuery,
  ReviewListResponse,
  ConnectIntegrationRequest,
  Integration,
  IntegrationListResponse,
  DisconnectIntegrationRequest,
  Event,
  ListEventsQuery,
  EventListResponse,
  LinearWebhookPayload,
  ProjectSourceInput,
  CreateProjectRequest,
  UpdateProjectRequest,
  LinkSourcesRequest,
  ArchiveSourceRequest,
  RelinkSourceRequest,
  ProjectListItem,
  ProjectListResponse,
  ProjectDetail,
} from "./schemas";

// Utilities
export { encrypt, decrypt } from "./utils/encryption";
export { maskTokens } from "./utils/logging";
