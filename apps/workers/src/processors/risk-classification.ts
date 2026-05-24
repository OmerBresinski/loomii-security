/**
 * Risk Classification Processor
 *
 * Uses a Mastra agent (Claude Haiku via Bedrock) with structured output
 * to classify context bundles into security risk levels.
 *
 * Architecture:
 * - The agent has `instructions` (system prompt) with classification criteria
 * - User messages contain the context bundle to classify
 * - Structured output (Zod schema) enforces the response shape
 * - `modelSettings.maxRetries: 2` handles transient failures natively
 * - 15s timeout on the LLM call (leaves 5s for DB + event publishing)
 *
 * On failure: defaults to HIGH (err on side of caution).
 * SLA: Classification completes within 20 seconds.
 */
import type { Job } from "bullmq";
import { db, type RiskLevel } from "@loomii/db";
import {
  reviewQueue,
  eventsQueue,
  contextAssemblyQueue,
  createRedisConnection,
  type RiskClassificationPayload,
} from "@loomii/queue";
import type { Redis } from "ioredis";
import { createBedrockAgent } from "../lib/bedrock";
import {
  riskClassificationSchema,
  buildClassificationMessages,
  RISK_CLASSIFIER_INSTRUCTIONS,
  type RiskClassification,
} from "../lib/classification-prompt";
import { logger } from "../lib/logger";

const LLM_TIMEOUT_MS = 15_000; // 15s for LLM call
const BACKFILL_KEY_PREFIX = "backfill:status:";
const MEDIUM_PLUS_LEVELS: Set<string> = new Set(["CRITICAL", "HIGH", "MEDIUM"]);

// ─── Redis Singleton ─────────────────────────────────────────────────────────

let _redis: Redis | null = null;

function getRedis(): Redis {
  if (!_redis) {
    _redis = createRedisConnection();
  }
  return _redis;
}

/**
 * The risk classifier Mastra agent.
 *
 * - `instructions` = system prompt (role: 'system') with classification criteria and rules
 * - Model = Claude Haiku (fast, cheap, good at structured classification)
 * - Structured output validated by Zod schema
 *
 * The system prompt establishes the agent's identity and classification logic.
 * User messages (the context bundle) are passed separately via generate().
 */
export let riskClassifierAgent = createBedrockAgent({
  id: "risk-classifier",
  name: "Security Risk Classifier",
  instructions: { role: "system", content: RISK_CLASSIFIER_INSTRUCTIONS },
  model: "CLAUDE_HAIKU",
});

/** @internal - Only for testing. Replaces the agent with a mock. */
export function __setAgent(agent: any) {
  riskClassifierAgent = agent;
}

export async function processRiskClassification(
  job: Job<RiskClassificationPayload>
): Promise<void> {
  const { tenantId, contextId } = job.data;
  const isBackfill = job.data.isBackfill === true;

  const childLogger = logger.child({
    queue: "risk-classification",
    jobId: job.id,
    jobName: job.name,
    tenantId,
    contextId,
  });

  childLogger.info("Starting risk classification");
  const startTime = Date.now();

  // 1. Fetch the context bundle
  const bundle = await db.contextBundle.findUnique({
    where: { id: contextId },
  });

  if (!bundle) {
    childLogger.error("Context bundle not found, skipping classification");
    if (isBackfill) await incrementBackfillClassified(tenantId, "LOW", childLogger);
    return;
  }

  if (!bundle.content) {
    childLogger.error("Context bundle has no content, skipping classification");
    if (isBackfill) await incrementBackfillClassified(tenantId, "LOW", childLogger);
    return;
  }

  // 2. Classify using Mastra agent with structured output
  let classification: RiskClassification;

  try {
    classification = await classifyWithAgent(bundle, childLogger);
  } catch (err: any) {
    childLogger.error(
      { error: err.message, stack: err.stack },
      "Risk classification failed - defaulting to HIGH"
    );

    classification = {
      level: "HIGH",
      reasoning: "Classification failed - defaulting to HIGH. Error: " + (err.message ?? "unknown"),
    };
  }

  // 3. Update ContextBundle with classification result
  await db.contextBundle.update({
    where: { id: contextId },
    data: {
      riskLevel: classification.level as RiskLevel,
      status: "COMPLETED",
      summary: classification.reasoning,
      updatedAt: new Date(),
    },
  });

  // 4. Backfill-specific: track progress in Redis + route downstream
  if (isBackfill) {
    await handleBackfillProgress(tenantId, contextId, classification, job.data, childLogger);
  } else {
    // 5. Normal pipeline: publish events based on risk level
    await publishRiskEvents(tenantId, contextId, classification, childLogger);
  }

  const durationMs = Date.now() - startTime;
  childLogger.info(
    { riskLevel: classification.level, durationMs },
    "Risk classification completed"
  );
}

/**
 * Calls the Mastra agent with structured output for classification.
 *
 * The agent receives:
 * - System prompt (instructions) = classification criteria & rules
 * - User messages = the context bundle to classify
 * - Structured output schema = enforced JSON shape
 * - Model settings = temperature 0 (deterministic), maxRetries 2, token limits
 */
async function classifyWithAgent(
  bundle: { title: string | null; content: any },
  childLogger: typeof logger
): Promise<RiskClassification> {
  const messages = buildClassificationMessages({
    title: bundle.title,
    content: bundle.content as Record<string, unknown>,
  });

  // Race the agent call against a timeout
  // Note: Type assertion avoids TS2589 "excessively deep" error from Mastra's
  // deeply-nested generics when combined with Zod schema inference.
  const generatePromise = riskClassifierAgent.generate(messages, {
    structuredOutput: {
      schema: riskClassificationSchema,
    },
    modelSettings: {
      temperature: 0,
      maxOutputTokens: 1000,
      maxRetries: 2,
    },
  } as any) as Promise<{ object: RiskClassification; text: string }>;

  const result = await Promise.race([
    generatePromise,
    createTimeout(LLM_TIMEOUT_MS),
  ]);

  if (result === "TIMEOUT") {
    throw new Error(`LLM call timed out after ${LLM_TIMEOUT_MS}ms`);
  }

  const classification = result.object;

  if (!classification || !classification.level || !classification.reasoning) {
    throw new Error("Invalid structured output: missing level or reasoning");
  }

  childLogger.info(
    { level: classification.level },
    "Classification successful"
  );

  return classification;
}

function createTimeout(ms: number): Promise<"TIMEOUT"> {
  return new Promise((resolve) => setTimeout(() => resolve("TIMEOUT"), ms));
}

/**
 * Lua script for atomic backfill progress tracking.
 * Increments classified (and highRisk if applicable), then checks completion.
 * Returns [classified, total, highRisk, isComplete (0|1)]
 */
const BACKFILL_PROGRESS_SCRIPT = `
  local classified = redis.call('HINCRBY', KEYS[1], 'classified', 1)
  local incrHighRisk = tonumber(ARGV[1])
  if incrHighRisk == 1 then
    redis.call('HINCRBY', KEYS[1], 'highRisk', 1)
  end
  local total = tonumber(redis.call('HGET', KEYS[1], 'total') or '0')
  local highRisk = tonumber(redis.call('HGET', KEYS[1], 'highRisk') or '0')
  if classified >= total and total > 0 then
    redis.call('HSET', KEYS[1], 'status', 'triage_complete', 'message', 'Scan complete! ' .. highRisk .. ' items flagged for review.')
    return {classified, total, highRisk, 1}
  end
  return {classified, total, highRisk, 0}
`;

/**
 * Increment backfill classified counter only (for early returns where
 * classification is skipped but we still need to track progress).
 */
async function incrementBackfillClassified(
  tenantId: string,
  level: string,
  childLogger: typeof logger
): Promise<void> {
  const redis = getRedis();
  const redisKey = `${BACKFILL_KEY_PREFIX}${tenantId}`;
  const isMediumPlus = MEDIUM_PLUS_LEVELS.has(level) ? 1 : 0;

  await redis.eval(BACKFILL_PROGRESS_SCRIPT, 1, redisKey, String(isMediumPlus));
  childLogger.info("Backfill progress incremented (skipped item)");
}

/**
 * Handles backfill-specific logic after classification:
 * 1. Atomically increments classified counter (and highRisk if MEDIUM+) + checks completion
 * 2. Routes MEDIUM+ to context-assembly, LOW/INFO stops here
 */
async function handleBackfillProgress(
  tenantId: string,
  contextId: string,
  classification: RiskClassification,
  jobData: RiskClassificationPayload,
  childLogger: typeof logger
): Promise<void> {
  const redis = getRedis();
  const redisKey = `${BACKFILL_KEY_PREFIX}${tenantId}`;
  const isMediumPlus = MEDIUM_PLUS_LEVELS.has(classification.level);

  // Atomic: increment + check completion via Lua
  const result = await redis.eval(
    BACKFILL_PROGRESS_SCRIPT,
    1,
    redisKey,
    isMediumPlus ? "1" : "0"
  ) as [number, number, number, number];

  const [classifiedCount, totalCount, highRiskCount, isComplete] = result;

  if (isComplete) {
    childLogger.info(
      { classified: classifiedCount, total: totalCount, highRisk: highRiskCount },
      "Backfill triage complete"
    );
  }

  // Route downstream based on risk level
  if (isMediumPlus) {
    // MEDIUM+ → enqueue to context-assembly for full review pipeline
    const sourceType = jobData.sourceType ?? "linear";
    await contextAssemblyQueue.add(
      "assemble",
      {
        eventId: contextId,
        tenantId,
        sourceType,
        sourceId: jobData.designDocId,
      },
      { jobId: `assemble-${tenantId}-${jobData.designDocId}` }
    );
    childLogger.info(
      { level: classification.level, sourceType },
      "Backfill MEDIUM+ item enqueued to context-assembly"
    );
  } else {
    // LOW/INFO → already marked COMPLETED above, no further downstream processing
    childLogger.info("Backfill LOW item - no further processing");
  }
}

/**
 * Publishes events based on classification result.
 * - CRITICAL -> review-generation queue + critical-alert event (with project data)
 * - HIGH/MEDIUM -> review-generation queue
 * - LOW -> dashboard event only (no review triggered)
 */
async function publishRiskEvents(
  tenantId: string,
  contextId: string,
  classification: RiskClassification,
  childLogger: typeof logger
): Promise<void> {
  const eventPromises: Promise<unknown>[] = [];

  if (classification.level === "CRITICAL") {
    // Resolve project context for notification enrichment
    const bundle = await db.contextBundle.findUnique({
      where: { id: contextId },
      select: { projectId: true, project: { select: { name: true } } },
    });
    const projectId = bundle?.projectId ?? null;
    const projectName = bundle?.project?.name ?? null;

    // Trigger review + critical alert
    eventPromises.push(
      reviewQueue.add("review", {
        tenantId,
        contextId,
        reviewType: "design-review",
      }),
      eventsQueue.add("critical-alert", {
        tenantId,
        eventType: "risk.critical",
        data: {
          contextBundleId: contextId,
          reasoning: classification.reasoning,
          severity: classification.level,
          reviewId: null, // Review hasn't been created yet at classification time
          projectId,
          projectName,
        },
        timestamp: new Date().toISOString(),
      })
    );
    childLogger.info({ projectId }, "Enqueued review-generation + critical-alert");
  } else if (
    classification.level === "HIGH" ||
    classification.level === "MEDIUM"
  ) {
    // Trigger review
    eventPromises.push(
      reviewQueue.add("review", {
        tenantId,
        contextId,
        reviewType: "design-review",
      })
    );
    childLogger.info({ level: classification.level }, "Enqueued review-generation");
  } else {
    // LOW - dashboard event only
    eventPromises.push(
      eventsQueue.add("classified-low", {
        tenantId,
        eventType: "risk.low",
        data: { contextId, reasoning: classification.reasoning },
        timestamp: new Date().toISOString(),
      })
    );
    childLogger.info("Published low-risk event (dashboard only)");
  }

  await Promise.allSettled(eventPromises);
}
