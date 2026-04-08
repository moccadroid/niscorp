import { z } from 'zod';
import { deletePath, getPath, setPath } from '@shared/bindings/paths';
import { isArray, isObject } from '@shared/common';
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
  apply: (data, mutation) => {
    const current = getPath(data, mutation.clear);
    if (isArray(current)) {
      const next = setPath(data, mutation.clear, []);
      return isObject(next) ? next : data;
    }
    if (isObject(current)) {
      const next = setPath(data, mutation.clear, {});
      return isObject(next) ? next : data;
    }
    const next = deletePath(data, mutation.clear);
    return isObject(next) ? next : data;
  },
};
