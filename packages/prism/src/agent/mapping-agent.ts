import { z } from 'zod';
import { defineAgent, type AgentDefinition } from '@niscorp/cortex';

import { ConfigSchema, type Config } from '../schemas';
import { MAPPING_OPS } from '../schemas/profiles';
import { getProfileJsonSchema } from '../engine/documentation';

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

export type MappingAgentOutput = Config;

const INSTRUCTIONS = `You are the Prism mapping agent. Given a sample input row and a target output shape, produce a Prism Config that maps rows of the input shape into the target shape.

Your envelope's \`data\` is the Prism Config; \`reasoning\` is a one-sentence explanation of the mapping. The config must validate against the OUTPUT SCHEMA below (every constraint, format rule and example is in the schema's field descriptions).

Worked example (illustrative only — read the schema for op details):
INPUT  { "sampleInput": { "first": "Ada", "last": "Lovelace" }, "targetShape": { "fullName": "" } }
data   { "fullName": { "$interpolate": { "template": "{{f}} {{l}}", "values": { "f": { "$ref": "$.first" }, "l": { "$ref": "$.last" } } } } }`;

const OUTPUT_DOC = `OUTPUT SCHEMA — your output MUST validate against this JSON Schema:\n${JSON.stringify(getProfileJsonSchema(MAPPING_OPS, 'draft-7'))}`;

export const mappingAgent: AgentDefinition<Config> = defineAgent<Config>({
  id: 'prism.mapping',
  description: 'Generates a Prism transformation config from a sample input row and a target shape.',
  instructions: INSTRUCTIONS,
  // Validated against the full grammar, documented with the mapping profile:
  // a config using an op outside the profile is still accepted. The doc keeps
  // cortex's own heading, "OUTPUT SCHEMA", which its finish protocol names.
  output: { schema: ConfigSchema, doc: OUTPUT_DOC },
});
