import { z } from 'zod';
import { getPath, setPath } from '@shared/bindings/paths';
import { isArray, isObject } from '@shared/common';
import type { MutationOp } from '../types';

export const PopSchema = z
  .object({
    pop: z.string().describe('Array data path to remove the last element from.'),
  })
  .strict()
  .describe('Remove the last element from an array field.');

export type PopMutation = z.infer<typeof PopSchema>;

export const popOp: MutationOp<PopMutation> = {
  key: 'pop',
  schema: PopSchema,
  // Guard against the PopEffect whose `pop` is the literal `true`.
  match: (mutation) => typeof mutation.pop === 'string',
  apply: (data, mutation) => {
    const current = getPath(data, mutation.pop);
    if (!isArray(current)) return data;
    const arr = current.slice();
    arr.pop();
    const next = setPath(data, mutation.pop, arr);
    return isObject(next) ? next : data;
  },
};
