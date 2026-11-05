import { MAX_NATIVE_TIMEOUT_MS } from './control.js';
import { z } from 'zod';
import { freezeOwned } from './json.js';
import profile from './default-profile.json' with { type: 'json' };
export const engineProfile = freezeOwned(profile);
const schema = z
  .record(z.string(), z.json())
  .describe('Object-form JSON Schema 2020-12 admitted by strict Ajv; no remote references.');
// Structural JSON boundary. Prism.compile owns expression grammar admission before effects.
const expression = z
  .json()
  .describe(
    'Prism mapping over data, input, steps, item, index and value; validated and compiled during artifact preparation.',
  );
const call = z
  .union([
    z
      .object({
        operation: z
          .string()
          .min(1)
          .describe('Name of a host-supplied operation. No implicit capabilities.'),
      })
      .strict(),
    z
      .object({
        flow: z.object({ id: z.string().min(1), revision: z.number().int().positive() }).strict(),
      })
      .strict(),
  ])
  .describe('Call one operation or one exact bundled flow revision.');
const step = z
  .object({
    id: z.string().min(1).describe('Unique step name within its flow; available under steps.'),
    when: expression
      .describe('Optional exact boolean, evaluated per invocation, including each item.')
      .optional(),
    each: z
      .object({
        items: expression.describe('Array to iterate in source order.'),
        onFailure: z
          .enum(['stop', 'record'])
          .describe('Stop the flow on an ordinary failure, or record item outcomes and continue.'),
      })
      .strict()
      .optional(),
    checks: z
      .array(
        z
          .object({
            id: z
              .union([z.string().min(1), z.record(z.string(), z.json())])
              .describe(
                'Failure name, either a literal string or a Prism object expression compiled during preparation and evaluated only on failure. Must return a nonempty string.',
              ),
            test: expression.describe(
              'Exact boolean over the raw call result in value, before output mapping.',
            ),
          })
          .strict(),
      )
      .optional(),
    output: expression
      .describe(
        'Prism mapping after success. Use $ref for root paths: raw result $.value, flow input $.input and prior results $.steps.<id>.value. $var is only a lexical binding created by as/let.',
      )
      .optional(),
  })
  .strict();
export const StepSchema = z.union([
  step.extend({ call, input: expression.describe('Prism mapping of the call input.') }),
  step.extend({
    value: expression.describe(
      'Pure calculation, without calling an operation or flow. Its outcome is available as $.steps.<id>.value.',
    ),
  }),
]);
export const FlowSchema = z
  .object({
    inputSchema: schema.describe('Accepted flow input.'),
    outputSchema: schema.describe('Required published flow output.'),
    steps: z
      .array(StepSchema)
      .describe('Ordered steps. Each outcome is available under steps by id.'),
    output: expression.describe(
      'Prism mapping of final output. Use $ref to read completed step results at $.steps.<id>.value, never $.<id>. Flow input remains at $.input. $var reads only a lexical binding name created by as/let; it cannot read a root path. Record-mode iterations may contain failed items.',
    ),
  })
  .strict();
export const ArtifactSchema = z
  .object({
    stamp: z
      .record(z.string(), z.number().int().nonnegative())
      .describe('Strata document grammar stamp.'),
    data: z
      .record(z.string(), z.json())
      .default({})
      .describe(
        'Literal artifact data shared by every flow as $.data. These values are never interpreted as expressions.',
      ),
    flow: FlowSchema.describe('Entry flow.'),
    flows: z
      .array(
        z
          .object({
            id: z.string().min(1).describe('Reusable flow name.'),
            revision: z
              .number()
              .int()
              .positive()
              .describe('Exact revision, unique together with id.'),
            flow: FlowSchema,
          })
          .strict(),
      )
      .default([])
      .describe('Bundled reusable flows; no storage lookup.'),
  })
  .strict();
export const LimitsSchema = z
  .object({
    maxSteps: z.number().int().positive().default(profile.maxSteps),
    maxItems: z.number().int().positive().default(profile.maxItems),
    maxDepth: z.number().int().positive().default(profile.maxDepth),
    maxJsonDepth: z.number().int().positive().default(profile.maxJsonDepth),
    maxActiveMs: z
      .number()
      .int()
      .positive()
      .max(MAX_NATIVE_TIMEOUT_MS)
      .default(profile.maxActiveMs),
    prism: z
      .object({
        maxSteps: z
          .number()
          .int()
          .positive()
          .max(Number.MAX_SAFE_INTEGER)
          .default(profile.prism.maxSteps),
        maxStringLength: z
          .number()
          .int()
          .positive()
          .max(Number.MAX_SAFE_INTEGER)
          .default(profile.prism.maxStringLength),
        maxValues: z
          .number()
          .int()
          .positive()
          .max(Number.MAX_SAFE_INTEGER)
          .default(profile.prism.maxValues),
      })
      .strict()
      .default({ ...profile.prism }),
  })
  .strict();
export type Artifact = z.infer<typeof ArtifactSchema>;
export type Flow = z.infer<typeof FlowSchema>;
export type Step = z.infer<typeof StepSchema>;
export type Limits = z.infer<typeof LimitsSchema>;
export type LimitsInput = z.input<typeof LimitsSchema>;
