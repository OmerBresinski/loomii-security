/**
 * Linear Webhook Endpoint.
 *
 * POST /webhooks/linear
 *
 * Receives webhook events from Linear, verifies signatures,
 * stores events, checks for duplicates, and enqueues context assembly.
 *
 * This route is PUBLIC (no auth middleware) since it's called by Linear.
 * Security is enforced via HMAC-SHA256 signature verification.
 *
 * Must respond within 500ms (Linear will timeout and retry otherwise).
 * All actual processing happens asynchronously in workers.
 *
 * Relevant event types:
 * - Issue: create, update
 * - Comment: create
 * - Project: update
 */
import { Hono } from "hono";
import { db } from "@loomii/db";
import { contextAssemblyQueue } from "@loomii/queue";
import {
  verifyWebhookSignature,
  findLinearIntegrationByOrgId,
} from "../../lib/webhook-verify";

/** Event types we care about for security review context */
const RELEVANT_EVENTS = new Set([
  "Issue.create",
  "Issue.update",
  "Comment.create",
  "Project.update",
]);

/** Map Linear event types to our internal event type names */
function mapEventType(type: string, action: string): string {
  switch (`${type}.${action}`) {
    case "Issue.create":
      return "issue.created";
    case "Issue.update":
      return "issue.updated";
    case "Comment.create":
      return "comment.created";
    case "Project.update":
      return "project.updated";
    default:
      return `${type.toLowerCase()}.${action}`;
  }
}

export const linearWebhookRoute = new Hono();

/**
 * POST /webhooks/linear
 *
 * Linear sends:
 * - Header: `linear-signature` (HMAC-SHA256 hex)
 * - Body: JSON with { action, type, data, organizationId, ... }
 *
 * Flow:
 * 1. Read raw body (for signature verification)
 * 2. Extract signature from header
 * 3. Parse payload to get organizationId
 * 4. Look up integration by orgId to get webhook secret
 * 5. Verify signature (reject with 400 if invalid)
 * 6. Check if event type is relevant (ignore irrelevant with 200)
 * 7. Upsert event (deduplicate)
 * 8. If new: enqueue context-assembly job
 * 9. Respond 200 { ok: true }
 */
linearWebhookRoute.post("/", async (c) => {
  // 1. Read raw body BEFORE parsing (signature is computed on raw bytes)
  const rawBody = await c.req.text();

  // 2. Get signature from header
  const signature = c.req.header("linear-signature") ?? "";

  // 3. Parse the payload
  let payload: {
    action: string;
    type: string;
    data: Record<string, unknown>;
    organizationId?: string;
    createdAt?: string;
  };

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const { action, type, data, organizationId } = payload;

  // 4. Look up integration by organizationId
  if (!organizationId) {
    return c.json({ error: "Missing organizationId" }, 400);
  }

  const integration = await findLinearIntegrationByOrgId(organizationId);

  if (!integration) {
    // No matching integration found - could be a stale webhook
    return c.json({ error: "Integration not found" }, 404);
  }

  // 5. Verify signature
  const isValid = verifyWebhookSignature(
    rawBody,
    signature,
    integration.webhookSecret
  );

  if (!isValid) {
    return c.json({ error: "Invalid signature" }, 400);
  }

  // 6. Check if event type is relevant
  const eventKey = `${type}.${action}`;
  if (!RELEVANT_EVENTS.has(eventKey)) {
    // Acknowledge but don't process irrelevant events
    return c.json({ ok: true }, 200);
  }

  // 7. Extract external ID from data
  const externalId = (data?.id as string) ?? "";
  if (!externalId) {
    return c.json({ ok: true }, 200);
  }

  const { tenantId, integrationId } = integration;
  const internalEventType = mapEventType(type, action);

  // 8. Upsert event (deduplicate by tenantId + source + externalId + type)
  const event = await db.event.upsert({
    where: {
      tenantId_source_externalId_type: {
        tenantId,
        source: "LINEAR",
        externalId,
        type: internalEventType,
      },
    },
    update: {
      payload: data as any,
      status: "PENDING",
      updatedAt: new Date(),
    },
    create: {
      tenantId,
      integrationId,
      source: "LINEAR",
      externalId,
      type: internalEventType,
      status: "PENDING",
      payload: data as any,
    },
  });

  // 9. Determine if this is a new event or a duplicate
  const isDuplicate =
    Math.abs(event.createdAt.getTime() - event.updatedAt.getTime()) > 1000;

  // 10. If new event, enqueue context assembly (with debounce via jobId)
  if (!isDuplicate) {
    await contextAssemblyQueue.add(
      "assemble",
      {
        eventId: event.id,
        tenantId,
        sourceType: "linear",
        sourceId: externalId,
      },
      {
        jobId: `assemble:${tenantId}:${externalId}`,
        delay: 60_000, // 60s debounce - wait for rapid consecutive updates
      }
    );
  }

  return c.json({ ok: true }, 200);
});
