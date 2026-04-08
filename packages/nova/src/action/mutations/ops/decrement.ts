import { z } from 'zod';
import { getPath, setPath } from '@shared/bindings/paths';
import { isObject } from '@shared/common';
import type { MutationOp } from '../types';

export const DecrementSchema = z
  .object({
    decrement: z.string().describe('Numeric data path to decrement.'),
    by: z.number().optional().describe('Amount to decrement by; defaults to 1.'),
  })
  .strict()
  .describe('Decrement a numeric field.');

export type DecrementMutation = z.infer<typeof DecrementSchema>;

export const decrementOp: MutationOp<DecrementMutation> = {
  key: 'decrement',
  schema: DecrementSchema,
  apply: (data, mutation) => {
    const current = getPath(data, mutation.decrement);
    const base = typeof current === 'number' ? current : 0;
    const by = mutation.by ?? 1;
    const next = setPath(data, mutation.decrement, base - by);
    return isObject(next) ? next : data;
  },
};
