import { Hono } from "hono";
import type { AppEnv } from "../../lib/types";
import { integrationRoutes } from "./integrations";
import { searchRoutes } from "./search";
import { threatModelRoutes } from "./threat-model";
import { policyRoutes } from "./policies";

export const v1Routes = new Hono<AppEnv>();

// Mount v1 route groups
v1Routes.route("/integrations", integrationRoutes);
v1Routes.route("/search", searchRoutes);
v1Routes.route("/threat-model", threatModelRoutes);
v1Routes.route("/policies", policyRoutes);

v1Routes.get("/", (c) => {
  return c.json({ message: "Loomii API v1" });
});
