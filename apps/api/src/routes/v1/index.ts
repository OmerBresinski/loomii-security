import { Hono } from "hono";
import type { AppEnv } from "../../lib/types";
import { integrationRoutes } from "./integrations";

export const v1Routes = new Hono<AppEnv>();

// Mount v1 route groups
v1Routes.route("/integrations", integrationRoutes);

v1Routes.get("/", (c) => {
  return c.json({ message: "Loomii API v1" });
});
