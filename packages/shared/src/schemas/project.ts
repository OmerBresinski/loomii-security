/**
 * Project Zod Schemas
 *
 * Validation schemas for the Project CRUD API.
 * Exported from @loomii/shared for frontend reuse.
 */
import { z } from "zod";

// ===========================================
// Request Schemas
// ===========================================

/** Source to link when creating a project */
export const ProjectSourceInputSchema = z.object({
  sourceType: z.enum(["NOTION_PAGE", "LINEAR_ISSUE"]),
  sourceId: z.string().min(1),
});
export type ProjectSourceInput = z.infer<typeof ProjectSourceInputSchema>;

/** POST /api/v1/projects */
export const CreateProjectRequestSchema = z.object({
  name: z.string().min(1).max(255),
  sources: z.array(ProjectSourceInputSchema).optional(),
});
export type CreateProjectRequest = z.infer<typeof CreateProjectRequestSchema>;

/** PATCH /api/v1/projects/:id */
export const UpdateProjectRequestSchema = z.object({
  name: z.string().min(1).max(255).optional(),
});
export type UpdateProjectRequest = z.infer<typeof UpdateProjectRequestSchema>;

/** POST /api/v1/projects/:id/sources */
export const LinkSourcesRequestSchema = z.object({
  sources: z.array(ProjectSourceInputSchema).min(1),
});
export type LinkSourcesRequest = z.infer<typeof LinkSourcesRequestSchema>;

/** PATCH /api/v1/projects/:id/sources/:sourceId */
export const ArchiveSourceRequestSchema = z.object({
  isArchived: z.boolean(),
});
export type ArchiveSourceRequest = z.infer<typeof ArchiveSourceRequestSchema>;

/** POST /api/v1/projects/:id/sources/relink */
export const RelinkSourceRequestSchema = z.object({
  sourceId: z.string().min(1),
  targetProjectId: z.string().min(1),
});
export type RelinkSourceRequest = z.infer<typeof RelinkSourceRequestSchema>;

// ===========================================
// Response Schemas
// ===========================================

/** Project list item */
export const ProjectListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  sourceCount: z.number(),
  reviewCount: z.number(),
  highestRisk: z.string().nullable(),
  lastActivity: z.string().nullable(),
  createdAt: z.string(),
});
export type ProjectListItem = z.infer<typeof ProjectListItemSchema>;

/** GET /api/v1/projects response */
export const ProjectListResponseSchema = z.object({
  projects: z.array(ProjectListItemSchema),
});
export type ProjectListResponse = z.infer<typeof ProjectListResponseSchema>;

/** GET /api/v1/projects/:id response */
export const ProjectDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  summary: z.string().nullable(),
  summaryUpdatedAt: z.string().nullable(),
  sourceCount: z.number(),
  reviewCount: z.number(),
  highestRisk: z.string().nullable(),
  lastActivity: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ProjectDetail = z.infer<typeof ProjectDetailSchema>;
