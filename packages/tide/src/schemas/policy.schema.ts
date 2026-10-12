import { z } from 'zod';

export const RetrySchema = z
  .object({
    max: z.number().int().min(0).default(3).describe('Attempts after the first before the task parks `failed`.'),
    backoff: z.enum(['fixed', 'exponential']).default('exponential'),
    baseMs: z.number().int().positive().default(60_000),
  })
  .strict();

export const PolicySchema = z
  .object({
    retry: RetrySchema.optional(),
    timeoutMs: z.number().int().positive().default(30_000),
    overlap: z.enum(['skip', 'allow']).default('skip'),
    catchUp: z.enum(['run', 'skip', 'latest']).default('run'),
    // Read by `catchUp: 'skip'` only. What `catchUp` opens still passes
    // `overlap`: occurrences missed together are repeats of one another, so
    // under `overlap: 'skip'` the oldest runs and the rest are skipped.
    lateMs: z.number().int().positive().default(3_600_000),
    order: z.enum(['any', 'serial']).default('any'),
  })
  .strict();

export type Retry = z.infer<typeof RetrySchema>;
export type Policy = z.infer<typeof PolicySchema>;

export const DEFAULT_POLICY: Policy = PolicySchema.parse({});
