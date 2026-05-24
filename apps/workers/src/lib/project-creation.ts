/**
 * Project creation service for the initial backfill pipeline.
 *
 * Handles two project creation strategies:
 * 1. Mirror: Creates Loomii Projects that mirror existing Linear projects
 * 2. Cluster: Creates new projects from embedding-based orphan clusters with LLM-generated names
 *
 * Dependencies: Prisma (DB), Bedrock (LLM naming), Embeddings (summaryEmbedding)
 */
import { generateText } from "ai";
import type { PrismaClient } from "@loomii/db";
import { bedrock, MODELS } from "./bedrock";
import { generateQueryEmbedding } from "./embeddings";
import { logger } from "./logger";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LinearProjectMapping {
  linearProjectId: string;
  linearProjectName: string;
  itemIds: string[]; // Event IDs that belong to this project
}

export interface ClusterItemRef {
  id: string;
  sourceType: "LINEAR_ISSUE" | "NOTION_PAGE";
}

export interface OrphanCluster {
  items: ClusterItemRef[];
  centroid: number[];
  titles: string[]; // for LLM naming context
  contentSnippets: string[]; // first 200 chars of each item
}

export interface ProjectCreationOptions {
  /** Similarity threshold used to form clusters (stored in linkReason) */
  similarityThreshold?: number;
}

export interface ProjectCreationResult {
  created: Array<{
    projectId: string;
    name: string;
    itemIds: string[];
    source: "linear_mirror" | "embedding_cluster";
  }>;
  skipped: string[]; // linearProjectIds that already existed
}

// ─── LLM Naming ──────────────────────────────────────────────────────────────

const NAMING_PROMPT = `You are naming a software project based on its constituent documents.
Given these document titles and snippets, generate a concise 2-4 word project name.
Respond with ONLY the project name, no explanation.`;

const LLM_TIMEOUT_MS = 10_000;

/**
 * Generate a project name from cluster content using Claude Haiku.
 * Falls back to "Project [N]" if LLM call fails.
 */
async function generateProjectName(
  titles: string[],
  snippets: string[],
  fallbackIndex: number
): Promise<string> {
  try {
    const titlesSection = titles.slice(0, 10).map((t) => `- ${t}`).join("\n");
    const snippetsSection = snippets.slice(0, 5).map((s) => `- ${s}`).join("\n");

    const { text } = await generateText({
      model: bedrock(MODELS.CLAUDE_HAIKU),
      prompt: `${NAMING_PROMPT}\n\nTitles:\n${titlesSection}\n\nSnippets:\n${snippetsSection}`,
      maxOutputTokens: 20,
      abortSignal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    });

    const name = text.trim();
    if (name && name.length > 0 && name.length <= 100) {
      return name;
    }
    return `Project ${fallbackIndex}`;
  } catch {
    return `Project ${fallbackIndex}`;
  }
}

// ─── Summary Embedding ───────────────────────────────────────────────────────

/**
 * Generate and store a summaryEmbedding for a project from its item titles.
 * Uses raw SQL because Prisma doesn't natively support pgvector.
 */
async function storeSummaryEmbedding(
  projectId: string,
  titles: string[],
  database: PrismaClient
): Promise<void> {
  try {
    const concatenatedTitles = titles.join(" | ");
    const embedding = await generateQueryEmbedding(concatenatedTitles);
    const vectorStr = `[${embedding.join(",")}]`;

    await database.$executeRaw`
      UPDATE projects
      SET summary_embedding = ${vectorStr}::vector,
          summary_updated_at = NOW(),
          updated_at = NOW()
      WHERE id = ${projectId}
    `;
  } catch (err) {
    // Non-fatal: project is still usable without embedding
    logger.warn({ projectId, err }, "Failed to generate/store summaryEmbedding");
  }
}

// ─── Main Function ───────────────────────────────────────────────────────────

/**
 * Create Loomii Projects from backfill results.
 *
 * Handles:
 * 1. Mirroring Linear projects 1:1 (idempotent - skips existing)
 * 2. Creating projects from embedding clusters with LLM-generated names
 *
 * Creates ProjectSource records linking items to their project.
 * Generates summaryEmbedding for each new project.
 */
export async function createProjectsFromBackfill(
  tenantId: string,
  linearProjects: LinearProjectMapping[],
  orphanClusters: OrphanCluster[],
  database: PrismaClient,
  options?: ProjectCreationOptions
): Promise<ProjectCreationResult> {
  const similarityThreshold = options?.similarityThreshold ?? 0.78;

  const result: ProjectCreationResult = {
    created: [],
    skipped: [],
  };

  // ─── Phase 1: Mirror Linear projects ─────────────────────────────────────

  for (const mapping of linearProjects) {
    // Check if a project with this linearProjectId already exists
    const existing = await database.projectSource.findFirst({
      where: {
        project: { tenantId },
        sourceType: "LINEAR_ISSUE",
        linkReason: {
          path: ["linearProjectId"],
          equals: mapping.linearProjectId,
        },
      },
      select: { projectId: true },
    });

    if (existing) {
      result.skipped.push(mapping.linearProjectId);
      continue;
    }

    // Create project + sources in a transaction
    const project = await database.$transaction(async (tx) => {
      const newProject = await tx.project.create({
        data: {
          tenantId,
          name: mapping.linearProjectName,
        },
      });

      // Create ProjectSource records for each item
      for (const itemId of mapping.itemIds) {
        try {
          await tx.projectSource.create({
            data: {
              projectId: newProject.id,
              sourceType: "LINEAR_ISSUE",
              sourceId: itemId,
              linkedBy: "AUTO",
              linkReason: {
                method: "linear_project_mirror",
                linearProjectId: mapping.linearProjectId,
              },
            },
          });
        } catch (err: any) {
          // Unique constraint violation - already linked, skip
          if (err?.code === "P2002") continue;
          throw err;
        }
      }

      return newProject;
    });

    // Generate summaryEmbedding (non-blocking for transaction)
    await storeSummaryEmbedding(project.id, [mapping.linearProjectName], database);

    result.created.push({
      projectId: project.id,
      name: project.name,
      itemIds: mapping.itemIds,
      source: "linear_mirror",
    });
  }

  // ─── Phase 2: Create projects from orphan clusters ───────────────────────

  // Parallelize LLM naming calls (then write to DB sequentially)
  const clusterNames = await Promise.all(
    orphanClusters.map((cluster, idx) =>
      generateProjectName(cluster.titles, cluster.contentSnippets, idx + 1)
    )
  );

  for (let i = 0; i < orphanClusters.length; i++) {
    const cluster = orphanClusters[i];
    const name = clusterNames[i];

    // Create project + sources in a transaction
    const project = await database.$transaction(async (tx) => {
      const newProject = await tx.project.create({
        data: {
          tenantId,
          name,
        },
      });

      // Create ProjectSource records for each item (with correct sourceType per item)
      for (const item of cluster.items) {
        try {
          await tx.projectSource.create({
            data: {
              projectId: newProject.id,
              sourceType: item.sourceType,
              sourceId: item.id,
              linkedBy: "AUTO",
              linkReason: {
                method: "embedding_cluster",
                similarityThreshold,
              },
            },
          });
        } catch (err: any) {
          if (err?.code === "P2002") continue;
          throw err;
        }
      }

      return newProject;
    });

    // Generate summaryEmbedding from cluster titles
    await storeSummaryEmbedding(project.id, cluster.titles, database);

    result.created.push({
      projectId: project.id,
      name: project.name,
      itemIds: cluster.items.map((item) => item.id),
      source: "embedding_cluster",
    });
  }

  return result;
}
