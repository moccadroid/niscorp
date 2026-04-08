import { z } from 'zod';
import { getPath, setPath } from '@shared/bindings/paths';
import { isArray, isObject } from '@shared/common';
import type { MutationOp } from '../types';

export const RemoveAtSchema = z
  .object({
    removeAt: z.string().describe('Array data path to remove an element from.'),
    index: z.number().int().describe('Index to remove.'),
  })
  .strict()
  .describe('Remove an element at a specific index of an array field.');

export type RemoveAtMutation = z.infer<typeof RemoveAtSchema>;

export const removeAtOp: MutationOp<RemoveAtMutation> = {
  key: 'removeAt',
  schema: RemoveAtSchema,
  apply: (data, mutation) => {
    const current = getPath(data, mutation.removeAt);
    if (!isArray(current)) return data;
    const arr = current.slice();
    arr.splice(mutation.index, 1);
    const next = setPath(data, mutation.removeAt, arr);
    return isObject(next) ? next : data;
  },
};
