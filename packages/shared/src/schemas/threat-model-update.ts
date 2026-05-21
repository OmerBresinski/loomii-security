/**
 * Threat Model Update Output Schema
 *
 * Defines the structured output shape for incremental threat model updates.
 * The agent produces additions and modifications to the existing model.
 *
 * Unlike initial generation (which creates everything from scratch), updates:
 * - Add new entities (components, flows, entry points, threats)
 * - Modify existing threats (e.g., change mitigation status)
 * - Reference existing entities by their real DB IDs
 */
import { z } from "zod";

// ─── New Entities (additions to the model) ───────────────────────────────────

export const NewComponentSchema = z.object({
  name: z.string().describe("Name of the new component"),
  type: z.string().describe("Type (e.g., 'web-app', 'database', 'api-gateway')"),
  description: z.string().optional().describe("Brief description"),
});

export const NewDataFlowSchema = z.object({
  fromComponentName: z.string().describe("Name of the source component (must match existing or new component)"),
  toComponentName: z.string().describe("Name of the destination component (must match existing or new component)"),
  description: z.string().optional().describe("What data flows between them"),
  dataType: z.string().optional().describe("Type of data (e.g., 'PII', 'credentials')"),
  sensitivity: z.enum(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"]).optional(),
  encryption: z.string().optional().describe("Encryption in transit"),
});

export const NewEntryPointSchema = z.object({
  name: z.string().describe("Name of the entry point"),
  type: z.string().describe("Type (e.g., 'REST API', 'webhook', 'WebSocket')"),
  description: z.string().optional(),
  authRequired: z.boolean().describe("Whether authentication is required"),
  authType: z.string().optional(),
  rateLimited: z.boolean().describe("Whether rate limiting is applied"),
});

export const NewThreatSchema = z.object({
  title: z.string().describe("Concise threat title"),
  description: z.string().describe("Detailed threat description"),
  strideCategory: z.enum([
    "SPOOFING",
    "TAMPERING",
    "REPUDIATION",
    "INFORMATION_DISCLOSURE",
    "DENIAL_OF_SERVICE",
    "ELEVATION_OF_PRIVILEGE",
  ]),
  severity: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]),
  likelihood: z.enum(["HIGH", "MEDIUM", "LOW"]).optional(),
  /** Name of the target component/entry point (for linking) */
  targetEntityName: z.string().optional().describe("Name of the component or entry point this threat targets"),
  targetEntityType: z.enum(["component", "dataFlow", "entryPoint"]).optional(),
  mitigationNotes: z.string().optional(),
});

// ─── Modified Threats (changes to existing threats) ──────────────────────────

export const ModifiedThreatSchema = z.object({
  /** Title of the existing threat to modify (used for matching) */
  existingThreatTitle: z.string().describe("Title of the existing threat to modify (exact match)"),
  /** New mitigation status */
  mitigationStatus: z.enum(["UNMITIGATED", "PARTIALLY_MITIGATED", "MITIGATED"]).optional(),
  /** Updated mitigation notes */
  mitigationNotes: z.string().optional(),
  /** Updated severity (if the review changes our assessment) */
  severity: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).optional(),
  /** Mark as deprecated (if the review makes it no longer relevant) */
  isDeprecated: z.boolean().optional(),
});

// ─── Full Update Output ──────────────────────────────────────────────────────

export const ThreatModelUpdateOutputSchema = z.object({
  /** Summary of what changed and why */
  summary: z.string().min(10).max(500).describe("Summary of the incremental update"),

  /** New components to add */
  newComponents: z.array(NewComponentSchema).default([]),

  /** New data flows to add */
  newDataFlows: z.array(NewDataFlowSchema).default([]),

  /** New entry points to add */
  newEntryPoints: z.array(NewEntryPointSchema).default([]),

  /** New threats to add */
  newThreats: z.array(NewThreatSchema).default([]),

  /** Existing threats to modify */
  modifiedThreats: z.array(ModifiedThreatSchema).default([]),
});

export type ThreatModelUpdateOutput = z.infer<typeof ThreatModelUpdateOutputSchema>;
export type NewComponent = z.infer<typeof NewComponentSchema>;
export type NewDataFlow = z.infer<typeof NewDataFlowSchema>;
export type NewEntryPoint = z.infer<typeof NewEntryPointSchema>;
export type NewThreat = z.infer<typeof NewThreatSchema>;
export type ModifiedThreat = z.infer<typeof ModifiedThreatSchema>;
