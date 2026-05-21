import { Hono } from "hono";
import type { AppEnv } from "../../lib/types";
import { integrationRoutes } from "./integrations";
import { searchRoutes } from "./search";
import { threatModelRoutes } from "./threat-model";
import { policyRoutes } from "./policies";
import { reviewRoutes } from "./reviews";

export const v1Routes = new Hono<AppEnv>();

// Mount v1 route groups
v1Routes.route("/integrations", integrationRoutes);
v1Routes.route("/search", searchRoutes);
v1Routes.route("/threat-model", threatModelRoutes);
v1Routes.route("/policies", policyRoutes);
v1Routes.route("/reviews", reviewRoutes);

/**
 * GET /api/v1/me - Return current authenticated user info.
 * Used by the frontend to validate the session on app mount.
 */
v1Routes.get("/me", (c) => {
  const user = c.get("user");
  const tenantId = c.get("tenantId");
  const role = c.get("role");

  return c.json({
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
    },
    tenantId,
    role,
  });
});

v1Routes.get("/", (c) => {
  return c.json({ message: "Loomii API v1" });
});
