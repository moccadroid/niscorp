import { z } from 'zod';
import { deletePath, getPath, setPath } from '@shared/bindings/paths';
import { isArray, isObject } from '@shared/common';
import { MutationError } from '@shared/errors';
import type { MutationOp } from '../types';

export const ClearSchema = z
  .object({
    clear: z.string().describe('Array or object data path to clear.'),
  })
  .strict()
  .describe('Clear an array or object field.');

export type ClearMutation = z.infer<typeof ClearSchema>;

export const clearOp: MutationOp<ClearMutation> = {
  key: 'clear',
  schema: ClearSchema,
  apply: (data, mutation, ctx) => {
    const current = getPath(data, mutation.clear);
    if (isArray(current)) {
      const next = setPath(data, mutation.clear, []);
      return isObject(next) ? next : data;
    }
    if (isObject(current)) {
      const next = setPath(data, mutation.clear, {});
      return isObject(next) ? next : data;
    }
    if (ctx.strict) {
      throw new MutationError(
        `clear: path "${mutation.clear}" ${current === undefined ? 'does not exist' : 'is not an array or object'}`,
        {
          op: 'clear',
          path: mutation.clear,
          reason: current === undefined ? 'missing' : 'wrong-type',
        },
      );
    }
    const next = deletePath(data, mutation.clear);
    return isObject(next) ? next : data;
  },
};
