import { z } from 'zod';
import { getPath, setPath } from '@shared/bindings/paths';
import { isObject } from '@shared/common';
import type { MutationOp } from '../types';

export const ResetSchema = z
  .object({
    reset: z.string().describe('Data path to reset to its initial (definition.data) value.'),
  })
  .strict()
  .describe('Reset a field to its initial value from the action definition.');

export type ResetMutation = z.infer<typeof ResetSchema>;

export const resetOp: MutationOp<ResetMutation> = {
  key: 'reset',
  schema: ResetSchema,
  apply: (data, mutation, ctx) => {
    const initialValue = getPath(ctx.initial, mutation.reset);
    const next = setPath(data, mutation.reset, initialValue);
    return isObject(next) ? next : data;
  },
};
