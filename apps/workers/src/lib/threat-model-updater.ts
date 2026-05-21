/**
 * Threat Model Updater
 *
 * Applies incremental updates to an existing threat model atomically.
 * All writes are wrapped in a Prisma $transaction - either everything
 * succeeds or nothing is written (existing model remains unchanged).
 *
 * Flow:
 * 1. Resolve component names to IDs (for data flow and threat linking)
 * 2. Create new components
 * 3. Create new data flows (resolving component references)
 * 4. Create new entry points
 * 5. Create new threats (resolving entity references)
 * 6. Apply modifications to existing threats
 * 7. Increment model version
 * 8. Create TmChange audit record
 */
import { db } from "@loomii/db";
import type { ThreatModelUpdateOutput } from "@loomii/shared/schemas";
import { logger } from "./logger";

export interface UpdateResult {
  newComponentCount: number;
  newDataFlowCount: number;
  newEntryPointCount: number;
  newThreatCount: number;
  modifiedThreatCount: number;
  newVersion: number;
}

/**
 * Apply an incremental update to the threat model atomically.
 *
 * @param threatModelId - The threat model record ID
 * @param tenantId - Tenant ID for logging
 * @param update - The agent-produced update output
 * @param triggeredBy - The review ID that triggered this update (for audit)
 */
export async function applyThreatModelUpdate(
  threatModelId: string,
  tenantId: string,
  update: ThreatModelUpdateOutput,
  triggeredBy: string
): Promise<UpdateResult> {
  const childLogger = logger.child({
    module: "threat-model-updater",
    tenantId,
    threatModelId,
    triggeredBy,
  });

  const result = await db.$transaction(async (tx) => {
    // ─── 0. Atomically increment version (prevents race condition) ───────
    // With concurrency=2, two updates for the same tenant could run
    // simultaneously. Using { increment: 1 } ensures each gets a unique
    // version number even under contention.
    const updatedModel = await tx.threatModel.update({
      where: { id: threatModelId },
      data: { version: { increment: 1 } },
      select: { version: true },
    });
    const newVersion = updatedModel.version;

    // ─── 1. Build component name -> ID lookup (existing components) ─────
    const existingComponents = await tx.tmComponent.findMany({
      where: { threatModelId, isDeprecated: false },
      select: { id: true, name: true },
    });
    const componentNameToId = new Map(
      existingComponents.map((c) => [c.name.toLowerCase(), c.id])
    );

    // ─── 2. Create new components ───────────────────────────────────────
    let newComponentCount = 0;
    for (const comp of update.newComponents) {
      // Skip if component with same name already exists
      if (componentNameToId.has(comp.name.toLowerCase())) {
        childLogger.info({ name: comp.name }, "Skipping duplicate component");
        continue;
      }

      const created = await tx.tmComponent.create({
        data: {
          threatModelId,
          name: comp.name,
          type: comp.type,
          description: comp.description ?? null,
        },
      });
      componentNameToId.set(comp.name.toLowerCase(), created.id);
      newComponentCount++;
    }

    // ─── 3. Create new data flows ───────────────────────────────────────
    let newDataFlowCount = 0;
    for (const flow of update.newDataFlows) {
      const fromId = componentNameToId.get(flow.fromComponentName.toLowerCase());
      const toId = componentNameToId.get(flow.toComponentName.toLowerCase());

      if (!fromId || !toId) {
        childLogger.warn(
          { from: flow.fromComponentName, to: flow.toComponentName },
          "Skipping data flow with unresolvable component reference"
        );
        continue;
      }

      await tx.tmDataFlow.create({
        data: {
          threatModelId,
          fromComponentId: fromId,
          toComponentId: toId,
          description: flow.description ?? null,
          dataType: flow.dataType ?? null,
          sensitivity: flow.sensitivity ?? null,
          encryption: flow.encryption ?? null,
        },
      });
      newDataFlowCount++;
    }

    // ─── 4. Create new entry points ─────────────────────────────────────
    let newEntryPointCount = 0;
    const entryPointNameToId = new Map<string, string>();

    // Load existing entry points for reference
    const existingEntryPoints = await tx.tmEntryPoint.findMany({
      where: { threatModelId, isDeprecated: false },
      select: { id: true, name: true },
    });
    for (const ep of existingEntryPoints) {
      entryPointNameToId.set(ep.name.toLowerCase(), ep.id);
    }

    for (const ep of update.newEntryPoints) {
      if (entryPointNameToId.has(ep.name.toLowerCase())) {
        childLogger.info({ name: ep.name }, "Skipping duplicate entry point");
        continue;
      }

      const created = await tx.tmEntryPoint.create({
        data: {
          threatModelId,
          name: ep.name,
          type: ep.type,
          description: ep.description ?? null,
          authRequired: ep.authRequired,
          authType: ep.authType ?? null,
          rateLimited: ep.rateLimited,
        },
      });
      entryPointNameToId.set(ep.name.toLowerCase(), created.id);
      newEntryPointCount++;
    }

    // ─── 5. Create new threats ──────────────────────────────────────────
    let newThreatCount = 0;
    for (const threat of update.newThreats) {
      // Resolve target entity reference by name
      let componentId: string | null = null;
      let dataFlowId: string | null = null;
      let entryPointId: string | null = null;

      if (threat.targetEntityName && threat.targetEntityType) {
        const lowerName = threat.targetEntityName.toLowerCase();
        switch (threat.targetEntityType) {
          case "component":
            componentId = componentNameToId.get(lowerName) ?? null;
            break;
          case "entryPoint":
            entryPointId = entryPointNameToId.get(lowerName) ?? null;
            break;
          // dataFlow linking by name is not reliable - skip
        }
      }

      await tx.tmThreat.create({
        data: {
          threatModelId,
          title: threat.title,
          description: threat.description,
          strideCategory: threat.strideCategory,
          severity: threat.severity,
          likelihood: threat.likelihood ?? null,
          mitigationStatus: "UNMITIGATED",
          mitigationNotes: threat.mitigationNotes ?? null,
          componentId,
          dataFlowId,
          entryPointId,
        },
      });
      newThreatCount++;
    }

    // ─── 6. Modify existing threats ─────────────────────────────────────
    let modifiedThreatCount = 0;
    for (const mod of update.modifiedThreats) {
      // Find the existing threat by exact title match
      const existing = await tx.tmThreat.findFirst({
        where: {
          threatModelId,
          title: mod.existingThreatTitle,
          isDeprecated: false,
        },
        select: { id: true },
      });

      if (!existing) {
        childLogger.warn(
          { title: mod.existingThreatTitle },
          "Could not find existing threat to modify"
        );
        continue;
      }

      const updateData: Record<string, any> = {};
      if (mod.mitigationStatus != null) updateData.mitigationStatus = mod.mitigationStatus;
      if (mod.mitigationNotes != null) updateData.mitigationNotes = mod.mitigationNotes;
      if (mod.severity != null) updateData.severity = mod.severity;
      if (mod.isDeprecated != null) updateData.isDeprecated = mod.isDeprecated;

      if (Object.keys(updateData).length > 0) {
        await tx.tmThreat.update({
          where: { id: existing.id },
          data: updateData,
        });
        modifiedThreatCount++;
      }
    }

    // ─── 7. Create TmChange audit record ────────────────────────────────
    // (Version was already incremented atomically in step 0)
    await tx.tmChange.create({
      data: {
        threatModelId,
        version: newVersion,
        changeType: "incremental_update",
        triggeredBy,
        summary: update.summary,
        diff: {
          type: "incremental_update",
          newComponents: newComponentCount,
          newDataFlows: newDataFlowCount,
          newEntryPoints: newEntryPointCount,
          newThreats: newThreatCount,
          modifiedThreats: modifiedThreatCount,
        },
      },
    });

    return {
      newComponentCount,
      newDataFlowCount,
      newEntryPointCount,
      newThreatCount,
      modifiedThreatCount,
      newVersion,
    };
  });

  childLogger.info(
    { ...result },
    "Threat model update applied atomically"
  );

  return result;
}
