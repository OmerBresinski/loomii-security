import { createMiddleware } from "hono/factory";
import { getWorkOS } from "../lib/workos";

export type UserRole = "ADMIN" | "SECURITY_LEAD" | "DEVELOPER" | "VIEWER";

export interface AuthUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
}

/**
 * In-memory tenant/user store.
 * Will be replaced with @loomii/db (Prisma) queries once LOO-120 is complete.
 */
const tenantStore = new Map<string, { id: string; workosOrgId: string }>();
const userStore = new Map<string, { id: string; tenantId: string; workosUserId: string; role: UserRole }>();

export const authMiddleware = createMiddleware(async (c, next) => {
  const authHeader = c.req.header("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "Missing or invalid Authorization header",
          requestId: c.get("requestId") as string,
        },
      },
      401
    );
  }

  const token = authHeader.replace("Bearer ", "");

  try {
    const workos = getWorkOS();

    // Verify the session token with WorkOS
    const { user, organizationId } = await workos.userManagement.authenticateWithSessionCookie({
      sessionData: token,
    });

    if (!user || !organizationId) {
      return c.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message: "Invalid session token",
            requestId: c.get("requestId") as string,
          },
        },
        401
      );
    }

    // Resolve or create tenant
    let tenant = tenantStore.get(organizationId);
    if (!tenant) {
      // Auto-create tenant on first login from new org
      tenant = {
        id: crypto.randomUUID(),
        workosOrgId: organizationId,
      };
      tenantStore.set(organizationId, tenant);
    }

    // Resolve or create user within tenant
    const userKey = `${tenant.id}:${user.id}`;
    let dbUser = userStore.get(userKey);
    if (!dbUser) {
      // Check if this is the first user for this tenant
      const isFirstUser = ![...userStore.values()].some(
        (u) => u.tenantId === tenant!.id
      );

      dbUser = {
        id: crypto.randomUUID(),
        tenantId: tenant.id,
        workosUserId: user.id,
        role: isFirstUser ? "ADMIN" : "DEVELOPER",
      };
      userStore.set(userKey, dbUser);
    }

    // Set context for downstream handlers
    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      firstName: user.firstName ?? undefined,
      lastName: user.lastName ?? undefined,
    };

    c.set("user", authUser);
    c.set("userId", user.id);
    c.set("tenantId", tenant.id);
    c.set("role", dbUser.role);

    await next();
  } catch (error) {
    // Log error without exposing token (mask it)
    const maskedToken = token.length > 8
      ? `${token.slice(0, 4)}****${token.slice(-4)}`
      : "****";

    const logger = c.get("logger") as any;
    if (logger) {
      logger.warn(
        { maskedToken, error: (error as Error).message },
        "Auth validation failed"
      );
    }

    return c.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "Invalid or expired session token",
          requestId: c.get("requestId") as string,
        },
      },
      401
    );
  }
});

/**
 * Exported for testing: reset in-memory stores.
 */
export function _resetStores() {
  tenantStore.clear();
  userStore.clear();
}
