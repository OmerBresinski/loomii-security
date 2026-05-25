/**
 * Comment Poster
 *
 * Posts generated review comments to external sources (Linear issues, Notion pages).
 * Uses existing OAuth tokens (encrypted) to authenticate with external APIs.
 * Graceful degradation: if posting fails, it's logged but doesn't block the publish.
 */
import { db } from "@loomii/db";
import { decrypt } from "@loomii/shared";
import { createLinearClient } from "./linear-client";
import { createNotionClient } from "./notion-client";

export interface CommentTarget {
  sourceType: "LINEAR" | "NOTION";
  sourceId: string;
  sourceTitle: string;
}

export interface PostResult {
  sourceId: string;
  success: boolean;
  error?: string;
}

/**
 * Get comment targets for a review (which external sources to post to).
 */
export async function getCommentTargets(
  tenantId: string,
  contextBundleId: string
): Promise<CommentTarget[]> {
  const bundle = await db.contextBundle.findUnique({
    where: { id: contextBundleId },
    include: {
      event: {
        select: {
          source: true,
          externalId: true,
          payload: true,
        },
      },
    },
  });

  if (!bundle || bundle.tenantId !== tenantId) return [];

  const title =
    (bundle.event.payload as any)?.title ??
    (bundle.event.payload as any)?.data?.title ??
    bundle.title ??
    "Unknown";

  return [
    {
      sourceType: bundle.event.source,
      sourceId: bundle.event.externalId,
      sourceTitle: title,
    },
  ];
}

/**
 * Post a comment to all target sources.
 * Returns which sources were successfully posted to.
 * Failures are logged but do not throw.
 */
export async function postCommentToSources(
  tenantId: string,
  targets: CommentTarget[],
  commentText: string
): Promise<PostResult[]> {
  const results: PostResult[] = [];

  for (const target of targets) {
    try {
      // Get the integration for this source type
      const integration = await db.integration.findFirst({
        where: {
          tenantId,
          provider: target.sourceType,
          status: "ACTIVE",
        },
        select: { accessToken: true },
      });

      if (!integration?.accessToken) {
        results.push({
          sourceId: target.sourceId,
          success: false,
          error: "No active integration found",
        });
        continue;
      }

      const accessToken = decrypt(integration.accessToken);

      if (target.sourceType === "LINEAR") {
        await postLinearComment(accessToken, target.sourceId, commentText);
      } else if (target.sourceType === "NOTION") {
        await postNotionComment(accessToken, target.sourceId, commentText);
      }

      results.push({ sourceId: target.sourceId, success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`Failed to post comment to ${target.sourceType}/${target.sourceId}:`, message);
      results.push({ sourceId: target.sourceId, success: false, error: message });
    }
  }

  return results;
}

async function postLinearComment(accessToken: string, issueId: string, body: string): Promise<void> {
  const client = createLinearClient(accessToken);
  await client.createComment({ issueId, body });
}

async function postNotionComment(accessToken: string, pageId: string, body: string): Promise<void> {
  const client = createNotionClient(accessToken);
  await client.comments.create({
    parent: { page_id: pageId },
    rich_text: [{ type: "text", text: { content: body } }],
  });
}
