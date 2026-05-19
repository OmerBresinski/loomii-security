/**
 * Threat Model Generation Processor
 *
 * BullMQ worker for the "threat-model-update" queue. Performs two-pass
 * generation using the Threat Model Mastra Agent:
 *
 * Pass 1: Structure identification (components, flows, boundaries, entry points, assets)
 * Pass 2: STRIDE threat generation for each identified entity
 *
 * After atomic save:
 * - Embed all threats in pgvector for future semantic search
 * - (Future: run gap analysis)
 *
 * Trigger:
 * - On 3rd context bundle: immediate job
 * - On onboarding: job with 10min delay (removed if 3rd bundle fires first)
 *
 * SLA: Initial generation completes within 5 minutes.
 */
import type { Job } from "bullmq";
import { db } from "@loomii/db";
import { embeddingQueue, type ThreatModelUpdatePayload } from "@loomii/queue";
import {
  StructureOutputSchema,
  ThreatsOutputSchema,
  type StructureOutput,
  type ThreatsOutput,
} from "@loomii/shared/schemas";
import {
  threatModelAgent,
  threatModelTools,
  buildStructurePrompt,
  buildThreatsPrompt,
} from "../agents/threat-model";
import {
  saveThreatModelAtomically,
  markThreatModelError,
} from "../lib/threat-model-saver";
import { logger } from "../lib/logger";

/** 5 minute overall timeout for initial generation */
const GENERATION_TIMEOUT_MS = 5 * 60 * 1000;

/** Maximum context token estimate before truncation (rough: 4 chars ≈ 1 token) */
const MAX_CONTEXT_CHARS = 200_000 * 4; // ~200K tokens

export async function processThreatModelGeneration(
  job: Job<ThreatModelUpdatePayload>
): Promise<void> {
  const { tenantId } = job.data;

  const childLogger = logger.child({
    queue: "threat-model-update",
    jobId: job.id,
    jobName: job.name,
    tenantId,
  });

  childLogger.info("Starting threat model generation");
  const startTime = Date.now();

  // AbortController to cancel LLM calls on timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);

  try {
    const result = await runTwoPassGeneration(tenantId, childLogger, controller.signal);

    const durationMs = Date.now() - startTime;
    childLogger.info(
      { durationMs, ...result },
      "Threat model generation completed successfully"
    );
  } catch (error: any) {
    if (controller.signal.aborted) {
      childLogger.error("Threat model generation timed out (5 min)");
      const model = await db.threatModel.findUnique({ where: { tenantId } });
      if (model && model.status === "GENERATING") {
        await markThreatModelError(
          model.id,
          "Generation timed out after 5 minutes"
        );
      }
      return;
    }
    throw error; // Re-throw non-timeout errors so BullMQ retries
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Two-Pass Generation ──────────────────────────────────────────────────────

interface GenerationResult {
  componentCount: number;
  dataFlowCount: number;
  trustBoundaryCount: number;
  entryPointCount: number;
  assetCount: number;
  threatCount: number;
  skippedReferences: number;
}

async function runTwoPassGeneration(
  tenantId: string,
  childLogger: typeof logger,
  signal: AbortSignal
): Promise<GenerationResult> {
  // 1. Ensure ThreatModel record exists and is in PENDING/ERROR state
  let threatModel = await db.threatModel.findUnique({
    where: { tenantId },
  });

  if (!threatModel) {
    // Create the ThreatModel record in GENERATING state
    threatModel = await db.threatModel.create({
      data: {
        tenantId,
        status: "GENERATING",
      },
    });
    childLogger.info({ threatModelId: threatModel.id }, "Created ThreatModel record");
  } else if (threatModel.status === "ACTIVE") {
    childLogger.info("Threat model already ACTIVE, skipping initial generation");
    return {
      componentCount: 0,
      dataFlowCount: 0,
      trustBoundaryCount: 0,
      entryPointCount: 0,
      assetCount: 0,
      threatCount: 0,
      skippedReferences: 0,
    };
  } else {
    // Update status to GENERATING
    await db.threatModel.update({
      where: { id: threatModel.id },
      data: { status: "GENERATING", errorMessage: null },
    });
  }

  const threatModelId = threatModel.id;

  try {
    // 2. Fetch context bundles for this tenant
    const contextBundles = await db.contextBundle.findMany({
      where: {
        tenantId,
        status: "COMPLETED",
      },
      orderBy: { createdAt: "desc" },
      take: 20, // Limit to most recent 20 bundles
      select: {
        id: true,
        title: true,
        content: true,
      },
    });

    if (contextBundles.length === 0) {
      throw new Error("No completed context bundles found for tenant");
    }

    childLogger.info(
      { bundleCount: contextBundles.length },
      "Fetched context bundles"
    );

    // 3. Prepare context summaries (truncate if needed)
    const contextSummaries = prepareContextSummaries(contextBundles);

    // 4. Pass 1: Structure identification
    childLogger.info("Starting Pass 1: Structure identification");
    const structureResult = await runPass1(tenantId, contextSummaries, childLogger, signal);
    childLogger.info(
      {
        components: structureResult.components.length,
        dataFlows: structureResult.dataFlows.length,
        trustBoundaries: structureResult.trustBoundaries.length,
        entryPoints: structureResult.entryPoints.length,
        assets: structureResult.assets.length,
      },
      "Pass 1 complete"
    );

    // 5. Pass 2: Threat generation
    childLogger.info("Starting Pass 2: STRIDE threat generation");
    const threatsResult = await runPass2(
      tenantId,
      contextSummaries,
      structureResult,
      childLogger,
      signal
    );
    childLogger.info(
      { threats: threatsResult.threats.length },
      "Pass 2 complete"
    );

    // 6. Atomic save
    childLogger.info("Saving threat model atomically");
    const saveResult = await saveThreatModelAtomically(
      tenantId,
      threatModelId,
      structureResult,
      threatsResult
    );

    // 7. Enqueue embedding jobs for all threats
    await enqueueThreatEmbeddings(tenantId, threatModelId, childLogger);

    return saveResult;
  } catch (error: any) {
    childLogger.error(
      { error: error.message, stack: error.stack },
      "Threat model generation failed"
    );
    await markThreatModelError(threatModelId, error.message ?? "Unknown error");
    throw error; // Re-throw so BullMQ marks the job as failed
  }
}

// ─── Pass 1: Structure ────────────────────────────────────────────────────────

async function runPass1(
  tenantId: string,
  contextSummaries: Array<{ title: string | null; content: string }>,
  childLogger: typeof logger,
  signal: AbortSignal
): Promise<StructureOutput> {
  const prompt = buildStructurePrompt(contextSummaries);

  // Note: Type assertion to avoid TS2589 "excessively deep" error from Mastra's
  // deeply-nested generics when combined with Zod schema inference.
  const result = await (threatModelAgent.generate(prompt, {
    tools: threatModelTools,
    structuredOutput: {
      schema: StructureOutputSchema,
    },
    maxSteps: 5,
    requestContext: new Map([["tenantId", tenantId]]),
    modelSettings: {
      temperature: 0.1,
      maxOutputTokens: 8000,
      maxRetries: 2,
    },
    abortSignal: signal,
  } as any) as Promise<{ object: StructureOutput; text: string }>);

  if (!result.object) {
    throw new Error("Pass 1 returned no structured output");
  }

  // Validate minimums
  const structure = result.object;
  if (structure.components.length < 3) {
    childLogger.warn(
      { count: structure.components.length },
      "Pass 1 returned fewer than 3 components"
    );
  }

  return structure;
}

// ─── Pass 2: Threats ──────────────────────────────────────────────────────────

async function runPass2(
  tenantId: string,
  contextSummaries: Array<{ title: string | null; content: string }>,
  structure: StructureOutput,
  childLogger: typeof logger,
  signal: AbortSignal
): Promise<ThreatsOutput> {
  const prompt = buildThreatsPrompt(contextSummaries, structure);

  // Note: Type assertion to avoid TS2589 "excessively deep" error from Mastra's
  // deeply-nested generics when combined with Zod schema inference.
  const result = await (threatModelAgent.generate(prompt, {
    tools: threatModelTools,
    structuredOutput: {
      schema: ThreatsOutputSchema,
    },
    maxSteps: 5,
    requestContext: new Map([["tenantId", tenantId]]),
    modelSettings: {
      temperature: 0.2, // Slightly higher for threat creativity
      maxOutputTokens: 16000,
      maxRetries: 2,
    },
    abortSignal: signal,
  } as any) as Promise<{ object: ThreatsOutput; text: string }>);

  if (!result.object) {
    throw new Error("Pass 2 returned no structured output");
  }

  const threats = result.object;
  if (threats.threats.length < 3) {
    childLogger.warn(
      { count: threats.threats.length },
      "Pass 2 returned fewer than 3 threats"
    );
  }

  return threats;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Prepare context summaries for the agent, truncating if total exceeds limit.
 * Prioritizes more recent bundles.
 */
function prepareContextSummaries(
  bundles: Array<{ id: string; title: string | null; content: any }>
): Array<{ title: string | null; content: string }> {
  let totalChars = 0;
  const summaries: Array<{ title: string | null; content: string }> = [];

  for (const bundle of bundles) {
    const content =
      typeof bundle.content === "string"
        ? bundle.content
        : JSON.stringify(bundle.content, null, 2);

    if (totalChars + content.length > MAX_CONTEXT_CHARS) {
      // Truncate this bundle to fit
      const remaining = MAX_CONTEXT_CHARS - totalChars;
      if (remaining > 500) {
        summaries.push({
          title: bundle.title,
          content: content.slice(0, remaining) + "\n... [truncated]",
        });
      }
      break;
    }

    summaries.push({ title: bundle.title, content });
    totalChars += content.length;
  }

  return summaries;
}

/**
 * Enqueue embedding jobs for all threats in the model.
 * Each threat gets its own embedding for semantic search.
 */
async function enqueueThreatEmbeddings(
  tenantId: string,
  threatModelId: string,
  childLogger: typeof logger
): Promise<void> {
  const threats = await db.tmThreat.findMany({
    where: { threatModelId, isDeprecated: false },
    select: { id: true, title: true, description: true, strideCategory: true },
  });

  if (threats.length === 0) return;

  const jobs = threats.map((threat) => ({
    name: "threat-embedding",
    data: {
      tenantId,
      documentId: `threat_${threat.id}`,
      content: `[${threat.strideCategory}] ${threat.title}: ${threat.description ?? ""}`,
      metadata: {
        sourceType: "threat",
        threatId: threat.id,
        threatModelId,
        strideCategory: threat.strideCategory,
      },
    },
  }));

  await embeddingQueue.addBulk(jobs);

  childLogger.info(
    { count: threats.length },
    "Enqueued threat embedding jobs"
  );
}
