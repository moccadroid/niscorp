import { z } from 'zod';
import { getPath, setPath } from '@shared/bindings/paths';
import { isObject } from '@shared/common';
import type { MutationOp } from '../types';

export const IncrementSchema = z
  .object({
    increment: z.string().describe('Numeric data path to increment.'),
    by: z.number().optional().describe('Amount to increment by; defaults to 1.'),
  })
  .strict()
  .describe('Increment a numeric field.');

export type IncrementMutation = z.infer<typeof IncrementSchema>;

export const incrementOp: MutationOp<IncrementMutation> = {
  key: 'increment',
  schema: IncrementSchema,
  apply: (data, mutation) => {
    const current = getPath(data, mutation.increment);
    const base = typeof current === 'number' ? current : 0;
    const by = mutation.by ?? 1;
    const next = setPath(data, mutation.increment, base + by);
    return isObject(next) ? next : data;
  },
};
