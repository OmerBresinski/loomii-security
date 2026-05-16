import { Hono } from "hono";

export const v1Routes = new Hono();

// v1 route group - individual routes will be mounted here in future tasks
// Example: v1Routes.route("/tenants", tenantRoutes);
// Example: v1Routes.route("/integrations", integrationRoutes);

v1Routes.get("/", (c) => {
  return c.json({ message: "Loomii API v1" });
});
