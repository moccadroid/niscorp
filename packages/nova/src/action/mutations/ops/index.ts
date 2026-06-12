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

// The single source of truth for mutation operations. The validation schema,
// the `Mutation` type, and the runtime dispatch table (see registry.ts) are
// all derived from this one list — adding an op is a one-line change here.
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

// Precise mutation type, distributed from each op's own mutation shape.
type MutationOf<O> = O extends MutationOp<infer T> ? T : never;
export type Mutation = MutationOf<(typeof OPS)[number]>;

// Runtime validator, derived from the ops: a mutation is any one of their
// schemas. The cast widens each op's schema to `z.ZodType<Mutation>` (sound —
// every op's mutation is a Mutation) so the union's output type is `Mutation`.
export const MutationSchema = z
  .union(
    OPS.map((op) => op.schema) as [z.ZodType<Mutation>, z.ZodType<Mutation>, ...z.ZodType<Mutation>[]],
  )
  .describe('A single immutable mutation applied to the action data.');
