import { z } from 'zod';
import { setValueOp, setFromOp } from './set';
import { toggleOp } from './toggle';
import { incrementOp } from './increment';
import { decrementOp } from './decrement';
import { pushOp } from './push';
import { popOp } from './pop';
import { removeAtOp } from './remove-at';
import { moveOp } from './move';
import { clearOp } from './clear';
import { resetOp } from './reset';
import type { MutationOp } from '../types';

export const OPS = [
  setValueOp,
  setFromOp,
  toggleOp,
  incrementOp,
  decrementOp,
  pushOp,
  popOp,
  removeAtOp,
  moveOp,
  clearOp,
  resetOp,
] as const;

type MutationOf<O> = O extends MutationOp<infer T> ? T : never;
export type Mutation = MutationOf<(typeof OPS)[number]>;

export const MutationSchema = z
  .union(
    OPS.map((op) => op.schema) as [z.ZodType<Mutation>, z.ZodType<Mutation>, ...z.ZodType<Mutation>[]],
  )
  .describe('A single immutable mutation applied to the action data.');
