/**
 * Threat Model Agent
 *
 * A Mastra Agent backed by Claude Sonnet (via Bedrock) that performs
 * threat model generation and updates. Uses two tools:
 * - searchContext: semantic search across all historical context bundles
 * - getCurrentModel: read existing threat model entities
 *
 * The agent is used in a two-pass generation pattern:
 * - Pass 1: Structure identification (components, flows, boundaries, entry points, assets)
 * - Pass 2: STRIDE threat generation for each identified entity
 *
 * Each pass uses `agent.generate()` with `structuredOutput: { schema }`.
 */
import { createBedrockAgent } from "../lib/bedrock";
import { searchContextTool } from "./tools/search-context";
import { getCurrentModelTool } from "./tools/get-current-model";

// ─── System Prompt ────────────────────────────────────────────────────────────

const THREAT_MODEL_SYSTEM_PROMPT = `You are an expert security architect specializing in threat modeling using the STRIDE methodology. Your role is to analyze system architectures and identify security threats.

## Your Capabilities
- Analyze system architectures from design documents, code changes, and architecture descriptions
- Identify system components, data flows, trust boundaries, entry points, and data assets
- Generate comprehensive STRIDE-categorized threats for each system element
- Prioritize threats by severity and likelihood

## Guidelines

### Structure Identification (Pass 1)
When identifying system structure:
1. Use the searchContext tool to gather information about the system's architecture, integrations, APIs, and data handling
2. Use getCurrentModel to check if any existing structure has been identified
3. Identify ALL distinct system components (services, databases, queues, caches, CDNs, etc.)
4. Map data flows between components, noting sensitivity and encryption
5. Identify trust boundaries where security contexts change
6. Identify all entry points where external actors interact with the system
7. Identify sensitive data assets that need protection

### Threat Generation (Pass 2)
When generating STRIDE threats:
1. For each component, data flow, and entry point, consider ALL STRIDE categories:
   - **Spoofing**: Can an attacker impersonate a legitimate entity?
   - **Tampering**: Can data be modified in transit or at rest?
   - **Repudiation**: Can actions be performed without audit trail?
   - **Information Disclosure**: Can sensitive data leak?
   - **Denial of Service**: Can availability be disrupted?
   - **Elevation of Privilege**: Can an attacker gain unauthorized access?
2. Prioritize threats realistically based on:
   - Attack surface exposure (public-facing = higher risk)
   - Data sensitivity (PII, credentials = higher risk)
   - Existing mitigations mentioned in context
3. Reference specific components/flows/entry points for each threat
4. Note any existing mitigations you observe in the context

## Important Rules
- ALWAYS use searchContext to gather system information before generating output
- Be specific - reference actual system elements, not generic threats
- Cover all STRIDE categories for complex systems
- Minimum output: 3 components, 2 data flows, 1 trust boundary, 2 entry points, 3 threats
- If context is limited, make reasonable inferences based on available information
- Use temp IDs consistently so threats can reference structure elements`;

// ─── Agent Definition ─────────────────────────────────────────────────────────

/**
 * The threat model Mastra agent.
 *
 * Uses Claude Sonnet via Bedrock for balanced capability/cost ratio.
 * Tools enable the agent to gather context and check existing state.
 */
export let threatModelAgent = createBedrockAgent({
  id: "threat-model-agent",
  name: "Threat Model Agent",
  instructions: { role: "system", content: THREAT_MODEL_SYSTEM_PROMPT },
  model: "CLAUDE_SONNET",
});

// Attach tools to the agent (createBedrockAgent doesn't support tools natively)
// We pass tools directly via the generate() call options instead.

/** Tools available to the threat model agent */
export const threatModelTools = {
  searchContext: searchContextTool,
  getCurrentModel: getCurrentModelTool,
};

/** @internal - Only for testing. Replaces the agent with a mock. */
export function __setAgent(agent: any) {
  threatModelAgent = agent;
}

// ─── Prompt Builders ──────────────────────────────────────────────────────────

/**
 * Build the user prompt for Pass 1: Structure identification.
 * Includes context bundle summaries to give the agent initial context.
 */
export function buildStructurePrompt(
  contextSummaries: Array<{ title: string | null; content: string }>
): string {
  const contextBlock = contextSummaries
    .map(
      (b, i) =>
        `--- Context Bundle ${i + 1}${b.title ? ` (${b.title})` : ""} ---\n${b.content}`
    )
    .join("\n\n");

  return `## Task: Identify System Structure

Analyze the following context bundles from this tenant's system. Use the searchContext tool to find additional relevant information about the system architecture. Then identify all system components, data flows, trust boundaries, entry points, and data assets.

Use getCurrentModel to check if any structure already exists (it should be empty for initial generation).

${contextBlock}

Based on all available context, identify the complete system structure. Be thorough - include all components, flows, and boundaries you can identify or reasonably infer.`;
}

/**
 * Build the user prompt for Pass 2: Threat generation.
 * Includes the structure from Pass 1 so the agent can reference entities.
 */
export function buildThreatsPrompt(
  contextSummaries: Array<{ title: string | null; content: string }>,
  structure: {
    components: Array<{ tempId: string; name: string; type: string }>;
    dataFlows: Array<{
      tempId: string;
      fromComponentTempId: string;
      toComponentTempId: string;
    }>;
    trustBoundaries: Array<{ tempId: string; name: string }>;
    entryPoints: Array<{ tempId: string; name: string; type: string }>;
    assets: Array<{ tempId: string; name: string; type: string }>;
  }
): string {
  const componentsList = structure.components
    .map((c) => `  - ${c.tempId}: ${c.name} (${c.type})`)
    .join("\n");
  const flowsList = structure.dataFlows
    .map(
      (f) =>
        `  - ${f.tempId}: ${f.fromComponentTempId} -> ${f.toComponentTempId}`
    )
    .join("\n");
  const boundariesList = structure.trustBoundaries
    .map((b) => `  - ${b.tempId}: ${b.name}`)
    .join("\n");
  const entryPointsList = structure.entryPoints
    .map((e) => `  - ${e.tempId}: ${e.name} (${e.type})`)
    .join("\n");
  const assetsList = structure.assets
    .map((a) => `  - ${a.tempId}: ${a.name} (${a.type})`)
    .join("\n");

  const contextBlock = contextSummaries
    .slice(0, 3) // Limit context in Pass 2 to avoid token overflow
    .map(
      (b, i) =>
        `--- Context Bundle ${i + 1}${b.title ? ` (${b.title})` : ""} ---\n${b.content}`
    )
    .join("\n\n");

  return `## Task: Generate STRIDE Threats

Based on the identified system structure below, generate comprehensive STRIDE threats for each component, data flow, and entry point. Use searchContext to find additional security-relevant details.

### Identified Structure

**Components:**
${componentsList}

**Data Flows:**
${flowsList}

**Trust Boundaries:**
${boundariesList}

**Entry Points:**
${entryPointsList}

**Assets:**
${assetsList}

### Available Context
${contextBlock}

Generate threats covering ALL STRIDE categories. Reference specific entities using their tempId in the targetEntityTempId field. Ensure all severity levels are represented appropriately.`;
}
