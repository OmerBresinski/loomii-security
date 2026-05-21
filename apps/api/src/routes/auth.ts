import { Hono } from "hono";
import { getWorkOS } from "../lib/workos";
import { createSession, destroySession } from "../middleware/auth";

export const authRoutes = new Hono();

/**
 * In-memory store for one-time exchange tokens.
 * Maps exchangeId -> { sessionId, user, organizationId, expiresAt }
 * Tokens expire after 60 seconds and are single-use.
 */
interface ExchangeEntry {
  sessionId: string;
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  };
  organizationId: string;
  expiresAt: number;
}

const exchangeStore = new Map<string, ExchangeEntry>();

// Cleanup expired entries every 60s
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of exchangeStore) {
    if (entry.expiresAt < now) {
      exchangeStore.delete(key);
    }
  }
}, 60_000);

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
 * Exchanges the authorization code for user info, creates a server-side session,
 * and redirects to the frontend with a one-time exchange ID.
 */
authRoutes.get("/auth/callback", async (c) => {
  const code = c.req.query("code");
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

  if (!code) {
    return c.redirect(`${frontendUrl}/login?error=missing_code`);
  }

  try {
    const workos = getWorkOS();
    const result = await workos.userManagement.authenticateWithCode({
      code,
      clientId: process.env.WORKOS_CLIENT_ID!,
    });

    const user = {
      id: result.user.id,
      email: result.user.email,
      firstName: result.user.firstName ?? undefined,
      lastName: result.user.lastName ?? undefined,
    };

    // Use organizationId from WorkOS, or a default for dev (personal workspace)
    const organizationId = result.organizationId ?? `personal_${result.user.id}`;

    // Create a server-side session (session ID is the Bearer token)
    const sessionId = createSession({
      user,
      organizationId,
      createdAt: Date.now(),
    });

    // Store session ID under a one-time exchange ID (so token never appears in URL)
    const exchangeId = crypto.randomUUID();
    exchangeStore.set(exchangeId, {
      sessionId,
      user: {
        id: result.user.id,
        email: result.user.email,
        firstName: result.user.firstName,
        lastName: result.user.lastName,
      },
      organizationId,
      expiresAt: Date.now() + 60_000,
    });

    return c.redirect(`${frontendUrl}/auth/callback?exchange_id=${exchangeId}`);
  } catch (error: any) {
    return c.redirect(`${frontendUrl}/login?error=auth_failed`);
  }
});

/**
 * POST /auth/exchange - Exchange a one-time ID for session token + user info.
 * The frontend calls this from the callback route to securely receive the session ID.
 */
authRoutes.post("/auth/exchange", async (c) => {
  const body = await c.req.json<{ exchangeId: string }>().catch(() => null);

  if (!body?.exchangeId) {
    return c.json(
      { error: { code: "BAD_REQUEST", message: "Missing exchangeId" } },
      400
    );
  }

  const entry = exchangeStore.get(body.exchangeId);

  if (!entry) {
    return c.json(
      { error: { code: "INVALID_EXCHANGE", message: "Invalid or expired exchange token" } },
      401
    );
  }

  // One-time use: delete immediately
  exchangeStore.delete(body.exchangeId);

  // Check expiry
  if (entry.expiresAt < Date.now()) {
    return c.json(
      { error: { code: "EXPIRED", message: "Exchange token has expired" } },
      401
    );
  }

  return c.json({
    sessionToken: entry.sessionId,
    user: entry.user,
    organizationId: entry.organizationId,
  });
});

/**
 * POST /auth/logout - Invalidate session
 */
authRoutes.post("/auth/logout", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const sessionId = authHeader.replace("Bearer ", "");
    destroySession(sessionId);
  }
  return c.json({ success: true });
});
