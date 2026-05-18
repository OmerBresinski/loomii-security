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
import { reviewQueue, eventsQueue, type RiskClassificationPayload } from "@loomii/queue";
import { createBedrockAgent } from "../lib/bedrock";
import {
  riskClassificationSchema,
  buildClassificationMessages,
  RISK_CLASSIFIER_INSTRUCTIONS,
  type RiskClassification,
} from "../lib/classification-prompt";
import { logger } from "../lib/logger";

const LLM_TIMEOUT_MS = 15_000; // 15s for LLM call

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
    return;
  }

  if (!bundle.content) {
    childLogger.error("Context bundle has no content, skipping classification");
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

  // 4. Publish events based on risk level
  await publishRiskEvents(tenantId, contextId, classification, childLogger);

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
 * Publishes events based on classification result.
 * - CRITICAL -> review-generation queue + critical-alert event
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
        data: { contextId, reasoning: classification.reasoning },
        timestamp: new Date().toISOString(),
      })
    );
    childLogger.info("Enqueued review-generation + critical-alert");
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
