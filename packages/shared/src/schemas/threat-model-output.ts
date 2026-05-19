/**
 * Zod schemas for Threat Model Agent LLM output validation.
 *
 * These schemas define the structured output shape for the two-pass generation:
 * - Pass 1 (Structure): Components, data flows, trust boundaries, entry points, assets
 * - Pass 2 (Threats): STRIDE-categorized threats linked to structure entities
 *
 * The agent produces these shapes via `structuredOutput: { schema }` in Mastra.
 * Invalid/unresolvable references are handled by the saver (skipped, not rejected).
 */
import { z } from "zod";

// ─── Pass 1: Structure Output ─────────────────────────────────────────────────

export const ComponentOutputSchema = z.object({
  /** Temporary ID used for cross-referencing within this generation (e.g., "comp-1") */
  tempId: z.string().describe("Temporary ID for cross-referencing (e.g., 'comp-1')"),
  name: z.string().describe("Name of the system component"),
  type: z
    .string()
    .describe("Type of component (e.g., 'web-app', 'database', 'api-gateway', 'message-queue', 'cdn', 'storage')"),
  description: z.string().optional().describe("Brief description of the component's purpose"),
});

export const DataFlowOutputSchema = z.object({
  tempId: z.string().describe("Temporary ID for cross-referencing (e.g., 'flow-1')"),
  fromComponentTempId: z.string().describe("Temp ID of the source component"),
  toComponentTempId: z.string().describe("Temp ID of the destination component"),
  description: z.string().optional().describe("Description of what data flows between the components"),
  dataType: z.string().optional().describe("Type of data (e.g., 'user-credentials', 'api-tokens', 'PII')"),
  sensitivity: z
    .enum(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"])
    .optional()
    .describe("Sensitivity level of the data in transit"),
  encryption: z
    .string()
    .optional()
    .describe("Encryption method used (e.g., 'TLS 1.3', 'none', 'AES-256')"),
});

export const TrustBoundaryOutputSchema = z.object({
  tempId: z.string().describe("Temporary ID for cross-referencing (e.g., 'boundary-1')"),
  name: z.string().describe("Name of the trust boundary"),
  description: z.string().optional().describe("Description of the trust boundary"),
  fromZone: z.string().optional().describe("Zone on one side (e.g., 'internet', 'dmz', 'internal')"),
  toZone: z.string().optional().describe("Zone on the other side"),
});

export const EntryPointOutputSchema = z.object({
  tempId: z.string().describe("Temporary ID for cross-referencing (e.g., 'ep-1')"),
  name: z.string().describe("Name of the entry point"),
  type: z
    .string()
    .describe("Type of entry point (e.g., 'REST API', 'GraphQL', 'WebSocket', 'webhook', 'SSH')"),
  description: z.string().optional().describe("Description of the entry point"),
  authRequired: z.boolean().describe("Whether authentication is required"),
  authType: z
    .string()
    .optional()
    .describe("Authentication type (e.g., 'OAuth2', 'API key', 'JWT', 'none')"),
  rateLimited: z.boolean().describe("Whether rate limiting is applied"),
});

export const AssetOutputSchema = z.object({
  tempId: z.string().describe("Temporary ID for cross-referencing (e.g., 'asset-1')"),
  name: z.string().describe("Name of the data asset"),
  type: z
    .string()
    .describe("Type of asset (e.g., 'database', 'credentials', 'PII', 'encryption-keys', 'logs')"),
  sensitivity: z
    .enum(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"])
    .optional()
    .describe("Sensitivity level of the asset"),
  description: z.string().optional().describe("Brief description of the asset"),
});

/**
 * Pass 1 output: The complete system structure identified by the agent.
 */
export const StructureOutputSchema = z.object({
  components: z
    .array(ComponentOutputSchema)
    .min(3)
    .describe("System components (minimum 3)"),
  dataFlows: z
    .array(DataFlowOutputSchema)
    .min(2)
    .describe("Data flows between components (minimum 2)"),
  trustBoundaries: z
    .array(TrustBoundaryOutputSchema)
    .min(1)
    .describe("Trust boundaries (minimum 1)"),
  entryPoints: z
    .array(EntryPointOutputSchema)
    .min(2)
    .describe("External entry points (minimum 2)"),
  assets: z
    .array(AssetOutputSchema)
    .describe("Data assets in the system"),
});

// ─── Pass 2: Threats Output ───────────────────────────────────────────────────

export const STRIDE_CATEGORIES = [
  "SPOOFING",
  "TAMPERING",
  "REPUDIATION",
  "INFORMATION_DISCLOSURE",
  "DENIAL_OF_SERVICE",
  "ELEVATION_OF_PRIVILEGE",
] as const;

export const SEVERITY_LEVELS = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;

export const ThreatOutputSchema = z.object({
  title: z.string().describe("Concise title of the threat"),
  description: z.string().describe("Detailed description of the threat scenario"),
  strideCategory: z
    .enum(STRIDE_CATEGORIES)
    .describe("STRIDE category this threat falls under"),
  severity: z
    .enum(SEVERITY_LEVELS)
    .describe("Severity level of the threat"),
  likelihood: z
    .enum(["HIGH", "MEDIUM", "LOW"])
    .optional()
    .describe("Likelihood of the threat being exploited"),
  /** Reference to the component, data flow, or entry point this threat targets */
  targetEntityTempId: z
    .string()
    .optional()
    .describe("Temp ID of the component, data flow, or entry point this threat targets"),
  /** What type of entity is targeted */
  targetEntityType: z
    .enum(["component", "dataFlow", "entryPoint"])
    .optional()
    .describe("Type of entity the threat targets"),
  mitigationNotes: z
    .string()
    .optional()
    .describe("Suggested mitigation or existing mitigation observed"),
});

/**
 * Pass 2 output: STRIDE threats generated for the identified structure.
 */
export const ThreatsOutputSchema = z.object({
  threats: z
    .array(ThreatOutputSchema)
    .min(3)
    .describe("STRIDE threats identified for the system (minimum 3)"),
});

// ─── Inferred Types ───────────────────────────────────────────────────────────

export type ComponentOutput = z.infer<typeof ComponentOutputSchema>;
export type DataFlowOutput = z.infer<typeof DataFlowOutputSchema>;
export type TrustBoundaryOutput = z.infer<typeof TrustBoundaryOutputSchema>;
export type EntryPointOutput = z.infer<typeof EntryPointOutputSchema>;
export type AssetOutput = z.infer<typeof AssetOutputSchema>;
export type StructureOutput = z.infer<typeof StructureOutputSchema>;
export type ThreatOutput = z.infer<typeof ThreatOutputSchema>;
export type ThreatsOutput = z.infer<typeof ThreatsOutputSchema>;
