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
import type { MutationContext, MutationData, MutationOp } from './types';

// ═══════════════════════════════════════════════════════════
// Pure dispatch over the op registry. Each op's `apply` is
// typed for its own mutation shape; we erase that T here via a
// per-op wrapper that runs the op's own schema parse, so no
// cast is required.
// ═══════════════════════════════════════════════════════════

type ErasedOp = {
  key: string;
  match: (mutation: Record<string, unknown>) => boolean;
  run: (data: MutationData, mutation: Record<string, unknown>, ctx: MutationContext) => MutationData;
};

const erase = <T>(op: MutationOp<T>): ErasedOp => ({
  key: op.key,
  match: op.match ?? ((mutation) => hasKey(mutation, op.key)),
  run: (data, mutation, ctx) => {
    const parsed = op.schema.parse(mutation);
    return op.apply(data, parsed, ctx);
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

export type ApplyMutationOptions = {
  /** Snapshot used by `reset`. Must be deep-cloned by the caller. */
  initial?: MutationData;
  /** Strict mode — array ops throw MutationError on missing/wrong-type paths. */
  strict?: boolean;
};

const buildCtx = (opts: ApplyMutationOptions): MutationContext => ({
  initial: opts.initial ?? {},
  strict: opts.strict ?? false,
});

export const applyMutation = (
  data: MutationData,
  mutation: Mutation,
  opts: ApplyMutationOptions = {},
): MutationData => {
  if (!isObject(mutation)) return data;
  const op = findOp(mutation);
  if (op === undefined) return data;
  return op.run(data, mutation, buildCtx(opts));
};

export const applyMutations = (
  data: MutationData,
  mutations: readonly Mutation[],
  opts: ApplyMutationOptions = {},
): MutationData => {
  if (mutations.length === 0) return data;
  const ctx = buildCtx(opts);
  let current = data;
  for (const mutation of mutations) {
    if (!isObject(mutation)) continue;
    const op = findOp(mutation);
    if (op === undefined) continue;
    current = op.run(current, mutation, ctx);
  }
  return current;
};
