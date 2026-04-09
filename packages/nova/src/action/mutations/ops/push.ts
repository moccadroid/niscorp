import { z } from 'zod';
import { getPath, setPath } from '@shared/bindings/paths';
import { isArray, isObject } from '@shared/common';
import { MutationError } from '@shared/errors';
import type { MutationOp } from '../types';

export const PushSchema = z
  .object({
    push: z.string().describe('Array data path to append to.'),
    value: z.unknown().optional().describe('Value to append.'),
  })
  .strict()
  .describe('Append a value to an array field.');

export type PushMutation = z.infer<typeof PushSchema>;

export const pushOp: MutationOp<PushMutation> = {
  key: 'push',
  schema: PushSchema,
  // Guard against the PushEffect navigation effect whose `push` is an object.
  match: (mutation) => typeof mutation.push === 'string',
  apply: (data, mutation, ctx) => {
    const current = getPath(data, mutation.push);
    // push tolerates missing paths by creating a new array (lax mode only).
    if (current !== undefined && !isArray(current)) {
      if (ctx.strict) {
        throw new MutationError(
          `push: path "${mutation.push}" is not an array`,
          { op: 'push', path: mutation.push, reason: 'wrong-type' },
        );
      }
      return data;
    }
    if (current === undefined && ctx.strict) {
      throw new MutationError(
        `push: path "${mutation.push}" does not exist`,
        { op: 'push', path: mutation.push, reason: 'missing' },
      );
    }
    const arr = isArray(current) ? current.slice() : [];
    arr.push(mutation.value);
    const next = setPath(data, mutation.push, arr);
    return isObject(next) ? next : data;
  },
};
