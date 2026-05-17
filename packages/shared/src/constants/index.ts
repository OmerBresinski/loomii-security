// ===========================================
// Constants - Single source of truth for enums and values
// ===========================================

/**
 * Risk classification levels for security findings
 */
export const RiskLevel = {
  CRITICAL: "CRITICAL",
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
  INFO: "INFO",
} as const;
export type RiskLevel = (typeof RiskLevel)[keyof typeof RiskLevel];

/**
 * Event types from integration sources
 */
export const EventType = {
  // Linear events
  ISSUE_CREATED: "issue.created",
  ISSUE_UPDATED: "issue.updated",
  ISSUE_DELETED: "issue.deleted",
  COMMENT_CREATED: "comment.created",
  COMMENT_UPDATED: "comment.updated",
  // Notion events
  PAGE_CREATED: "page.created",
  PAGE_UPDATED: "page.updated",
  PAGE_DELETED: "page.deleted",
  DATABASE_UPDATED: "database.updated",
} as const;
export type EventType = (typeof EventType)[keyof typeof EventType];

/**
 * Supported integration providers
 */
export const IntegrationProvider = {
  LINEAR: "LINEAR",
  NOTION: "NOTION",
} as const;
export type IntegrationProvider =
  (typeof IntegrationProvider)[keyof typeof IntegrationProvider];

/**
 * Integration connection status
 */
export const IntegrationStatus = {
  ACTIVE: "ACTIVE",
  DISCONNECTED: "DISCONNECTED",
  ERROR: "ERROR",
  PENDING: "PENDING",
} as const;
export type IntegrationStatus =
  (typeof IntegrationStatus)[keyof typeof IntegrationStatus];

/**
 * Review/ContextBundle processing status
 */
export const ReviewStatus = {
  ASSEMBLING: "ASSEMBLING",
  READY: "READY",
  REVIEWING: "REVIEWING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
} as const;
export type ReviewStatus = (typeof ReviewStatus)[keyof typeof ReviewStatus];

/**
 * Finding/event processing status
 */
export const FindingStatus = {
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
} as const;
export type FindingStatus = (typeof FindingStatus)[keyof typeof FindingStatus];

/**
 * User roles for RBAC
 */
export const Role = {
  ADMIN: "ADMIN",
  SECURITY_LEAD: "SECURITY_LEAD",
  DEVELOPER: "DEVELOPER",
  VIEWER: "VIEWER",
} as const;
export type Role = (typeof Role)[keyof typeof Role];
