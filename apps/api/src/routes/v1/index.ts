import { Hono } from "hono";
import type { AppEnv } from "../../lib/types";
import { db } from "@loomii/db";
import { integrationRoutes } from "./integrations";
import { searchRoutes } from "./search";
import { sourceRoutes } from "./sources";
import { projectRoutes } from "./projects";
import { threatModelRoutes } from "./threat-model";
import { policyRoutes } from "./policies";
import { reviewRoutes } from "./reviews";
import { findingRoutes } from "./findings";
import { notificationRoutes } from "./notifications";
import { teamRoutes } from "./team";
import { onboardingRoutes } from "./onboarding";
import { usageRoutes } from "./usage";

export const v1Routes = new Hono<AppEnv>();

// Mount v1 route groups
v1Routes.route("/integrations", integrationRoutes);
v1Routes.route("/search", searchRoutes);
v1Routes.route("/sources", sourceRoutes);
v1Routes.route("/projects", projectRoutes);
v1Routes.route("/threat-model", threatModelRoutes);
v1Routes.route("/policies", policyRoutes);
v1Routes.route("/reviews", reviewRoutes);
v1Routes.route("/findings", findingRoutes);
v1Routes.route("/notifications", notificationRoutes);
v1Routes.route("/team", teamRoutes);
v1Routes.route("/onboarding", onboardingRoutes);
v1Routes.route("/usage", usageRoutes);

/**
 * GET /api/v1/me - Return current authenticated user info.
 * Used by the frontend to validate the session on app mount.
 */
v1Routes.get("/me", async (c) => {
  const user = c.get("user");
  const tenantId = c.get("tenantId");
  const role = c.get("role");

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { onboardingCompleted: true },
  });

  return c.json({
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
    },
    tenantId,
    role,
    onboardingCompleted: tenant?.onboardingCompleted ?? false,
  });
});

v1Routes.get("/", (c) => {
  return c.json({ message: "Loomii API v1" });
});
