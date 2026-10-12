import { z } from 'zod';
import { OpSchema } from './trigger.schema';

export const FactKindSchema = z.enum(['write', 'signal', 'manual', 'run']);

export const FactInputSchema = z
  .object({
    kind: FactKindSchema,

    entity: z.string().optional().describe('Which table or entity was written.'),
    op: OpSchema.optional().describe('Ops are distinct stimuli — "only on create" is op: "insert".'),
    row: z.record(z.string(), z.unknown()).optional().describe('The row, as the write returned it.'),

    name: z.string().optional().describe('Which named intake this arrived on.'),
    payload: z.unknown().optional().describe('The event body — validated at the HOST boundary before it gets here.'),

    reflex: z.string().optional(),
    runId: z.string().optional(),
    occurrence: z.string().optional().describe('The calendar key, when the clock was the cause.'),
    stats: z
      .object({ total: z.number().int(), done: z.number().int(), failed: z.number().int() })
      .strict()
      .optional(),

    target: z.string().optional().describe('The one reflex a manual fact is aimed at.'),
    by: z.string().optional().describe('Who fired it — recorded on the firing as manual:<who>.'),

    at: z.number().int().describe('Supplied by the caller. Tide reads no clocks.'),
    notBefore: z.number().int().optional().describe('A delayed fact — timers as data, visible and queryable.'),
    dedupeKey: z.string().optional().describe('Provider event ids. A repeat is refused and announced as fact.deduped; it is not an error.'),
    cause: z.string().optional().describe('Set by tide when an effect emits — the causality chain.'),
  })
  .strict()
  .superRefine((fact, ctx) => {
    const require = (field: keyof typeof fact, why: string) => {
      if (fact[field] === undefined)
        ctx.addIssue({ code: 'custom', message: `a ${fact.kind} fact needs \`${String(field)}\` — ${why}`, path: [field] });
    };
    const refuse = (field: keyof typeof fact) => {
      if (fact[field] !== undefined)
        ctx.addIssue({ code: 'custom', message: `\`${String(field)}\` is not part of a ${fact.kind} fact`, path: [field] });
    };

    if (fact.kind === 'write') {
      require('entity', 'it is what a write trigger matches on');
      refuse('name');
      refuse('target');
      refuse('runId');
    }
    if (fact.kind === 'signal') {
      require('name', 'it is which named intake this arrived on');
      refuse('entity');
      refuse('op');
      refuse('target');
      refuse('runId');
    }
    if (fact.kind === 'manual') {
      require('target', 'a manual fact is aimed at exactly one reflex');
      refuse('entity');
      refuse('name');
      refuse('runId');
    }
    if (fact.kind === 'run') {
      require('reflex', 'it is whose run settled');
      require('runId', 'it is which run settled');
      refuse('entity');
      refuse('name');
      refuse('target');
    }
  });

export type FactInput = z.infer<typeof FactInputSchema>;
export type FactKind = z.infer<typeof FactKindSchema>;
