/**
 * Linear OAuth 2.0 integration.
 * Handles authorization URL generation and token exchange.
 *
 * Docs: https://developers.linear.app/docs/oauth/authentication
 */

const LINEAR_AUTHORIZE_URL = "https://linear.app/oauth/authorize";
const LINEAR_TOKEN_URL = "https://api.linear.app/oauth/token";

/** Required scopes for Loomii's Linear integration (read-only access to workspace) */
const SCOPES = ["read"];

interface LinearOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

interface LinearTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  scope: string | string[];
  refresh_token?: string;
}

function getConfig(): LinearOAuthConfig {
  const clientId = process.env.LINEAR_CLIENT_ID;
  const clientSecret = process.env.LINEAR_CLIENT_SECRET;
  const redirectUri = process.env.LINEAR_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Missing Linear OAuth config. Set LINEAR_CLIENT_ID, LINEAR_CLIENT_SECRET, and LINEAR_REDIRECT_URI."
    );
  }

  return { clientId, clientSecret, redirectUri };
}

/**
 * Generate the Linear OAuth authorization URL.
 * Users are redirected here to grant Loomii access to their Linear workspace.
 *
 * @param state - CSRF protection token (should be stored in session)
 */
export function getLinearAuthorizationUrl(state: string): string {
  const config = getConfig();

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: SCOPES.join(","),
    state,
    prompt: "consent",
  });

  return `${LINEAR_AUTHORIZE_URL}?${params.toString()}`;
}

/**
 * Exchange an authorization code for access tokens.
 * Called from the OAuth callback endpoint after user grants consent.
 *
 * @param code - Authorization code from Linear callback
 */
export async function exchangeLinearCode(
  code: string
): Promise<LinearTokenResponse> {
  const config = getConfig();

  const response = await fetch(LINEAR_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      code,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Linear token exchange failed (${response.status}): ${errorBody}`
    );
  }

  return response.json() as Promise<LinearTokenResponse>;
}

/** Exported for testing */
export { SCOPES, LINEAR_AUTHORIZE_URL, LINEAR_TOKEN_URL };
export type { LinearOAuthConfig, LinearTokenResponse };
