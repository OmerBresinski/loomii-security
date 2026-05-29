/**
 * Review-related types shared between mutations and UI components.
 *
 * DismissalReason mirrors the Prisma DismissalReason enum from @loomii/db.
 * We define it here so the web app (which does not depend on @loomii/db)
 * can use it without importing from UI component modules.
 */

export const DISMISSAL_REASONS = [
  "FALSE_POSITIVE",
  "NOT_APPLICABLE",
  "DUPLICATE",
  "ALREADY_MITIGATED",
] as const

export type DismissalReason = (typeof DISMISSAL_REASONS)[number]
