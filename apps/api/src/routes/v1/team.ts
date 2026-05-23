/**
 * Team Management API
 *
 * GET   /api/v1/team              — Returns all users in the current tenant
 * PATCH /api/v1/team/:userId/role — Updates a user's role (ADMIN only)
 *
 * Includes last-admin protection: cannot demote the only remaining admin.
 */
import { Hono } from "hono";
import { z } from "zod";
import { db } from "@loomii/db";
import type { AppEnv } from "../../lib/types";
import { requireRole } from "../../middleware/rbac";

export const teamRoutes = new Hono<AppEnv>();

/** Valid role values */
const ROLES = ["ADMIN", "SECURITY_LEAD", "DEVELOPER", "VIEWER"] as const;

/** PATCH request body schema */
const patchRoleSchema = z.object({
  role: z.enum(ROLES),
});

/**
 * GET /
 *
 * Returns all team members for the current tenant.
 */
teamRoutes.get("/", async (c) => {
  const tenantId = c.get("tenantId");

  const users = await db.user.findMany({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      updatedAt: true,
      createdAt: true,
    },
  });

  const members = users.map((u) => ({
    id: u.id,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    role: u.role,
    lastActiveAt: u.updatedAt.toISOString(),
    createdAt: u.createdAt.toISOString(),
  }));

  return c.json({ members });
});

/**
 * PATCH /:userId/role
 *
 * Updates a user's role. Requires ADMIN role.
 * Prevents removing the last admin from the tenant.
 */
teamRoutes.patch("/:userId/role", requireRole("ADMIN"), async (c) => {
  const tenantId = c.get("tenantId");
  const requestId = c.get("requestId");
  const targetUserId = c.req.param("userId");

  // Parse body
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      {
        error: {
          code: "INVALID_BODY",
          message: "Request body must be valid JSON",
          requestId,
        },
      },
      400
    );
  }

  // Validate schema
  const result = patchRoleSchema.safeParse(body);
  if (!result.success) {
    return c.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: result.error.issues[0]?.message ?? "Invalid request body",
          requestId,
        },
      },
      400
    );
  }

  const { role: newRole } = result.data;

  // Verify target user belongs to same tenant
  const targetUser = await db.user.findFirst({
    where: { id: targetUserId, tenantId },
  });

  if (!targetUser) {
    return c.json(
      {
        error: {
          code: "NOT_FOUND",
          message: "User not found",
          requestId,
        },
      },
      404
    );
  }

  // Last-admin protection
  if (targetUser.role === "ADMIN" && newRole !== "ADMIN") {
    const adminCount = await db.user.count({
      where: { tenantId, role: "ADMIN" },
    });
    if (adminCount <= 1) {
      return c.json(
        {
          error: {
            code: "LAST_ADMIN",
            message: "Cannot remove the last admin",
            requestId,
          },
        },
        400
      );
    }
  }

  // Update role
  const updated = await db.user.update({
    where: { id: targetUserId },
    data: { role: newRole },
    select: { id: true, role: true },
  });

  return c.json({ id: updated.id, role: updated.role });
});
