import { z } from 'zod';
import { getPath, setPath } from '@shared/bindings/paths';
import { isArray, isObject } from '@shared/common';
import { MutationError } from '@shared/errors';
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
  apply: (data, mutation, ctx) => {
    const current = getPath(data, mutation.pop);
    if (!isArray(current)) {
      if (ctx.strict) {
        throw new MutationError(
          `pop: path "${mutation.pop}" ${current === undefined ? 'does not exist' : 'is not an array'}`,
          { op: 'pop', path: mutation.pop, reason: current === undefined ? 'missing' : 'wrong-type' },
        );
      }
      return data;
    }
    const arr = current.slice();
    arr.pop();
    const next = setPath(data, mutation.pop, arr);
    return isObject(next) ? next : data;
  },
};
