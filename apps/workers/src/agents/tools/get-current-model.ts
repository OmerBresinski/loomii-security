/**
 * getCurrentModel Tool
 *
 * Reads the existing threat model entities for a tenant.
 * Used by the Threat Model Agent to avoid generating duplicate entities
 * during incremental updates (and during initial generation to confirm
 * the model is empty).
 */
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { db } from "@loomii/db";

export const getCurrentModelTool = createTool({
  id: "get-current-model",
  description:
    "Read the current state of the tenant's threat model, including all components, data flows, trust boundaries, entry points, assets, and threats. Use this to understand what already exists and avoid generating duplicates.",
  inputSchema: z.object({
    includeThreats: z
      .boolean()
      .optional()
      .describe("Whether to include existing threats in the response (default true)"),
  }),
  outputSchema: z.object({
    exists: z.boolean(),
    status: z.string().optional(),
    version: z.number().optional(),
    components: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        type: z.string(),
        description: z.string().nullable(),
      })
    ),
    dataFlows: z.array(
      z.object({
        id: z.string(),
        fromComponentId: z.string(),
        toComponentId: z.string(),
        description: z.string().nullable(),
        dataType: z.string().nullable(),
      })
    ),
    trustBoundaries: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        fromZone: z.string().nullable(),
        toZone: z.string().nullable(),
      })
    ),
    entryPoints: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        type: z.string(),
        authRequired: z.boolean(),
      })
    ),
    assets: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        type: z.string(),
        sensitivity: z.string().nullable(),
      })
    ),
    threats: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        strideCategory: z.string(),
        severity: z.string(),
        componentId: z.string().nullable(),
      })
    ),
  }),
  execute: async (inputData, context) => {
    const tenantId = context?.requestContext?.get("tenantId") as
      | string
      | undefined;

    if (!tenantId) {
      return {
        exists: false,
        components: [],
        dataFlows: [],
        trustBoundaries: [],
        entryPoints: [],
        assets: [],
        threats: [],
      };
    }

    const { includeThreats = true } = inputData;

    const threatModel = await db.threatModel.findUnique({
      where: { tenantId },
      include: {
        components: {
          where: { isDeprecated: false },
          select: { id: true, name: true, type: true, description: true },
        },
        dataFlows: {
          where: { isDeprecated: false },
          select: {
            id: true,
            fromComponentId: true,
            toComponentId: true,
            description: true,
            dataType: true,
          },
        },
        trustBoundaries: {
          where: { isDeprecated: false },
          select: { id: true, name: true, fromZone: true, toZone: true },
        },
        entryPoints: {
          where: { isDeprecated: false },
          select: { id: true, name: true, type: true, authRequired: true },
        },
        assets: {
          where: { isDeprecated: false },
          select: { id: true, name: true, type: true, sensitivity: true },
        },
        threats: includeThreats
          ? {
              where: { isDeprecated: false },
              select: {
                id: true,
                title: true,
                strideCategory: true,
                severity: true,
                componentId: true,
              },
            }
          : false,
      },
    });

    if (!threatModel) {
      return {
        exists: false,
        components: [],
        dataFlows: [],
        trustBoundaries: [],
        entryPoints: [],
        assets: [],
        threats: [],
      };
    }

    return {
      exists: true,
      status: threatModel.status,
      version: threatModel.version,
      components: threatModel.components,
      dataFlows: threatModel.dataFlows,
      trustBoundaries: threatModel.trustBoundaries,
      entryPoints: threatModel.entryPoints,
      assets: threatModel.assets,
      threats: includeThreats ? (threatModel.threats ?? []) : [],
    };
  },
});
