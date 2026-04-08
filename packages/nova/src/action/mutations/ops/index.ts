import { z } from 'zod';
import { SetByValueSchema, SetByFromSchema, setValueOp, setFromOp } from './set';
import { ToggleSchema, toggleOp } from './toggle';
import { IncrementSchema, incrementOp } from './increment';
import { DecrementSchema, decrementOp } from './decrement';
import { PushSchema, pushOp } from './push';
import { PopSchema, popOp } from './pop';
import { RemoveAtSchema, removeAtOp } from './remove-at';
import { ClearSchema, clearOp } from './clear';
import { ResetSchema, resetOp } from './reset';

export const OPS = [
  setValueOp,
  setFromOp,
  toggleOp,
  incrementOp,
  decrementOp,
  pushOp,
  popOp,
  removeAtOp,
  clearOp,
  resetOp,
] as const;

export const MutationSchema = z
  .union([
    SetByValueSchema,
    SetByFromSchema,
    ToggleSchema,
    IncrementSchema,
    DecrementSchema,
    PushSchema,
    PopSchema,
    RemoveAtSchema,
    ClearSchema,
    ResetSchema,
  ])
  .describe('A single immutable mutation applied to the action data.');

export type Mutation = z.infer<typeof MutationSchema>;
