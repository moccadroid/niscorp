import { hasKey, isObject } from '@shared/common';
import { OPS, type Mutation } from './ops';
import type { MutationContext, MutationData, MutationOp } from './types';

// ═══════════════════════════════════════════════════════════
// Pure dispatch over the op list. Each op is generic over its own
// mutation shape; `toDispatchOp` collapses that into a uniform handler
// that runs the op's own schema parse before apply. The single `any` is
// the deliberate type-erasure boundary where the heterogeneous ops meet
// one dispatch table — each op's schema/apply stay type-checked at their
// definition. The table is derived from OPS, so it can't drift from it.
// ═══════════════════════════════════════════════════════════

type DispatchOp = {
  key: string;
  match: (mutation: Record<string, unknown>) => boolean;
  run: (data: MutationData, mutation: Record<string, unknown>, ctx: MutationContext) => MutationData;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- erasure boundary
const toDispatchOp = (op: MutationOp<any>): DispatchOp => ({
  key: op.key,
  match: op.match ?? ((mutation) => hasKey(mutation, op.key)),
  run: (data, mutation, ctx) => op.apply(data, op.schema.parse(mutation), ctx),
});

const DISPATCH: readonly DispatchOp[] = OPS.map(toDispatchOp);

const findOp = (mutation: Record<string, unknown>): DispatchOp | undefined => {
  for (const op of DISPATCH) {
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
