/**
 * Event Deduplication Utility
 *
 * Prevents processing the same event twice. Uses Prisma's upsert on the
 * composite unique constraint (tenantId, source, externalId, type) to
 * atomically check-and-insert.
 *
 * Deduplication window: 5 minutes. If an event with the same key was created
 * within the last 5 minutes, it's considered a duplicate. The duplicate is
 * still stored (upsert updates it) for audit trail purposes.
 *
 * Usage:
 *   const { event, isDuplicate } = await deduplicateEvent({ ... });
 *   if (!isDuplicate) {
 *     await enqueueContextAssembly(event);
 *   }
 */
import { db, Prisma } from "@loomii/db";

/** Events within this window of an existing event are considered duplicates */
const DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

export interface DeduplicateEventInput {
  tenantId: string;
  integrationId: string;
  source: "LINEAR" | "NOTION";
  externalId: string;
  type: string;
  payload: Prisma.InputJsonValue;
}

export interface DeduplicateEventResult {
  /** The event record (created or existing) */
  event: {
    id: string;
    tenantId: string;
    source: string;
    externalId: string;
    type: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  };
  /** True if this event was already processed within the dedup window */
  isDuplicate: boolean;
}

/**
 * Atomically upsert an event and determine if it's a duplicate.
 *
 * - If no event exists with this key: creates a new one (isDuplicate = false)
 * - If an event exists and was created < 5 min ago: it's a duplicate (isDuplicate = true)
 * - If an event exists but was created > 5 min ago: resets it (isDuplicate = false)
 *
 * All events are stored for audit purposes (AC3).
 *
 * @returns The event record and whether it should be skipped
 */
export async function deduplicateEvent(
  input: DeduplicateEventInput
): Promise<DeduplicateEventResult> {
  const { tenantId, integrationId, source, externalId, type, payload } = input;

  const event = await db.event.upsert({
    where: {
      tenantId_source_externalId_type: {
        tenantId,
        source,
        externalId,
        type,
      },
    },
    update: {
      payload,
      updatedAt: new Date(),
    },
    create: {
      tenantId,
      integrationId,
      source,
      externalId,
      type,
      status: "PENDING",
      payload,
    },
  });

  // Determine if this is a duplicate:
  // If createdAt and updatedAt differ by more than 1s, the record already existed.
  // Then check if createdAt is within the dedup window.
  const timeDiff = Math.abs(event.updatedAt.getTime() - event.createdAt.getTime());
  const isExisting = timeDiff > 1000;

  let isDuplicate = false;
  if (isExisting) {
    // Event already existed - check if it was created within the dedup window
    const age = Date.now() - event.createdAt.getTime();
    isDuplicate = age < DEDUP_WINDOW_MS;
  }

  return { event, isDuplicate };
}

/** Exported for testing */
export { DEDUP_WINDOW_MS };
