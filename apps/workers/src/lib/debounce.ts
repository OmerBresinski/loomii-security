/**
 * Debounce Utility for Context Assembly Enqueueing
 *
 * Prevents wasteful processing when an entity is updated many times rapidly.
 * Uses BullMQ's jobId deduplication + delay mechanism:
 *
 * - jobId: `assemble:${tenantId}:${entityId}` ensures same entity → same job
 * - delay: 60 seconds means the job won't start until 60s after the LAST enqueue
 * - BullMQ replaces pending delayed jobs with the same jobId, so only the
 *   final state gets processed (AC4)
 *
 * After the 60s window, a new update creates a new assembly job (AC5).
 *
 * Usage:
 *   await enqueueWithDebounce({
 *     tenantId: "...",
 *     eventId: "...",
 *     sourceType: "linear",
 *     sourceId: "LOO-123",
 *   });
 */
import { contextAssemblyQueue, type ContextAssemblyPayload } from "@loomii/queue";

/** Debounce delay - jobs wait this long before executing */
const DEBOUNCE_DELAY_MS = 60_000; // 60 seconds

export interface DebounceOptions {
  /** Override the debounce delay (for testing) */
  delayMs?: number;
}

/**
 * Enqueue a context-assembly job with debouncing.
 *
 * If the same entity (tenantId + sourceId) already has a pending assembly job,
 * it will be replaced with this newer one. The job won't execute until the
 * debounce window expires (60s after the last enqueue).
 *
 * This ensures:
 * - 5 rapid updates in 30s → only 1 context assembly runs (AC2)
 * - The assembly processes the LATEST state (AC4) since payload is updated
 * - After 60s, new updates create new jobs (AC5)
 *
 * @param payload - The context assembly job payload
 * @param options - Optional configuration overrides
 * @returns The BullMQ job (or null if deduplication prevented creation)
 */
export async function enqueueWithDebounce(
  payload: ContextAssemblyPayload,
  options: DebounceOptions = {}
) {
  const { tenantId, sourceId } = payload;
  const delayMs = options.delayMs ?? DEBOUNCE_DELAY_MS;

  // Deterministic jobId ensures BullMQ deduplicates for the same entity
  const jobId = `assemble:${tenantId}:${sourceId}`;

  // Remove the existing delayed job if present (so we can replace with new payload)
  // BullMQ doesn't natively "update" a delayed job's data, so we remove + re-add
  const existingJob = await contextAssemblyQueue.getJob(jobId);
  if (existingJob) {
    const state = await existingJob.getState();
    // Only remove if it's still waiting (delayed/waiting), not if it's already active
    if (state === "delayed" || state === "waiting") {
      await existingJob.remove();
    }
  }

  // Enqueue with delay - job won't execute until debounce window expires
  const job = await contextAssemblyQueue.add("assemble", payload, {
    jobId,
    delay: delayMs,
    // If the job already exists and is active/completed, don't fail
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
  });

  return job;
}

/**
 * Generate the deterministic job ID for a given entity.
 * Useful for checking if a debounced job exists.
 */
export function getDebounceJobId(tenantId: string, sourceId: string): string {
  return `assemble:${tenantId}:${sourceId}`;
}

/** Exported for testing */
export { DEBOUNCE_DELAY_MS };
