/**
 * Linear Fetcher - Parallel fetch of all context related to a Linear issue.
 *
 * Fetches: full ticket, project, comments, parent/child issues,
 * linked Notion docs (via cross-reference), and sibling issues (up to 20).
 */
import { LinearClient } from "@linear/sdk";
import { fetchWithTimeout } from "./fetch-timeout";

const FETCH_TIMEOUT = 30_000; // 30s per individual fetch
const MAX_SIBLINGS = 20;

export interface LinearTicketContext {
  ticket: Record<string, unknown> | null;
  project: Record<string, unknown> | null;
  comments: Array<Record<string, unknown>>;
  parentIssue: Record<string, unknown> | null;
  childIssues: Array<Record<string, unknown>>;
  siblingIssues: Array<Record<string, unknown>>;
  linkedNotionUrls: string[];
}

export function createLinearClient(accessToken: string): LinearClient {
  return new LinearClient({ accessToken });
}

/**
 * Fetches the full issue with all relevant fields.
 */
async function fetchTicket(
  client: LinearClient,
  issueId: string
): Promise<Record<string, unknown>> {
  const issue = await client.issue(issueId);
  const state = await issue.state;
  const assignee = await issue.assignee;
  const labels = await issue.labels();

  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    description: issue.description ?? null,
    priority: issue.priority,
    priorityLabel: issue.priorityLabel,
    state: state ? { id: state.id, name: state.name, type: state.type } : null,
    assignee: assignee
      ? { id: assignee.id, name: assignee.name, email: assignee.email }
      : null,
    labels: labels.nodes.map((l) => ({ id: l.id, name: l.name })),
    url: issue.url,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
  };
}

/**
 * Fetches the project associated with the issue.
 */
async function fetchProject(
  client: LinearClient,
  issueId: string
): Promise<Record<string, unknown> | null> {
  const issue = await client.issue(issueId);
  const project = await issue.project;
  if (!project) return null;

  return {
    id: project.id,
    name: project.name,
    description: project.description ?? null,
    state: project.state,
    url: project.url,
    startDate: project.startDate ?? null,
    targetDate: project.targetDate ?? null,
  };
}

/**
 * Fetches all comments on the issue.
 */
async function fetchComments(
  client: LinearClient,
  issueId: string
): Promise<Array<Record<string, unknown>>> {
  const issue = await client.issue(issueId);
  const comments = await issue.comments();

  return comments.nodes.map((c) => ({
    id: c.id,
    body: c.body,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  }));
}

/**
 * Fetches parent issue if one exists.
 */
async function fetchParentIssue(
  client: LinearClient,
  issueId: string
): Promise<Record<string, unknown> | null> {
  const issue = await client.issue(issueId);
  const parent = await issue.parent;
  if (!parent) return null;

  return {
    id: parent.id,
    identifier: parent.identifier,
    title: parent.title,
    description: parent.description ?? null,
    url: parent.url,
  };
}

/**
 * Fetches child (sub) issues.
 */
async function fetchChildIssues(
  client: LinearClient,
  issueId: string
): Promise<Array<Record<string, unknown>>> {
  const issue = await client.issue(issueId);
  const children = await issue.children();

  return children.nodes.map((c) => ({
    id: c.id,
    identifier: c.identifier,
    title: c.title,
    description: c.description ?? null,
    url: c.url,
    priority: c.priority,
  }));
}

/**
 * Fetches sibling issues (same project or team, up to MAX_SIBLINGS).
 */
async function fetchSiblingIssues(
  client: LinearClient,
  issueId: string
): Promise<Array<Record<string, unknown>>> {
  const issue = await client.issue(issueId);
  const team = await issue.team;
  if (!team) return [];

  // Fetch recent issues from the same team (excluding current issue)
  const issues = await team.issues({
    first: MAX_SIBLINGS + 1,
    orderBy: { updatedAt: "DESC" } as any,
  });

  return issues.nodes
    .filter((i) => i.id !== issueId)
    .slice(0, MAX_SIBLINGS)
    .map((i) => ({
      id: i.id,
      identifier: i.identifier,
      title: i.title,
      description: i.description ?? null,
      url: i.url,
      priority: i.priority,
    }));
}

/**
 * Extracts Notion URLs from Linear issue content (description + comments).
 */
function extractNotionUrls(ticket: Record<string, unknown> | null, comments: Array<Record<string, unknown>>): string[] {
  const notionUrlRegex = /https?:\/\/(?:www\.)?notion\.so\/[^\s)>\]]+/g;
  const urls = new Set<string>();

  if (ticket?.description && typeof ticket.description === "string") {
    const matches = ticket.description.match(notionUrlRegex);
    if (matches) matches.forEach((url) => urls.add(url));
  }

  for (const comment of comments) {
    if (comment.body && typeof comment.body === "string") {
      const matches = comment.body.match(notionUrlRegex);
      if (matches) matches.forEach((url) => urls.add(url));
    }
  }

  return Array.from(urls);
}

export interface LinearFetchResult {
  context: LinearTicketContext;
  missingItems: Array<{ item: string; reason: string }>;
}

/**
 * Fetches all Linear context in parallel using Promise.allSettled.
 * Each fetch has a 30s timeout. Failed fetches are noted but don't block others.
 */
export async function fetchLinearContext(
  accessToken: string,
  issueId: string
): Promise<LinearFetchResult> {
  const client = createLinearClient(accessToken);
  const missingItems: Array<{ item: string; reason: string }> = [];

  const [
    ticketResult,
    projectResult,
    commentsResult,
    parentResult,
    childrenResult,
    siblingsResult,
  ] = await Promise.allSettled([
    fetchWithTimeout(() => fetchTicket(client, issueId), FETCH_TIMEOUT),
    fetchWithTimeout(() => fetchProject(client, issueId), FETCH_TIMEOUT),
    fetchWithTimeout(() => fetchComments(client, issueId), FETCH_TIMEOUT),
    fetchWithTimeout(() => fetchParentIssue(client, issueId), FETCH_TIMEOUT),
    fetchWithTimeout(() => fetchChildIssues(client, issueId), FETCH_TIMEOUT),
    fetchWithTimeout(() => fetchSiblingIssues(client, issueId), FETCH_TIMEOUT),
  ]);

  const ticket =
    ticketResult.status === "fulfilled" ? ticketResult.value : null;
  if (ticketResult.status === "rejected") {
    missingItems.push({ item: "ticket", reason: ticketResult.reason?.message ?? "fetch failed" });
  }

  const project =
    projectResult.status === "fulfilled" ? projectResult.value : null;
  if (projectResult.status === "rejected") {
    missingItems.push({ item: "project", reason: projectResult.reason?.message ?? "fetch failed" });
  }

  const comments =
    commentsResult.status === "fulfilled" ? commentsResult.value : [];
  if (commentsResult.status === "rejected") {
    missingItems.push({ item: "comments", reason: commentsResult.reason?.message ?? "fetch failed" });
  }

  const parentIssue =
    parentResult.status === "fulfilled" ? parentResult.value : null;
  if (parentResult.status === "rejected") {
    missingItems.push({ item: "parentIssue", reason: parentResult.reason?.message ?? "fetch failed" });
  }

  const childIssues =
    childrenResult.status === "fulfilled" ? childrenResult.value : [];
  if (childrenResult.status === "rejected") {
    missingItems.push({ item: "childIssues", reason: childrenResult.reason?.message ?? "fetch failed" });
  }

  const siblingIssues =
    siblingsResult.status === "fulfilled" ? siblingsResult.value : [];
  if (siblingsResult.status === "rejected") {
    missingItems.push({ item: "siblingIssues", reason: siblingsResult.reason?.message ?? "fetch failed" });
  }

  // Extract Notion URLs for cross-referencing
  const linkedNotionUrls = extractNotionUrls(ticket, comments);

  return {
    context: {
      ticket,
      project,
      comments,
      parentIssue,
      childIssues,
      siblingIssues,
      linkedNotionUrls,
    },
    missingItems,
  };
}
