import { z } from 'zod';
import { getPath, setPath } from '@shared/bindings/paths';
import { isArray, isObject } from '@shared/common';
import { MutationError } from '@shared/errors';
import type { MutationOp } from '../types';

export const MoveSchema = z
  .object({
    move: z.string().describe('Array data path to reorder within.'),
    from: z
      .union([z.number().int(), z.string()])
      .describe('Index to move. A string is a template (e.g. "{{@event.payload}}") resolved before applying.'),
    to: z
      .union([z.number().int(), z.string()])
      .describe('Destination index. A string is a template resolved before applying.'),
  })
  .strict()
  .describe('Move an array element from one index to another.');

export type MoveMutation = z.infer<typeof MoveSchema>;

export const moveOp: MutationOp<MoveMutation> = {
  key: 'move',
  schema: MoveSchema,
  apply: (data, mutation, ctx) => {
    const current = getPath(data, mutation.move);
    if (!isArray(current)) {
      if (ctx.strict) {
        throw new MutationError(
          `move: path "${mutation.move}" ${current === undefined ? 'does not exist' : 'is not an array'}`,
          {
            op: 'move',
            path: mutation.move,
            reason: current === undefined ? 'missing' : 'wrong-type',
          },
        );
      }
      return data;
    }
    // from/to may be literal numbers or resolved templates; coerce and guard.
    const from = Number(mutation.from);
    const to = Number(mutation.to);
    if (!Number.isInteger(from) || !Number.isInteger(to)) return data;
    if (from < 0 || from >= current.length) return data;
    const arr = current.slice();
    const [item] = arr.splice(from, 1);
    arr.splice(Math.max(0, Math.min(to, arr.length)), 0, item);
    const next = setPath(data, mutation.move, arr);
    return isObject(next) ? next : data;
  },
};
