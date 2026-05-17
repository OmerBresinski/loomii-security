import { createMiddleware } from "hono/factory";
import type { Role } from "@loomii/shared";

/**
 * RBAC middleware factory. Restricts access to routes based on user role.
 * The auth middleware must run first and set "role" on context.
 *
 * Usage: app.get("/api/v1/policies", requireRole("ADMIN", "SECURITY_LEAD"), handler)
 *
 * Returns 403 if the user's role is not in the allowed list.
 */
export const requireRole = (...allowedRoles: Role[]) =>
  createMiddleware(async (c, next) => {
    const role = c.get("role") as Role | undefined;

    if (!role || !allowedRoles.includes(role)) {
      return c.json(
        {
          error: {
            code: "FORBIDDEN",
            message: `Access denied. Required role: ${allowedRoles.join(" | ")}`,
            requestId: c.get("requestId") as string,
          },
        },
        403
      );
    }

    await next();
  });
