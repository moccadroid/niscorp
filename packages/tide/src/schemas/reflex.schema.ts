import { z } from 'zod';
import { TriggerSchema } from './trigger.schema';
import { DEFAULT_POLICY, PolicySchema } from './policy.schema';

// ═══════════════════════════════════════════════════════════════
// Reflex — the artifact.
//
// A trigger, an optional selection, exactly one effect, a policy.
// A straight arc from stimulus to response with no deliberation
// between: there is no step language here, and a multi-step flow
// is a CHAIN of reflexes joined by committed rows.
//
// `select.query` and every template are `unknown` ON PURPOSE. The
// moment tide validates a query it owns a query language; the
// moment it evaluates an expression it owns an evaluator. Both
// exist in the stack already, behind seams. Tide stores, diffs and
// hashes these blobs, and hands them over verbatim.
// ═══════════════════════════════════════════════════════════════

export const SelectionSchema = z
  .object({
    query: z.unknown().describe('Handed to the `select` seam verbatim. Under moss: a vex { fingerprint, context } replay.'),
    mode: z
      .enum(['each', 'batch'])
      .default('each')
      .describe('each → one task per row; batch → one task carrying all rows (bounded sets only).'),
    unitKey: z.string().optional().describe('The row field keying a unit task. `each` mode only; duplicates fail the firing.'),
  })
  .strict();

export const EffectRefSchema = z
  .object({
    name: z.string().describe('A registered effect. The reflex names it; the registry supplies the handler.'),
    input: z.unknown().optional().describe('A template, evaluated per unit by the `transform` seam.'),
  })
  .strict();

export const ReflexSchema = z
  .object({
    id: z.string().min(1).describe('Unique. A tenant\'s reflex is the tenant\'s own row, with its own id.'),
    intent: z.string().min(1).describe('One factual sentence — what this does, in the operator\'s language.'),
    on: TriggerSchema,
    as: z.string().optional().describe('The identity this runs under. Opaque to tide; the host resolves it.'),
    params: z.record(z.string(), z.unknown()).optional().describe('Authored knobs, visible to templates as $.params.'),
    select: SelectionSchema.optional().describe('Omitted = the trigger itself is the unit.'),
    when: z.unknown().optional().describe('A predicate template. FACT triggers only — a query belongs in `select`.'),
    effect: EffectRefSchema,
    policy: PolicySchema.default(DEFAULT_POLICY),
    enabled: z.boolean().default(true).describe('A switch on the row, not part of the definition — flipping it is not an edit.'),
  })
  .strict()
  .superRefine((reflex, ctx) => {
    if (reflex.when !== undefined && !('fact' in reflex.on))
      ctx.addIssue({ code: 'custom', message: '`when` is for fact triggers; a clock condition belongs in `select`', path: ['when'] });
    if (reflex.policy.coalesce !== undefined && !('fact' in reflex.on))
      ctx.addIssue({ code: 'custom', message: 'coalesce holds FACTS — it is meaningless on a clock or poll trigger', path: ['policy', 'coalesce'] });
    if (reflex.select?.mode === 'each' && reflex.select.unitKey === undefined)
      ctx.addIssue({ code: 'custom', message: "`each` mode needs a unitKey — it is the task's idempotency grain", path: ['select', 'unitKey'] });
    if ('poll' in reflex.on && reflex.select === undefined)
      ctx.addIssue({ code: 'custom', message: 'a poll trigger needs a `select` — it is what gets polled', path: ['select'] });
  });

export type Selection = z.infer<typeof SelectionSchema>;
export type EffectRef = z.infer<typeof EffectRefSchema>;
export type Reflex = z.infer<typeof ReflexSchema>;
export type ReflexInput = z.input<typeof ReflexSchema>;
