/**
 * Notion OAuth 2.0 integration.
 * Handles authorization URL generation and token exchange.
 *
 * Docs: https://developers.notion.com/docs/authorization
 *
 * Notion uses a slightly non-standard OAuth flow:
 * - Authorization URL: https://api.notion.com/v1/oauth/authorize
 * - Token exchange: https://api.notion.com/v1/oauth/token (Basic auth with client_id:client_secret)
 */

const NOTION_AUTHORIZE_URL = "https://api.notion.com/v1/oauth/authorize";
const NOTION_TOKEN_URL = "https://api.notion.com/v1/oauth/token";

interface NotionOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

interface NotionTokenResponse {
  access_token: string;
  token_type: string;
  bot_id: string;
  workspace_id: string;
  workspace_name: string;
  workspace_icon: string | null;
  duplicated_template_id: string | null;
  owner: {
    type: string;
    user?: {
      id: string;
      name: string;
      avatar_url: string | null;
    };
  };
}

function getConfig(): NotionOAuthConfig {
  const clientId = process.env.NOTION_CLIENT_ID;
  const clientSecret = process.env.NOTION_CLIENT_SECRET;
  const redirectUri = process.env.NOTION_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Missing Notion OAuth config. Set NOTION_CLIENT_ID, NOTION_CLIENT_SECRET, and NOTION_REDIRECT_URI."
    );
  }

  return { clientId, clientSecret, redirectUri };
}

/**
 * Generate the Notion OAuth authorization URL.
 * Users are redirected here to grant Loomii access to their Notion workspace.
 *
 * @param state - CSRF protection token (should be stored in session)
 */
export function getNotionAuthorizationUrl(state: string): string {
  const config = getConfig();

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    owner: "user",
    state,
  });

  return `${NOTION_AUTHORIZE_URL}?${params.toString()}`;
}

/**
 * Exchange an authorization code for an access token.
 * Called from the OAuth callback endpoint after user grants consent.
 *
 * Notion requires Basic auth (client_id:client_secret) for token exchange,
 * unlike most OAuth providers that use POST body params.
 *
 * @param code - Authorization code from Notion callback
 */
export async function exchangeNotionCode(
  code: string
): Promise<NotionTokenResponse> {
  const config = getConfig();

  // Notion uses Basic auth for token exchange
  const credentials = Buffer.from(
    `${config.clientId}:${config.clientSecret}`
  ).toString("base64");

  const response = await fetch(NOTION_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirectUri,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Notion token exchange failed (${response.status}): ${errorBody}`
    );
  }

  return response.json() as Promise<NotionTokenResponse>;
}

/** Exported for testing */
export { NOTION_AUTHORIZE_URL, NOTION_TOKEN_URL };
export type { NotionOAuthConfig, NotionTokenResponse };
