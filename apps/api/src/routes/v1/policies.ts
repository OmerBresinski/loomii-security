/**
 * Policy Management Routes
 *
 * CRUD endpoints for managing security policies (both built-in and custom).
 * Custom policies are tenant-scoped and go through the embedding pipeline
 * for semantic retrieval by the Design Review Agent.
 *
 * Routes:
 * - POST   /api/v1/policies      - Upload custom policy
 * - GET    /api/v1/policies      - List all policies (built-in + custom)
 * - PATCH  /api/v1/policies/:id  - Update policy content or toggle enabled
 * - DELETE /api/v1/policies/:id  - Delete custom policy (built-in returns 403)
 *
 * RBAC: ADMIN + SECURITY_LEAD only.
 * Embedding: On create/update, content is chunked and embedded asynchronously.
 */
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../lib/types";
import { db } from "@loomii/db";
import { embeddingQueue } from "@loomii/queue";
import { requireRole } from "../../middleware/rbac";

export const policyRoutes = new Hono<AppEnv>();

// Apply RBAC to all policy routes
policyRoutes.use("/*", requireRole("ADMIN", "SECURITY_LEAD"));

// ─── Schemas ──────────────────────────────────────────────────────────────────

const CreatePolicySchema = z.object({
  name: z.string().min(1).max(200),
  content: z.string().min(10).max(51200), // Max 50KB
  keywords: z.array(z.string()).default([]),
  framework: z.string().default("CUSTOM"),
});

const UpdatePolicySchema = z.object({
  content: z.string().min(10).max(51200).optional(),
  isEnabled: z.boolean().optional(),
  keywords: z.array(z.string()).optional(),
  name: z.string().min(1).max(200).optional(),
});

// ─── POST /api/v1/policies ────────────────────────────────────────────────────

policyRoutes.post("/", async (c) => {
  const tenantId = c.get("tenantId");
  const requestId = c.get("requestId");

  // Parse and validate body
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      { error: { code: "INVALID_BODY", message: "Invalid JSON body", requestId } },
      400
    );
  }

  const parsed = CreatePolicySchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
          requestId,
        },
      },
      400
    );
  }

  const { name, content, keywords, framework } = parsed.data;

  // Check for duplicate policy name within this tenant
  const existing = await db.policy.findFirst({
    where: { tenantId, name },
    select: { id: true },
  });
  if (existing) {
    return c.json(
      {
        error: {
          code: "CONFLICT",
          message: `A custom policy named "${name}" already exists`,
          requestId,
        },
      },
      409
    );
  }

  // Generate a unique identifier for custom policies
  const identifier = `custom_${crypto.randomUUID().slice(0, 8)}`;

  // Create the policy
  const policy = await db.policy.create({
    data: {
      tenantId,
      name,
      framework,
      identifier,
      content,
      keywords,
      isBuiltIn: false,
      isEnabled: true,
    },
    select: {
      id: true,
      name: true,
      framework: true,
      identifier: true,
      keywords: true,
      isEnabled: true,
      isBuiltIn: true,
      createdAt: true,
    },
  });

  // Enqueue embedding generation (async - don't block response)
  try {
    await embeddingQueue.add("policy-embedding", {
      tenantId,
      documentId: policy.id,
      content,
      metadata: { sourceType: "policy", policyId: policy.id },
    });
  } catch {
    // Non-critical - embedding will be missing but policy is still created
  }

  return c.json({ policy }, 201);
});

// ─── GET /api/v1/policies ─────────────────────────────────────────────────────

policyRoutes.get("/", async (c) => {
  const tenantId = c.get("tenantId");

  // Return built-in (tenantId=null) + tenant's custom policies
  const policies = await db.policy.findMany({
    where: {
      OR: [
        { tenantId: null }, // Built-in
        { tenantId },       // Custom for this tenant
      ],
    },
    orderBy: [{ isBuiltIn: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      framework: true,
      identifier: true,
      keywords: true,
      isEnabled: true,
      isBuiltIn: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  // Fetch this tenant's overrides for built-in policies
  const overrides = await db.policyOverride.findMany({
    where: { tenantId },
    select: { policyId: true, isEnabled: true },
  });
  const overrideMap = new Map(overrides.map((o) => [o.policyId, o.isEnabled]));

  // Merge override status into built-in policies
  const policiesWithOverrides = policies.map((policy) => {
    if (policy.isBuiltIn && overrideMap.has(policy.id)) {
      return { ...policy, isEnabled: overrideMap.get(policy.id)! };
    }
    return policy;
  });

  return c.json({ policies: policiesWithOverrides });
});

// ─── PATCH /api/v1/policies/:id ───────────────────────────────────────────────

policyRoutes.patch("/:id", async (c) => {
  const tenantId = c.get("tenantId");
  const requestId = c.get("requestId");
  const policyId = c.req.param("id");

  // Parse and validate body
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      { error: { code: "INVALID_BODY", message: "Invalid JSON body", requestId } },
      400
    );
  }

  const parsed = UpdatePolicySchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
          requestId,
        },
      },
      400
    );
  }

  // Verify policy exists and belongs to tenant (or is built-in)
  const existing = await db.policy.findUnique({
    where: { id: policyId },
    select: { id: true, tenantId: true, isBuiltIn: true },
  });

  if (!existing) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Policy not found", requestId } },
      404
    );
  }

  // Tenant can only update their own custom policies or toggle built-in enable/disable
  if (existing.tenantId !== null && existing.tenantId !== tenantId) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Policy not found", requestId } },
      404
    );
  }

  // Built-in policies: create/update a per-tenant override (does NOT mutate the global policy)
  if (existing.isBuiltIn) {
    const { isEnabled } = parsed.data;
    if (isEnabled === undefined) {
      return c.json(
        {
          error: {
            code: "FORBIDDEN",
            message: "Built-in policies can only be enabled or disabled per-tenant. Content cannot be modified.",
            requestId,
          },
        },
        403
      );
    }

    // Upsert a tenant-scoped override (doesn't touch the shared Policy row)
    await db.policyOverride.upsert({
      where: {
        tenantId_policyId: { tenantId, policyId },
      },
      create: {
        tenantId,
        policyId,
        isEnabled,
      },
      update: {
        isEnabled,
      },
    });

    // Return the policy with the override status
    const policy = await db.policy.findUnique({
      where: { id: policyId },
      select: {
        id: true,
        name: true,
        framework: true,
        identifier: true,
        keywords: true,
        isEnabled: true,
        isBuiltIn: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return c.json({
      policy: { ...policy, isEnabled }, // Reflect the tenant's override
    });
  }

  // Custom policy: can update content, keywords, name, isEnabled
  const { content, keywords, isEnabled, name } = parsed.data;

  // Reject empty updates (no fields provided)
  if (content === undefined && keywords === undefined && isEnabled === undefined && name === undefined) {
    return c.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "At least one field (content, keywords, isEnabled, name) must be provided",
          requestId,
        },
      },
      400
    );
  }

  const updateData: Record<string, any> = {};
  if (content !== undefined) updateData.content = content;
  if (keywords !== undefined) updateData.keywords = keywords;
  if (isEnabled !== undefined) updateData.isEnabled = isEnabled;
  if (name !== undefined) updateData.name = name;

  const policy = await db.policy.update({
    where: { id: policyId },
    data: updateData,
    select: {
      id: true,
      name: true,
      framework: true,
      identifier: true,
      keywords: true,
      isEnabled: true,
      isBuiltIn: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  // If content was updated, re-embed.
  // The embedding-generation processor handles cleanup of old embeddings
  // via documentId-based deleteMany before inserting new chunks.
  if (content !== undefined) {
    try {
      await embeddingQueue.add("policy-embedding", {
        tenantId,
        documentId: policyId,
        content,
        metadata: { sourceType: "policy", policyId },
      });
    } catch {
      // Non-critical
    }
  }

  return c.json({ policy });
});

// ─── DELETE /api/v1/policies/:id/override ─────────────────────────────────────

policyRoutes.delete("/:id/override", async (c) => {
  const tenantId = c.get("tenantId");
  const requestId = c.get("requestId");
  const policyId = c.req.param("id");

  // Verify it's a built-in policy
  const existing = await db.policy.findUnique({
    where: { id: policyId },
    select: { id: true, isBuiltIn: true },
  });

  if (!existing) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Policy not found", requestId } },
      404
    );
  }

  if (!existing.isBuiltIn) {
    return c.json(
      {
        error: {
          code: "BAD_REQUEST",
          message: "Only built-in policies have overrides. Use DELETE /policies/:id for custom policies.",
          requestId,
        },
      },
      400
    );
  }

  // Delete the override (restores default enabled state)
  await db.policyOverride.deleteMany({
    where: { tenantId, policyId },
  });

  return c.body(null, 204);
});

// ─── DELETE /api/v1/policies/:id ──────────────────────────────────────────────

policyRoutes.delete("/:id", async (c) => {
  const tenantId = c.get("tenantId");
  const requestId = c.get("requestId");
  const policyId = c.req.param("id");

  // Verify policy exists
  const existing = await db.policy.findUnique({
    where: { id: policyId },
    select: { id: true, tenantId: true, isBuiltIn: true },
  });

  if (!existing) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Policy not found", requestId } },
      404
    );
  }

  // Cannot delete built-in policies
  if (existing.isBuiltIn) {
    return c.json(
      {
        error: {
          code: "FORBIDDEN",
          message: "Built-in policies cannot be deleted. You can disable them instead.",
          requestId,
        },
      },
      403
    );
  }

  // Can only delete own tenant's policies
  if (existing.tenantId !== tenantId) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Policy not found", requestId } },
      404
    );
  }

  // Delete associated embeddings first
  await db.embedding.deleteMany({
    where: {
      tenantId,
      documentId: policyId,
    },
  });

  // Delete the policy
  await db.policy.delete({
    where: { id: policyId },
  });

  return c.body(null, 204);
});
