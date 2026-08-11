import { z } from 'zod';
import { OpSchema } from './trigger.schema';

// ═══════════════════════════════════════════════════════════════
// Fact — the public intake contract.
//
// Tide's whole ingestion surface. Anything that can produce this
// shape can drive tide; nothing else about the producer is tide's
// business. A host that sees its own writes pushes them; a host
// that doesn't, polls. Either way, what arrives is this.
// ═══════════════════════════════════════════════════════════════

export const FactKindSchema = z.enum(['write', 'signal', 'manual', 'firing']);

export const FactInputSchema = z
  .object({
    kind: FactKindSchema,

    // write facts
    entity: z.string().optional().describe('Which table or entity was written.'),
    op: OpSchema.optional().describe('Ops are distinct stimuli — "only on create" is op: "insert".'),
    row: z.record(z.string(), z.unknown()).optional().describe('The row, as the write returned it.'),

    // signal facts
    name: z.string().optional().describe('Which named intake this arrived on.'),
    payload: z.unknown().optional().describe('The event body — validated at the HOST boundary before it gets here.'),

    // firing facts (minted by tide when a firing settles)
    reflex: z.string().optional(),
    firingId: z.string().optional(),
    occurrence: z.string().optional().describe('The calendar key, when the clock was the cause.'),
    stats: z
      .object({ total: z.number().int(), done: z.number().int(), failed: z.number().int() })
      .strict()
      .optional(),

    // manual facts (minted by `fire`)
    target: z.string().optional().describe('The one reflex a manual fact is aimed at.'),
    by: z.string().optional().describe('Who fired it — recorded on the firing as manual:<who>.'),

    at: z.number().int().describe('Supplied by the caller. Tide reads no clocks.'),
    notBefore: z.number().int().optional().describe('A delayed fact — timers as data, visible and queryable.'),
    dedupeKey: z.string().optional().describe('Provider event ids. A repeat drops silently; it is not an error.'),
    cause: z.string().optional().describe('Set by tide when an effect emits — the causality chain.'),
  })
  .strict();

export type FactInput = z.infer<typeof FactInputSchema>;
export type FactKind = z.infer<typeof FactKindSchema>;
