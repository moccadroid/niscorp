import { z } from 'zod';
import { getPath, setPath } from '@shared/bindings/paths';
import { isObject } from '@shared/common';
import type { MutationOp } from '../types';

export const ToggleSchema = z
  .object({
    toggle: z.string().describe('Boolean data path to flip.'),
  })
  .strict()
  .describe('Flip a boolean at the given path.');

export type ToggleMutation = z.infer<typeof ToggleSchema>;

export const toggleOp: MutationOp<ToggleMutation> = {
  key: 'toggle',
  schema: ToggleSchema,
  apply: (data, mutation) => {
    const current = getPath(data, mutation.toggle);
    const flipped = !(current === true);
    const next = setPath(data, mutation.toggle, flipped);
    return isObject(next) ? next : data;
  },
};
