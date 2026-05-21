import { createMiddleware } from "hono/factory";

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
const userStore = new Map<
  string,
  { id: string; tenantId: string; workosUserId: string; role: UserRole }
>();

/**
 * Server-side session store.
 * Maps session ID (opaque token) → authenticated user session data.
 * Will be replaced with Redis/DB-backed sessions in production.
 */
export interface SessionEntry {
  user: AuthUser;
  organizationId: string;
  createdAt: number;
}

export const sessionStore = new Map<string, SessionEntry>();

/**
 * Create a new session and return the session ID.
 * Called by the auth callback after successful WorkOS authentication.
 */
export function createSession(entry: SessionEntry): string {
  const sessionId = crypto.randomUUID();
  sessionStore.set(sessionId, entry);
  return sessionId;
}

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

  // Look up session in server-side store
  const session = sessionStore.get(token);

  if (!session) {
    const logger = c.get("logger") as any;
    if (logger) {
      const maskedToken =
        token.length > 8
          ? `${token.slice(0, 4)}****${token.slice(-4)}`
          : "****";
      logger.warn({ maskedToken }, "Session not found");
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

  const { user, organizationId } = session;

  // Resolve or create tenant
  let tenant = tenantStore.get(organizationId);
  if (!tenant) {
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
    const isFirstUser = !Array.from(userStore.values()).some(
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
  c.set("user", user);
  c.set("userId", user.id);
  c.set("tenantId", tenant.id);
  c.set("role", dbUser.role);

  await next();
});

/**
 * Invalidate a session (logout).
 */
export function destroySession(sessionId: string): boolean {
  return sessionStore.delete(sessionId);
}

/**
 * Exported for testing: reset in-memory stores.
 */
export function _resetStores() {
  tenantStore.clear();
  userStore.clear();
  sessionStore.clear();
}
