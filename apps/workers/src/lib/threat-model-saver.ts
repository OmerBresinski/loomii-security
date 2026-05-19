/**
 * Threat Model Saver
 *
 * Handles atomic persistence of threat model generation results.
 * Wraps ALL writes in a Prisma $transaction so the model is either
 * fully saved or not at all. Invalid/unresolvable references in LLM
 * output are skipped (logged), and valid entities are still saved.
 *
 * Flow:
 * 1. Save components (get real IDs mapped from temp IDs)
 * 2. Save data flows (resolve component references)
 * 3. Save trust boundaries
 * 4. Save entry points
 * 5. Save assets
 * 6. Save threats (resolve entity references)
 * 7. Update ThreatModel status to ACTIVE
 * 8. Create TmChange v1 changelog entry
 */
import { db } from "@loomii/db";
import type { StructureOutput, ThreatsOutput } from "@loomii/shared/schemas";
import { logger } from "./logger";

export interface SaveThreatModelResult {
  componentCount: number;
  dataFlowCount: number;
  trustBoundaryCount: number;
  entryPointCount: number;
  assetCount: number;
  threatCount: number;
  skippedReferences: number;
}

/**
 * Atomically save the complete threat model output from two-pass generation.
 *
 * Uses Prisma $transaction to ensure all-or-nothing persistence.
 * Invalid references (e.g., a data flow referencing a non-existent component)
 * are skipped and logged, but do not fail the transaction.
 *
 * @param tenantId - The tenant this model belongs to
 * @param threatModelId - The ThreatModel record ID
 * @param structure - Pass 1 output (components, flows, boundaries, entry points, assets)
 * @param threats - Pass 2 output (STRIDE threats)
 */
export async function saveThreatModelAtomically(
  tenantId: string,
  threatModelId: string,
  structure: StructureOutput,
  threats: ThreatsOutput
): Promise<SaveThreatModelResult> {
  const childLogger = logger.child({
    module: "threat-model-saver",
    tenantId,
    threatModelId,
  });

  let skippedReferences = 0;

  const result = await db.$transaction(async (tx) => {
    // ─── 1. Save Components ─────────────────────────────────────────────
    const tempIdToComponentId = new Map<string, string>();

    for (const component of structure.components) {
      const created = await tx.tmComponent.create({
        data: {
          threatModelId,
          name: component.name,
          type: component.type,
          description: component.description ?? null,
        },
      });
      tempIdToComponentId.set(component.tempId, created.id);
    }

    childLogger.info(
      { count: tempIdToComponentId.size },
      "Components saved"
    );

    // ─── 2. Save Data Flows ─────────────────────────────────────────────
    const tempIdToDataFlowId = new Map<string, string>();
    let dataFlowCount = 0;

    for (const flow of structure.dataFlows) {
      const fromId = tempIdToComponentId.get(flow.fromComponentTempId);
      const toId = tempIdToComponentId.get(flow.toComponentTempId);

      if (!fromId || !toId) {
        childLogger.warn(
          {
            flowTempId: flow.tempId,
            fromRef: flow.fromComponentTempId,
            toRef: flow.toComponentTempId,
          },
          "Skipping data flow with unresolvable component reference"
        );
        skippedReferences++;
        continue;
      }

      const created = await tx.tmDataFlow.create({
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
      tempIdToDataFlowId.set(flow.tempId, created.id);
      dataFlowCount++;
    }

    childLogger.info({ count: dataFlowCount }, "Data flows saved");

    // ─── 3. Save Trust Boundaries ───────────────────────────────────────
    const tempIdToBoundaryId = new Map<string, string>();

    for (const boundary of structure.trustBoundaries) {
      const created = await tx.tmTrustBoundary.create({
        data: {
          threatModelId,
          name: boundary.name,
          description: boundary.description ?? null,
          fromZone: boundary.fromZone ?? null,
          toZone: boundary.toZone ?? null,
        },
      });
      tempIdToBoundaryId.set(boundary.tempId, created.id);
    }

    childLogger.info(
      { count: tempIdToBoundaryId.size },
      "Trust boundaries saved"
    );

    // ─── 4. Save Entry Points ───────────────────────────────────────────
    const tempIdToEntryPointId = new Map<string, string>();

    for (const ep of structure.entryPoints) {
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
      tempIdToEntryPointId.set(ep.tempId, created.id);
    }

    childLogger.info(
      { count: tempIdToEntryPointId.size },
      "Entry points saved"
    );

    // ─── 5. Save Assets ─────────────────────────────────────────────────
    let assetCount = 0;

    for (const asset of structure.assets) {
      await tx.tmAsset.create({
        data: {
          threatModelId,
          name: asset.name,
          type: asset.type,
          sensitivity: asset.sensitivity ?? null,
          description: asset.description ?? null,
        },
      });
      assetCount++;
    }

    childLogger.info({ count: assetCount }, "Assets saved");

    // ─── 6. Save Threats ────────────────────────────────────────────────
    let threatCount = 0;

    for (const threat of threats.threats) {
      // Resolve target entity reference
      let componentId: string | null = null;
      let dataFlowId: string | null = null;
      let entryPointId: string | null = null;

      if (threat.targetEntityTempId && threat.targetEntityType) {
        switch (threat.targetEntityType) {
          case "component":
            componentId =
              tempIdToComponentId.get(threat.targetEntityTempId) ?? null;
            if (!componentId) {
              childLogger.warn(
                { threatTitle: threat.title, ref: threat.targetEntityTempId },
                "Threat references unknown component - saving without link"
              );
              skippedReferences++;
            }
            break;
          case "dataFlow":
            dataFlowId =
              tempIdToDataFlowId.get(threat.targetEntityTempId) ?? null;
            if (!dataFlowId) {
              childLogger.warn(
                { threatTitle: threat.title, ref: threat.targetEntityTempId },
                "Threat references unknown data flow - saving without link"
              );
              skippedReferences++;
            }
            break;
          case "entryPoint":
            entryPointId =
              tempIdToEntryPointId.get(threat.targetEntityTempId) ?? null;
            if (!entryPointId) {
              childLogger.warn(
                { threatTitle: threat.title, ref: threat.targetEntityTempId },
                "Threat references unknown entry point - saving without link"
              );
              skippedReferences++;
            }
            break;
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
      threatCount++;
    }

    childLogger.info({ count: threatCount }, "Threats saved");

    // ─── 7. Update ThreatModel status ───────────────────────────────────
    await tx.threatModel.update({
      where: { id: threatModelId },
      data: {
        status: "ACTIVE",
        version: 1,
        generatedAt: new Date(),
        errorMessage: null,
      },
    });

    // ─── 8. Create TmChange changelog ───────────────────────────────────
    await tx.tmChange.create({
      data: {
        threatModelId,
        version: 1,
        changeType: "initial_generation",
        triggeredBy: "system",
        summary: `Initial threat model generated: ${tempIdToComponentId.size} components, ${dataFlowCount} data flows, ${tempIdToBoundaryId.size} trust boundaries, ${tempIdToEntryPointId.size} entry points, ${assetCount} assets, ${threatCount} threats`,
        diff: {
          type: "initial_generation",
          components: tempIdToComponentId.size,
          dataFlows: dataFlowCount,
          trustBoundaries: tempIdToBoundaryId.size,
          entryPoints: tempIdToEntryPointId.size,
          assets: assetCount,
          threats: threatCount,
        },
      },
    });

    return {
      componentCount: tempIdToComponentId.size,
      dataFlowCount,
      trustBoundaryCount: tempIdToBoundaryId.size,
      entryPointCount: tempIdToEntryPointId.size,
      assetCount,
      threatCount,
      skippedReferences,
    };
  });

  childLogger.info(
    {
      ...result,
      status: "ACTIVE",
    },
    "Threat model saved atomically"
  );

  return result;
}

/**
 * Mark the threat model as failed with an error message.
 * Called when generation fails at any point.
 */
export async function markThreatModelError(
  threatModelId: string,
  errorMessage: string
): Promise<void> {
  await db.threatModel.update({
    where: { id: threatModelId },
    data: {
      status: "ERROR",
      errorMessage: errorMessage.slice(0, 1000), // Cap at 1000 chars
    },
  });
}
