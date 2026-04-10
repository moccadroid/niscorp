// ═══════════════════════════════════════════════════════════
// @niscorp/prism/agent — Prism mapping agent
// ═══════════════════════════════════════════════════════════
//
// Given a sample input row and a target shape, the mapping agent
// produces a Prism Config that transforms input → target.
//
// This is the canonical "package owns its agent, runs it on Cortex"
// pattern from Cortex DESIGN.md §4.3 / §7. Cortex is an optional peer
// dep: the rest of @niscorp/prism does not need it.
//
// Usage:
//
//   import { createSignal } from '@niscorp/signal';
//   import { runAgentStandalone } from '@niscorp/cortex';
//   import { mappingAgent } from '@niscorp/prism/agent';
//   import { evaluate } from '@niscorp/prism';
//
//   const llm = createSignal('groq', { apiKey, model: 'openai/gpt-oss-120b' });
//   const result = await runAgentStandalone(mappingAgent, {
//     sampleInput: { first: 'Ada', last: 'Lovelace' },
//     targetShape: { fullName: '' },
//   }, { llm });
//
//   if (result.ok) {
//     // result.data.config is a fully-validated Prism Config.
//     // Cortex enforced the schema end-to-end and auto-retried on failures.
//     const output = evaluate(result.data.config, sampleInput);
//   }
//
// That is the entire surface of this module. There is intentionally
// NO `runMappingAgent` wrapper — Cortex's structured-output mode plus
// the schema below is sufficient. If you need extra validation (e.g.
// test-evaluating the config before returning), do it at the call
// site, not here.

import { z } from 'zod';
import { defineAgent, type AgentDefinition } from '@niscorp/cortex';

import { ConfigSchema } from '../schemas/config.schema';
import { getConfigJsonSchema } from '../engine/documentation';

// ───────────────────────────────────────────────────────────
// Input / output schemas
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

// The agent returns a Prism Config wrapped with a tiny envelope so
// the LLM can also explain its reasoning.
//
// IMPORTANT: `config` is `ConfigSchema` directly, NOT `z.unknown()`.
// This is the whole point — Cortex's structured-output mode validates
// the entire envelope (including the deep ConfigSchema) end-to-end,
// so a model that produces an invalid Prism node fails inside Cortex
// and triggers the auto-retry-with-feedback loop without any extra
// code in this module.
export const MappingAgentOutputSchema = z.object({
  config: ConfigSchema.describe('The Prism Config (a Node) that maps input rows to the target shape.'),
  reasoning: z.string().optional().describe('Brief explanation of the mapping decisions.'),
});

export type MappingAgentOutput = z.infer<typeof MappingAgentOutputSchema>;

// ───────────────────────────────────────────────────────────
// System prompt
// ───────────────────────────────────────────────────────────
//
// Per niscorp/STYLE_GUIDE.md §"Schemas are the single source of
// truth for LLM agents": this prompt is intentionally minimal. It
// states the agent's role, the output envelope, and one short worked
// example. Everything else — every operation, every constraint, every
// gotcha — comes from the Prism Node JSON Schema injected below.
//
// If the model gets a Prism op wrong, the fix is to add or sharpen
// a `.describe()` call on the relevant Zod field in @niscorp/prism,
// NOT to add prose to this prompt.

const buildSystemPrompt = (): string => {
  // Minified on purpose: this string ships in every system prompt the
  // agent ever sends. Pretty-printing roughly doubles its token count
  // for zero benefit — the model parses minified JSON exactly as well.
  // See niscorp/STYLE_GUIDE.md §"Never pretty-print JSON inside prompts".
  const prismSchema = JSON.stringify(getConfigJsonSchema('draft-7'));
  return `You are the Prism mapping agent. Given a sample input row and a target output shape, produce a Prism Config that maps rows of the input shape into the target shape.

Output exactly one JSON object with two fields:
  - "config":    a Prism Config (a Prism Node) — see the schema below
  - "reasoning": a one-sentence explanation of the mapping

No markdown fences. No prose outside the JSON. The config field must validate against the Prism Node schema (every constraint, every format rule, and every example is described in the schema's field descriptions).

Worked example (illustrative only — read the schema for op details):
INPUT  { "sampleInput": { "first": "Ada", "last": "Lovelace" }, "targetShape": { "fullName": "" } }
OUTPUT
{
  "config": { "fullName": { "$interpolate": { "template": "{{f}} {{l}}", "values": { "f": { "$ref": "$.first" }, "l": { "$ref": "$.last" } } } } },
  "reasoning": "Joined first and last via $interpolate."
}

═══ Prism Node JSON Schema (the single source of truth) ═══
${prismSchema}`;
};

const SYSTEM_PROMPT = buildSystemPrompt();

// ───────────────────────────────────────────────────────────
// Agent definition — the entire public surface
// ───────────────────────────────────────────────────────────

export const mappingAgent: AgentDefinition<MappingAgentOutput> = defineAgent<MappingAgentOutput>({
  id: 'prism.mapping',
  name: 'Prism Mapping Agent',
  description: 'Generates a Prism transformation config from a sample input row and a target shape.',
  instructions: SYSTEM_PROMPT,
  outputMode: 'structured',
  outputSchema: MappingAgentOutputSchema,
});
