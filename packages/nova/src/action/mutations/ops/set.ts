import { z } from 'zod';
import { getPath, setPath } from '@shared/bindings/paths';
import { hasKey, isObject } from '@shared/common';
import type { MutationOp } from '../types';

export const SetByValueSchema = z
  .object({
    set: z.string().describe('Data path to write to, e.g. "user.name" or "items.0.title".'),
    value: z.unknown().describe('Literal value to write at the path.'),
  })
  .strict()
  .describe('Set a field at a path to a literal value.');

export type SetByValueMutation = z.infer<typeof SetByValueSchema>;

export const SetByFromSchema = z
  .object({
    set: z.string().describe('Data path to write to.'),
    from: z.string().describe('Data path (or template path) to read the value from.'),
  })
  .strict()
  .describe('Set a field at a path by copying from another path.');

export type SetByFromMutation = z.infer<typeof SetByFromSchema>;

export const setValueOp: MutationOp<SetByValueMutation> = {
  key: 'set',
  schema: SetByValueSchema,
  match: (mutation) => hasKey(mutation, 'set') && hasKey(mutation, 'value'),
  apply: (data, mutation) => {
    const next = setPath(data, mutation.set, mutation.value);
    return isObject(next) ? next : data;
  },
};

export const setFromOp: MutationOp<SetByFromMutation> = {
  key: 'set',
  schema: SetByFromSchema,
  match: (mutation) => hasKey(mutation, 'set') && hasKey(mutation, 'from'),
  apply: (data, mutation) => {
    const value = getPath(data, mutation.from);
    const next = setPath(data, mutation.set, value);
    return isObject(next) ? next : data;
  },
};
