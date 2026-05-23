/**
 * Notification Content Templates & Deduplication Keys
 *
 * Static template functions that produce notification content (title, body, linkUrl)
 * and deduplication keys (sourceEventId) for each notification type.
 *
 * Also includes a fallback resolver for project context when payloads are missing
 * projectId/projectName (looks up via ContextBundle).
 */
import { db } from "@loomii/db";
import type { NotificationType } from "./notifications";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NotificationContent {
  title: string;
  body: string;
  linkUrl: string;
}

export interface ProjectContext {
  projectId: string | null;
  projectName: string | null;
}

// ─── Content Templates ────────────────────────────────────────────────────────

/**
 * Build notification content (title, body, linkUrl) for a given notification type.
 * Uses static templates with interpolated event data.
 */
export function buildNotificationContent(
  type: NotificationType,
  data: Record<string, unknown>
): NotificationContent {
  const projectName = (data.projectName as string) ?? "Unknown project";

  switch (type) {
    case "review_completed":
      return {
        title: "Security review completed",
        body: `Review for '${projectName}' found ${data.findingCount ?? 0} finding(s)`,
        linkUrl: `/reviews/${data.reviewId}`,
      };
    case "high_risk_detected":
      return {
        title: "High risk detected",
        body: `A ${String(data.severity ?? "high").toLowerCase()} severity issue was identified in '${projectName}'`,
        linkUrl: `/reviews/${data.reviewId}`,
      };
    case "source_linked":
      return {
        title: "Source linked",
        body: `A ${formatSourceType(data.sourceType)} was linked to '${projectName}'`,
        linkUrl: `/projects/${data.projectId}`,
      };
    case "source_archived":
      return {
        title: "Source archived",
        body: `A ${formatSourceType(data.sourceType)} was archived from '${projectName}'`,
        linkUrl: `/projects/${data.projectId}`,
      };
    case "summary_updated":
      return {
        title: "Project summary updated",
        body: `'${projectName}' summary has been regenerated`,
        linkUrl: `/projects/${data.projectId}`,
      };
  }
}

// ─── Source Type Formatting ───────────────────────────────────────────────────

/**
 * Format a source type enum value into a human-readable string.
 */
export function formatSourceType(type: unknown): string {
  return type === "NOTION_PAGE" ? "Notion page" : "Linear issue";
}

// ─── Deduplication Keys ───────────────────────────────────────────────────────

/**
 * Build a deduplication key for a notification based on the event type.
 *
 * IMPORTANT: The `timestamp` parameter comes from `job.data.timestamp` (set at
 * publish time). This ensures the key is stable across BullMQ retries.
 * Do NOT use `Date.now()` here.
 *
 * Returns null for unknown event types (no deduplication applied).
 */
export function buildSourceEventId(
  eventType: string,
  data: Record<string, unknown>,
  timestamp: string
): string | null {
  switch (eventType) {
    case "review.completed":
    case "review.published":
      return `review_completed:${data.reviewId}`;
    case "risk.critical":
      return `high_risk:${data.contextBundleId ?? data.bundleId}`;
    case "source.linked":
      return `source_linked:${data.projectId}:${data.sourceId}`;
    case "source.archived":
      return `source_archived:${data.projectId}:${data.sourceId}`;
    case "summary.updated":
      return `summary_updated:${data.projectId}:${timestamp}`;
    default:
      return null;
  }
}

// ─── Project Context Resolution ───────────────────────────────────────────────

/**
 * Resolve project context from event data, with fallback to ContextBundle lookup.
 *
 * If the event payload already contains projectId and projectName, returns them
 * directly. Otherwise attempts to look up the project via the contextBundleId
 * (or bundleId) in the payload.
 *
 * This handles cases where older event publishers don't include project data
 * in their payloads.
 */
export async function resolveProjectContext(
  data: Record<string, unknown>
): Promise<ProjectContext> {
  // Fast path: both fields present in payload
  if (data.projectId && data.projectName) {
    return {
      projectId: data.projectId as string,
      projectName: data.projectName as string,
    };
  }

  // Fallback: look up via ContextBundle
  const bundleId = (data.contextBundleId ?? data.bundleId) as
    | string
    | undefined;
  if (!bundleId) {
    return { projectId: (data.projectId as string) ?? null, projectName: null };
  }

  const bundle = await db.contextBundle.findUnique({
    where: { id: bundleId },
    select: { projectId: true, project: { select: { name: true } } },
  });

  return {
    projectId: bundle?.projectId ?? (data.projectId as string) ?? null,
    projectName: bundle?.project?.name ?? null,
  };
}
