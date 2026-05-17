/**
 * Notion API client utilities.
 * Provides typed access to the Notion API for:
 * - Verifying token access (search/users endpoint)
 *
 * Uses the official @notionhq/client SDK.
 * Rate limit awareness: max 3 req/s per integration (enforced upstream).
 */
import { Client } from "@notionhq/client";

export interface NotionWorkspaceInfo {
  botId: string;
  workspaceId: string;
  workspaceName: string;
  ownerType: string;
  ownerUserId?: string;
  ownerUserName?: string;
}

/**
 * Create a Notion client from an access token.
 */
export function createNotionClient(accessToken: string): Client {
  return new Client({ auth: accessToken });
}

/**
 * Verify that an access token is valid by calling the Notion search API.
 * Returns workspace info on success.
 *
 * We use the search API (with empty query, limited to 1 result) as a lightweight
 * way to confirm the token has valid access. This is more reliable than listing
 * users since workspace permissions may restrict user listing.
 *
 * @throws Error if the token is invalid or Notion API is unreachable
 */
export async function verifyNotionAccess(
  accessToken: string
): Promise<NotionWorkspaceInfo> {
  const client = createNotionClient(accessToken);

  // Call search API to verify the token works
  // An empty search with page_size=1 is the lightest-weight check
  const searchResult = await client.search({
    page_size: 1,
  });

  // If we got here without throwing, the token is valid.
  // The search result itself doesn't matter - we just confirmed API access.

  // Also fetch bot info to get workspace metadata
  const me = await client.users.me({});

  return {
    botId: me.id,
    workspaceId: me.id, // Bot ID serves as workspace identifier for the integration
    workspaceName: me.name ?? "Notion Workspace",
    ownerType: me.type,
    ownerUserId: me.type === "bot" ? me.bot?.owner?.type : undefined,
    ownerUserName: me.name ?? undefined,
  };
}
