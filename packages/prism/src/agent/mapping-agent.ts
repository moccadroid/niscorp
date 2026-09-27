// ═══════════════════════════════════════════════════════════
// @niscorp/prism/agent — Prism mapping agent
// ═══════════════════════════════════════════════════════════
//
// Given a sample input row and a target shape, the mapping agent
// produces a Prism Config that transforms input → target.
//
// This is the canonical "package owns its agent, runs it on Cortex"
// pattern. Cortex is an optional peer dep: the rest of @niscorp/prism
// does not need it.
//
// Usage:
//
//   import { createSignal } from '@niscorp/signal';
//   import { mappingAgent } from '@niscorp/prism/agent';
//   import { evaluate } from '@niscorp/prism';
//
//   const llm = createSignal('groq', { apiKey }); // qwen/qwen3.8-27b, the registry default
//   const result = await mappingAgent.run({
//     sampleInput: { first: 'Ada', last: 'Lovelace' },
//     targetShape: { fullName: '' },
//   }, { llm }).result;
//
//   if (result.ok) {
//     // result.output.data is a fully-validated Prism Config;
//     // result.output.reasoning is the model's one-line why.
//     const output = evaluate(result.output.data, sampleInput);
//   }
//
// The Config schema itself is NOT embedded in this prompt — cortex
// injects it (output.doc 'auto' → schemaDoc(ConfigSchema)) because the
// recursive Node union can't ride the respond tool's params. One
// source of truth, zero hand-maintained schema prose.

import { z } from 'zod';
import { defineAgent, type AgentDefinition } from '@niscorp/cortex';

import { ConfigSchema, type Config } from '../schemas';
import { MAPPING_OPS } from '../schemas/profiles';
import { getProfileJsonSchema } from '../engine/documentation';

// ───────────────────────────────────────────────────────────
// Input schema
// ───────────────────────────────────────────────────────────

export const MappingAgentInputSchema = z.object({
  sampleInput: z
    .record(z.string(), z.unknown())
    .describe('A representative input row. The transformation will run against rows of this shape.'),
  targetShape: z
    .unknown()
    .describe(
      'A JSON example of the desired output shape. Field values are placeholders; the agent infers the structure from this example.',
    ),
  fieldDescriptions: z
    .record(z.string(), z.string())
    .optional()
    .describe('Optional human-readable descriptions for fields the agent might not infer correctly.'),
  notes: z
    .string()
    .optional()
    .describe('Free-form additional context (data quirks, semantics, etc.).'),
});

export type MappingAgentInput = z.infer<typeof MappingAgentInputSchema>;

// The agent's payload IS the Prism Config. The model's explanation
// rides the envelope's `reasoning` field — no wrapper schema.
export type MappingAgentOutput = Config;

// ───────────────────────────────────────────────────────────
// System prompt — role + worked example, nothing else
// ───────────────────────────────────────────────────────────
//
// Per niscorp/STYLE_GUIDE.md: every operation, constraint and gotcha
// lives in the Prism schema's .describe() calls, and the prompt carries
// the JSON Schema (OUTPUT_DOC below). If the model gets an op wrong,
// sharpen the relevant .describe() in @niscorp/prism — do not add prose here.

const INSTRUCTIONS = `You are the Prism mapping agent. Given a sample input row and a target output shape, produce a Prism Config that maps rows of the input shape into the target shape.

Your envelope's \`data\` is the Prism Config; \`reasoning\` is a one-sentence explanation of the mapping. The config must validate against the OUTPUT SCHEMA below (every constraint, format rule and example is in the schema's field descriptions).

Worked example (illustrative only — read the schema for op details):
INPUT  { "sampleInput": { "first": "Ada", "last": "Lovelace" }, "targetShape": { "fullName": "" } }
data   { "fullName": { "$interpolate": { "template": "{{f}} {{l}}", "values": { "f": { "$ref": "$.first" }, "l": { "$ref": "$.last" } } } } }`;

const OUTPUT_DOC = `OUTPUT SCHEMA — your output MUST validate against this JSON Schema:\n${JSON.stringify(getProfileJsonSchema(MAPPING_OPS, 'draft-7'))}`;

// ───────────────────────────────────────────────────────────
// Agent definition — the entire public surface
// ───────────────────────────────────────────────────────────

export const mappingAgent: AgentDefinition<Config> = defineAgent<Config>({
  id: 'prism.mapping',
  description: 'Generates a Prism transformation config from a sample input row and a target shape.',
  instructions: INSTRUCTIONS,
  // Validated against the FULL grammar — a config using any op is accepted,
  // exactly as before — but documented with the mapping profile: the ops a
  // mapping uses, about 28% less prompt than the whole grammar
  // (schemas/profiles.ts). The heading is cortex's own (context/schema-doc.ts),
  // so the finish protocol's "OUTPUT SCHEMA" still names it.
  output: { schema: ConfigSchema, doc: OUTPUT_DOC },
});
