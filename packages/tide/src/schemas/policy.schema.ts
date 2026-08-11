import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════
// Policy — the execution semantics, as authored data.
//
// Everything the requirements doc said "must not be hand-waved",
// declared per reflex rather than guessed by the engine.
// ═══════════════════════════════════════════════════════════════

export const RetrySchema = z
  .object({
    max: z.number().int().min(0).default(3).describe('Attempts after the first before the task parks `failed`.'),
    backoff: z.enum(['fixed', 'exponential']).default('exponential'),
    baseMs: z.number().int().positive().default(60_000),
  })
  .strict();

export const CoalesceSchema = z
  .object({
    windowMs: z.number().int().positive().describe('Fixed window, opened by the first matching fact.'),
    key: z.unknown().optional().describe('A transform config grouping facts into separate windows. Opaque to tide.'),
  })
  .strict();

export const PolicySchema = z
  .object({
    retry: RetrySchema.optional(),
    timeoutMs: z.number().int().positive().default(30_000),
    // May a firing start while the previous one is unsettled? The long
    // billing run still going at the next tick must not double-start.
    overlap: z.enum(['skip', 'allow']).default('skip'),
    catchUp: z.enum(['run', 'skip', 'latest']).default('run'),
    // How late is "missed"? Only `catchUp: 'skip'` reads it — 'run' fires
    // everything and 'latest' keeps the newest regardless of age.
    lateMs: z.number().int().positive().default(3_600_000),
    order: z.enum(['any', 'serial']).default('any'),
    coalesce: CoalesceSchema.optional(),
  })
  .strict();

export type Retry = z.infer<typeof RetrySchema>;
export type Coalesce = z.infer<typeof CoalesceSchema>;
export type Policy = z.infer<typeof PolicySchema>;

// Every field defaults, so the empty policy is a real, complete policy —
// which is what lets a reflex omit `policy` entirely and still be governed.
export const DEFAULT_POLICY: Policy = PolicySchema.parse({});
