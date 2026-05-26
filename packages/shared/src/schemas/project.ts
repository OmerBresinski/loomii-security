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
  sourceUrl: z.string().url().optional(),
});
export type ProjectSourceInput = z.infer<typeof ProjectSourceInputSchema>;

/** POST /api/v1/projects */
export const CreateProjectRequestSchema = z.object({
  name: z.string().min(1).max(255),
  icon: z.string().optional(),
  color: z.string().optional(),
  sources: z.array(ProjectSourceInputSchema).optional(),
});
export type CreateProjectRequest = z.infer<typeof CreateProjectRequestSchema>;

/** PATCH /api/v1/projects/:id */
export const UpdateProjectRequestSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  icon: z.string().optional(),
  color: z.string().optional(),
  assignedToId: z.string().nullable().optional(),
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
  icon: z.string(),
  color: z.string(),
  sourceCount: z.number(),
  reviewCount: z.number(),
  highRiskCount: z.number(),
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
export const ProjectAssigneeSchema = z.object({
  id: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  email: z.string(),
});
export type ProjectAssignee = z.infer<typeof ProjectAssigneeSchema>;

export const FindingsBySeveritySchema = z.object({
  critical: z.number(),
  high: z.number(),
  medium: z.number(),
  low: z.number(),
});
export type FindingsBySeverity = z.infer<typeof FindingsBySeveritySchema>;

export const ProjectDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string(),
  color: z.string(),
  summary: z.string().nullable(),
  summaryUpdatedAt: z.string().nullable(),
  sourceCount: z.number(),
  reviewCount: z.number(),
  highRiskCount: z.number(),
  highestRisk: z.string().nullable(),
  lastActivity: z.string().nullable(),
  assignedTo: ProjectAssigneeSchema.nullable(),
  findingsBySeverity: FindingsBySeveritySchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ProjectDetail = z.infer<typeof ProjectDetailSchema>;
