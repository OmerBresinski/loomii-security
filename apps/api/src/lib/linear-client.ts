/**
 * Linear API client utilities.
 * Provides typed access to Linear GraphQL API for:
 * - Verifying token access (viewer query)
 * - Registering webhooks for change detection
 */
import { LinearClient } from "@linear/sdk";

export interface LinearViewerInfo {
  id: string;
  name: string;
  email: string;
  organization: {
    id: string;
    name: string;
  };
}

export interface LinearWebhookResult {
  id: string;
  enabled: boolean;
  resourceTypes: string[];
  secret?: string;
}

/**
 * Create a Linear client from an access token.
 */
export function createLinearClient(accessToken: string): LinearClient {
  return new LinearClient({ accessToken });
}

/**
 * Verify that an access token is valid by calling the Linear viewer query.
 * Returns workspace info on success.
 *
 * @throws Error if the token is invalid or Linear API is unreachable
 */
export async function verifyLinearAccess(
  accessToken: string,
): Promise<LinearViewerInfo> {
  const client = createLinearClient(accessToken);

  const viewer = await client.viewer;
  const organization = await viewer.organization;

  return {
    id: viewer.id,
    name: viewer.name ?? "",
    email: viewer.email ?? "",
    organization: {
      id: organization.id,
      name: organization.name,
    },
  };
}

/**
 * Register webhooks for change detection on a Linear workspace.
 * Subscribes to: Issue create/update, Comment create, Project update
 *
 * @param accessToken - Valid Linear OAuth access token
 * @param callbackUrl - URL to receive webhook events
 * @param resourceTypes - Linear resource types to subscribe to
 * @returns The created webhook with its signing secret
 */
export async function registerLinearWebhooks(
  accessToken: string,
  callbackUrl: string,
  resourceTypes: string[] = ["Issue", "Comment", "Project"],
): Promise<LinearWebhookResult> {
  const client = createLinearClient(accessToken);

  const webhook = await client.createWebhook({
    url: callbackUrl,
    resourceTypes,
    allPublicTeams: true,
  });

  const createdWebhook = await webhook.webhook;

  if (!createdWebhook) {
    throw new Error("Failed to create Linear webhook - no webhook returned");
  }

  return {
    id: createdWebhook.id,
    enabled: createdWebhook.enabled,
    resourceTypes: createdWebhook.resourceTypes,
    secret: createdWebhook.secret ?? undefined,
  };
}
