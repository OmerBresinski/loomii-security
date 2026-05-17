import type { Logger } from "pino";
import type { AuthUser, UserRole } from "../middleware/auth";

/**
 * Hono app environment type.
 * Declares all context variables set by middleware.
 */
export type AppEnv = {
  Variables: {
    requestId: string;
    logger: Logger;
    user: AuthUser;
    userId: string;
    tenantId: string;
    role: UserRole;
  };
};
