import { Hono } from "hono";
import { getWorkOS } from "../lib/workos";

export const authRoutes = new Hono();

/**
 * GET /auth/login - Redirect to WorkOS AuthKit login
 */
authRoutes.get("/auth/login", (c) => {
  const workos = getWorkOS();
  const url = workos.userManagement.getAuthorizationUrl({
    provider: "authkit",
    redirectUri: process.env.WORKOS_REDIRECT_URI!,
    clientId: process.env.WORKOS_CLIENT_ID!,
  });
  return c.redirect(url);
});

/**
 * GET /auth/callback - Handle WorkOS OAuth callback
 * Exchanges the authorization code for a session.
 */
authRoutes.get("/auth/callback", async (c) => {
  const code = c.req.query("code");

  if (!code) {
    return c.json(
      { error: { code: "BAD_REQUEST", message: "Missing authorization code" } },
      400
    );
  }

  try {
    const workos = getWorkOS();
    const result = await workos.userManagement.authenticateWithCode({
      code,
      clientId: process.env.WORKOS_CLIENT_ID!,
    });

    // In production: set session cookie, redirect to frontend
    // For now: return the user info (will be replaced with proper session handling)
    return c.json({
      user: {
        id: result.user.id,
        email: result.user.email,
        firstName: result.user.firstName,
        lastName: result.user.lastName,
      },
      organizationId: result.organizationId,
      accessToken: result.accessToken ? "present" : "absent",
    });
  } catch (error: any) {
    return c.json(
      { error: { code: "AUTH_FAILED", message: error.message } },
      401
    );
  }
});
