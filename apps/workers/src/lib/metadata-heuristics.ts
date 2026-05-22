/**
 * Metadata Heuristics for Project Matching
 *
 * Implements unconditional auto-link rules based on source metadata.
 * These heuristics fire before embedding similarity and always auto-link
 * when a match is found.
 *
 * Heuristics:
 * 1. Same Linear project as an existing ProjectSource
 * 2. Same Linear label as an existing ProjectSource
 * 3. Same Notion parent page as an existing ProjectSource
 * 4. URL cross-reference (content mentions a URL belonging to a project source)
 */
import { db } from "@loomii/db";

/** Regex patterns for extracting source URLs from content */
const NOTION_URL_REGEX = /https?:\/\/(?:www\.)?notion\.so\/(?:[^/]+\/)?([a-f0-9]{32})/gi;
const LINEAR_URL_REGEX = /https?:\/\/linear\.app\/[^/]+\/issue\/([A-Z]+-\d+)/gi;

export interface HeuristicMatch {
  projectId: string;
  signal: string;
  reason: Record<string, unknown>;
}

export interface HeuristicInput {
  tenantId: string;
  sourceType: "linear" | "notion";
  sourceId: string;
  content: string;
  eventPayload: Record<string, unknown>;
}

/**
 * Run all metadata heuristics and return matching projects.
 * Each heuristic is independent; a source may match multiple projects.
 */
export async function runMetadataHeuristics(
  input: HeuristicInput
): Promise<HeuristicMatch[]> {
  const matches: HeuristicMatch[] = [];
  const seenProjectIds = new Set<string>();

  const addMatch = (match: HeuristicMatch) => {
    if (!seenProjectIds.has(match.projectId)) {
      seenProjectIds.add(match.projectId);
      matches.push(match);
    }
  };

  if (input.sourceType === "linear") {
    // Linear-specific heuristics
    const linearProjectMatches = await matchByLinearProject(input);
    linearProjectMatches.forEach(addMatch);

    const linearLabelMatches = await matchByLinearLabels(input);
    linearLabelMatches.forEach(addMatch);
  } else {
    // Notion-specific heuristics
    const notionParentMatches = await matchByNotionParent(input);
    notionParentMatches.forEach(addMatch);
  }

  // URL cross-reference (applies to both source types)
  const urlMatches = await matchByUrlCrossReference(input);
  urlMatches.forEach(addMatch);

  return matches;
}

/**
 * Heuristic 1: Same Linear project.
 * If the incoming event belongs to a Linear project, and another issue
 * from that same Linear project is already linked to an internal Project,
 * auto-link this event to the same internal Project.
 */
async function matchByLinearProject(
  input: HeuristicInput
): Promise<HeuristicMatch[]> {
  const linearProjectId = (input.eventPayload as any)?.projectId as string | undefined;
  if (!linearProjectId) return [];

  // Find existing ProjectSources for LINEAR_ISSUE type in this tenant
  // that belong to the same Linear project.
  // We need to check event payloads of other sources - look for sources
  // whose sourceId maps to an event with the same Linear projectId.
  const existingSources = await db.$queryRaw<Array<{ project_id: string }>>`
    SELECT DISTINCT ps.project_id
    FROM project_sources ps
    JOIN projects p ON p.id = ps.project_id
    JOIN events e ON e.external_id = ps.source_id AND e.tenant_id = p.tenant_id
    WHERE p.tenant_id = ${input.tenantId}
      AND ps.source_type = 'LINEAR_ISSUE'
      AND ps.is_archived = false
      AND ps.unlinked_at IS NULL
      AND (e.payload->>'projectId') = ${linearProjectId}
  `;

  return existingSources.map((row) => ({
    projectId: row.project_id,
    signal: "linear_project",
    reason: { signal: "linear_project", linearProjectId },
  }));
}

/**
 * Heuristic 2: Same Linear label.
 * If the incoming event shares a label with another issue already linked
 * to an internal Project, auto-link.
 */
async function matchByLinearLabels(
  input: HeuristicInput
): Promise<HeuristicMatch[]> {
  const labelIds = (input.eventPayload as any)?.labelIds as string[] | undefined;
  if (!labelIds || labelIds.length === 0) return [];

  // Find project sources for LINEAR_ISSUE where the event has overlapping labels
  const existingSources = await db.$queryRaw<Array<{ project_id: string; label_id: string }>>`
    SELECT DISTINCT ps.project_id, label_elem.value as label_id
    FROM project_sources ps
    JOIN projects p ON p.id = ps.project_id
    JOIN events e ON e.external_id = ps.source_id AND e.tenant_id = p.tenant_id,
    jsonb_array_elements_text(e.payload->'labelIds') AS label_elem(value)
    WHERE p.tenant_id = ${input.tenantId}
      AND ps.source_type = 'LINEAR_ISSUE'
      AND ps.is_archived = false
      AND ps.unlinked_at IS NULL
      AND label_elem.value = ANY(${labelIds})
  `;

  // Deduplicate by project_id, keep first matching label
  const projectMap = new Map<string, string>();
  for (const row of existingSources) {
    if (!projectMap.has(row.project_id)) {
      projectMap.set(row.project_id, row.label_id);
    }
  }

  return Array.from(projectMap.entries()).map(([projectId, labelId]) => ({
    projectId,
    signal: "linear_label",
    reason: { signal: "linear_label", matchedLabelId: labelId },
  }));
}

/**
 * Heuristic 3: Same Notion parent page.
 * If the incoming Notion page has the same parent as another page already
 * linked to an internal Project, auto-link.
 *
 * NOTE: Currently depends on `parentPageId` being present in the event payload.
 * The Notion polling handler does NOT store this today — this heuristic will
 * only fire once the polling processor is updated to include `parentPageId`.
 */
async function matchByNotionParent(
  input: HeuristicInput
): Promise<HeuristicMatch[]> {
  // For Notion events, the parentPageId may be in the event payload
  // or we can derive it from the pageId by checking existing events
  const parentPageId = (input.eventPayload as any)?.parentPageId as string | undefined;
  if (!parentPageId) return [];

  // Find other Notion pages with the same parent that are linked to projects
  const existingSources = await db.$queryRaw<Array<{ project_id: string }>>`
    SELECT DISTINCT ps.project_id
    FROM project_sources ps
    JOIN projects p ON p.id = ps.project_id
    JOIN events e ON e.external_id = ps.source_id AND e.tenant_id = p.tenant_id
    WHERE p.tenant_id = ${input.tenantId}
      AND ps.source_type = 'NOTION_PAGE'
      AND ps.is_archived = false
      AND ps.unlinked_at IS NULL
      AND (e.payload->>'parentPageId') = ${parentPageId}
      AND ps.source_id != ${input.sourceId}
  `;

  return existingSources.map((row) => ({
    projectId: row.project_id,
    signal: "notion_parent",
    reason: { signal: "notion_parent", parentPageId },
  }));
}

/**
 * Heuristic 4: URL cross-reference.
 * If the event content mentions a Notion URL or Linear issue identifier
 * that belongs to a source already linked to a project, auto-link.
 */
async function matchByUrlCrossReference(
  input: HeuristicInput
): Promise<HeuristicMatch[]> {
  if (!input.content) return [];

  // Extract all referenced source IDs from content
  const referencedIds = new Set<string>();

  // Notion page IDs from URLs
  let match: RegExpExecArray | null;
  const notionRegex = new RegExp(NOTION_URL_REGEX.source, NOTION_URL_REGEX.flags);
  while ((match = notionRegex.exec(input.content)) !== null) {
    referencedIds.add(match[1]);
  }

  // Linear issue identifiers from URLs and text
  const linearUrlRegex = new RegExp(LINEAR_URL_REGEX.source, LINEAR_URL_REGEX.flags);
  while ((match = linearUrlRegex.exec(input.content)) !== null) {
    referencedIds.add(match[1]);
  }

  if (referencedIds.size === 0) return [];

  const refArray = Array.from(referencedIds);

  // Find projects that have these sources linked
  const existingSources = await db.projectSource.findMany({
    where: {
      sourceId: { in: refArray },
      isArchived: false,
      unlinkedAt: null,
      project: { tenantId: input.tenantId },
    },
    select: {
      projectId: true,
      sourceId: true,
    },
    distinct: ["projectId"],
  });

  return existingSources.map((row) => ({
    projectId: row.projectId,
    signal: "url_cross_reference",
    reason: { signal: "url_cross_reference", referencedSourceId: row.sourceId },
  }));
}
