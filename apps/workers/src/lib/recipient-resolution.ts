/**
 * Recipient Resolution
 *
 * Determines which users should receive a notification based on their role
 * and project association. Uses a static rules map that defines role-based
 * targeting per notification type, with optional project-creator inclusion.
 */
import { db, Role } from "@loomii/db";
import type { NotificationType } from "./notifications";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RecipientRule {
  roles: Role[];
  includeProjectCreator: boolean;
}

// ─── Recipient Rules ──────────────────────────────────────────────────────────

/**
 * Static configuration mapping each notification type to its recipient rules.
 *
 * - `roles`: which user roles should receive this notification type
 * - `includeProjectCreator`: if true and a projectId is provided, the project
 *   creator is added to the recipient set (even if they lack the required role)
 */
export const RECIPIENT_RULES: Record<NotificationType, RecipientRule> = {
  review_completed: {
    roles: [Role.ADMIN, Role.SECURITY_LEAD],
    includeProjectCreator: true,
  },
  high_risk_detected: {
    roles: [Role.ADMIN, Role.SECURITY_LEAD],
    includeProjectCreator: false,
  },
  source_linked: {
    roles: [Role.ADMIN],
    includeProjectCreator: true,
  },
  source_archived: {
    roles: [Role.ADMIN],
    includeProjectCreator: true,
  },
  summary_updated: {
    roles: [Role.ADMIN, Role.SECURITY_LEAD],
    includeProjectCreator: true,
  },
};

// ─── Recipient Resolution ─────────────────────────────────────────────────────

/**
 * Resolve the deduplicated list of user IDs who should receive a notification.
 *
 * 1. Queries users in the tenant matching the required roles
 * 2. Optionally adds the project creator (if rule enables it and projectId is provided)
 * 3. Returns a deduplicated array of user IDs
 */
export async function resolveRecipients(
  tenantId: string,
  type: NotificationType,
  projectId: string | null
): Promise<string[]> {
  const rule = RECIPIENT_RULES[type];

  // 1. Get users by role
  const roleUsers = await db.user.findMany({
    where: { tenantId, role: { in: rule.roles } },
    select: { id: true },
  });

  const userIds = new Set(roleUsers.map((u) => u.id));

  // 2. Add project creator if applicable
  if (rule.includeProjectCreator && projectId) {
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { createdById: true },
    });
    if (project?.createdById) {
      userIds.add(project.createdById);
    }
  }

  return Array.from(userIds);
}
