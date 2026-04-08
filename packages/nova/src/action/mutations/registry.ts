import { hasKey, isObject } from '@shared/common';
import type { Mutation } from './ops';
import { setValueOp, setFromOp } from './ops/set';
import { toggleOp } from './ops/toggle';
import { incrementOp } from './ops/increment';
import { decrementOp } from './ops/decrement';
import { pushOp } from './ops/push';
import { popOp } from './ops/pop';
import { removeAtOp } from './ops/remove-at';
import { clearOp } from './ops/clear';
import { resetOp } from './ops/reset';
import type { MutationData, MutationOp } from './types';

// ═══════════════════════════════════════════════════════════
// Pure dispatch over the op registry. Each op's `apply` is
// typed for its own mutation shape; we erase that T here via a
// per-op wrapper that runs the op's own schema parse, so no
// cast is required.
// ═══════════════════════════════════════════════════════════

type ErasedOp = {
  key: string;
  match: (mutation: Record<string, unknown>) => boolean;
  run: (data: MutationData, mutation: Record<string, unknown>, initial: MutationData) => MutationData;
};

const erase = <T>(op: MutationOp<T>): ErasedOp => ({
  key: op.key,
  match: op.match ?? ((mutation) => hasKey(mutation, op.key)),
  run: (data, mutation, initial) => {
    const parsed = op.schema.parse(mutation);
    return op.apply(data, parsed, { initial });
  },
});

const ERASED: readonly ErasedOp[] = [
  erase(setValueOp),
  erase(setFromOp),
  erase(toggleOp),
  erase(incrementOp),
  erase(decrementOp),
  erase(pushOp),
  erase(popOp),
  erase(removeAtOp),
  erase(clearOp),
  erase(resetOp),
];

const findOp = (mutation: Record<string, unknown>): ErasedOp | undefined => {
  for (const op of ERASED) {
    if (op.match(mutation)) return op;
  }
  return undefined;
};

export const applyMutation = (
  data: MutationData,
  mutation: Mutation,
  initial: MutationData = {},
): MutationData => {
  if (!isObject(mutation)) return data;
  const op = findOp(mutation);
  if (op === undefined) return data;
  return op.run(data, mutation, initial);
};

export const applyMutations = (
  data: MutationData,
  mutations: readonly Mutation[],
  initial: MutationData = {},
): MutationData => {
  let current = data;
  for (const mutation of mutations) {
    current = applyMutation(current, mutation, initial);
  }
  return current;
};
