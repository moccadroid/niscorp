import { explainIssues } from '../utils/issues';
import type { JsonValue, JsonObject, EvalContext, EvaluateFn, Result } from '../types';
import type { Config } from '../schemas/config.schema';
import { ConfigSchema } from '../schemas/config.schema';
import { OPTIONAL_FIELDS_KEY } from '../schemas/node.schema';
import { PrismError, ErrorCode } from '../errors';
import { depthRefusal, exceedsDepth } from '@niscorp/strata';
import { desugar } from '../sugar/desugar';
import { createBudget, measure, measureString, spendStep, type Limits } from './budget';
import { optimize } from './optimize';

// ─────────────────────────────────────────────────────────
// Guards (local imports to avoid barrel cycles)
// ─────────────────────────────────────────────────────────

import {
  isRefNode, isConstNode, isVarNode, isGetNode, isWithNode,
  isMapNode, isFilterNode, isReduceNode, isSliceNode, isFlattenNode, isUniqueNode, isSortByNode,
  isAddNode, isSubNode, isMulNode, isDivNode, isModNode, isRoundNode, isToNumberNode,
  isFillNode, isJoinNode, isToStringNode, isInterpolateNode, isTrimNode, isLowerNode, isUpperNode, isSplitNode, isReplaceNode,
  isEqNode, isNeqNode, isGtNode, isGteNode, isLtNode, isLteNode, isEmptyNode, isStartsWithNode, isEndsWithNode, isContainsNode,
  isNotNode, isAndNode, isOrNode,
  isMergeNode, isCoalesceNode, isCaseNode, isEntriesOfNode, isKeyByNode, isGroupByNode,
  isKeysNode, isValuesNode, isFromEntriesNode, isPickNode, isOmitNode, isTypeNode, isLengthNode,
  isHasNode, isRenameKeysNode, isUpdateNode, isAssertNode, isWalkNode,
  isDateNode, isDateAddNode, isDateDiffNode,
  isLocaleDateNode, isLocaleMoneyNode, isLocaleNumberNode,
  isJsonObject, isPlainObject,
} from '../schemas/guards';

// ─────────────────────────────────────────────────────────
// Op implementations
// ─────────────────────────────────────────────────────────

import { opRef, opConst, opVar, opGet, opWith } from '../ops/core.ops';
import { opMap, opFilter, opReduce, opSlice, opFlatten, opUnique, opSortBy } from '../ops/array.ops';
import { opAdd, opSub, opMul, opDiv, opMod, opRound, opToNumber } from '../ops/math.ops';
import { opFill, opJoin, opToString, opInterpolate, opTrim, opLower, opUpper, opSplit, opReplace } from '../ops/string.ops';
import { opEq, opNeq, opGt, opGte, opLt, opLte, opEmpty, opStartsWith, opEndsWith, opContains } from '../ops/predicate.ops';
import { opNot, opAnd, opOr } from '../ops/logic.ops';
import { opMerge, opCoalesce, opCase, opEntriesOf, opKeyBy, opGroupBy } from '../ops/structure.ops';
import { opKeys, opValues, opFromEntries, opPick, opOmit, opType, opLength } from '../ops/object.ops';
import { opHas, opRenameKeys, opUpdate, opAssert, opWalk } from '../ops/transform.ops';
import { opDate, opDateAdd, opDateDiff } from '../ops/time.ops';
import { opLocaleDate, opLocaleMoney, opLocaleNumber } from '../ops/intl.ops';

// ═══════════════════════════════════════════════════════════
// Node Evaluator (recursive dispatcher)
// ═══════════════════════════════════════════════════════════

// Internal property attached by the optimizer at compile time. When present,
// the evaluator dispatches via this handler directly and skips the entire
// discriminant chain below. Optimized configs go this fast path; raw configs
// (calling evaluate() directly) fall through to the existing chain.
const HANDLER_KEY = '__op';

// The attached value is always a function with this shape — written by the
// optimizer in src/engine/optimize.ts. We narrow via typeof and then forward
// the call without a cast: TypeScript infers `unknown` for the result of
// calling an arbitrary function, which we can return as JsonValue only via
// a guard. Instead, we wrap the call in a typed adapter that takes the
// already-narrowed `Function` and forwards the args.
type AttachedFn = (node: Record<string, unknown>, context: EvalContext, evaluate: EvaluateFn) => JsonValue;

const isAttachedFn = (value: unknown): value is AttachedFn => typeof value === 'function';

// Every node an evaluation visits spends from its budget, and what it makes
// is measured (./budget.ts). One place, because every op evaluates its
// children through here.
export const evaluateNode: EvaluateFn = (node: unknown, context: EvalContext): JsonValue => {
  const { budget } = context;
  if (budget === undefined) return evaluateUnbudgeted(node, context);
  spendStep(budget);
  const out = evaluateUnbudgeted(node, context);
  measureString(out, budget);
  return out;
};

const evaluateUnbudgeted = (node: unknown, context: EvalContext): JsonValue => {
  // Primitives
  if (node === null || node === undefined) return null;
  if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') return node;

  // Arrays
  if (Array.isArray(node)) return node.map((n) => evaluateNode(n, context));

  // Not an object — shouldn't happen after validation
  if (typeof node !== 'object') return null;

  const obj = node as Record<string, unknown>;

  // ───────────────────────────────────────────────────────
  // Fast path — compile-time attached handler
  // ───────────────────────────────────────────────────────
  const attached = obj[HANDLER_KEY];
  if (isAttachedFn(attached)) return attached(obj, context, evaluateNode);

  // ───────────────────────────────────────────────────────
  // Plain object — recursive template evaluation
  //
  // Before the ops, not after them: a template has no `$` key and every op
  // guard below asks for one, so no node is both, and the order changes no
  // answer. A template has no attached handler either (it is not an op), so
  // placed last it fell through every guard on each evaluation — in a
  // compiled tree too, and once for each row where it is a `$map` body.
  // ───────────────────────────────────────────────────────
  if (isPlainObject(obj)) {
    const result: Record<string, JsonValue> = {};
    // No `__optional`, as in nearly every template: no field to leave out and
    // no missing path to forgive, so no set of names and nothing to catch.
    if (!(OPTIONAL_FIELDS_KEY in obj)) {
      for (const key of Object.keys(obj)) result[key] = evaluateNode(obj[key], context);
      return result;
    }
    const optionalFields = new Set<string>(
      Array.isArray(obj[OPTIONAL_FIELDS_KEY]) ? (obj[OPTIONAL_FIELDS_KEY] as string[]) : [],
    );

    for (const [key, value] of Object.entries(obj)) {
      if (key === OPTIONAL_FIELDS_KEY) continue;
      const isOptional = optionalFields.has(key);

      try {
        const evaluated = evaluateNode(value, context);
        if (isOptional && (evaluated === null || evaluated === undefined)) continue;
        result[key] = evaluated;
      } catch (error) {
        if (isOptional && error instanceof PrismError && error.code === ErrorCode.MISSING_PATH) continue;
        throw error;
      }
    }

    return result;
  }

  // ───────────────────────────────────────────────────────
  // Core ops
  // ───────────────────────────────────────────────────────
  if (isRefNode(obj)) return opRef(obj, context, evaluateNode);
  if (isConstNode(obj)) return opConst(obj, context, evaluateNode);
  if (isVarNode(obj)) return opVar(obj, context, evaluateNode);
  if (isGetNode(obj)) return opGet(obj, context, evaluateNode);
  if (isWithNode(obj)) return opWith(obj, context, evaluateNode);

  // ───────────────────────────────────────────────────────
  // Array ops
  // ───────────────────────────────────────────────────────
  if (isMapNode(obj)) return opMap(obj, context, evaluateNode);
  if (isFilterNode(obj)) return opFilter(obj, context, evaluateNode);
  if (isReduceNode(obj)) return opReduce(obj, context, evaluateNode);
  if (isSliceNode(obj)) return opSlice(obj, context, evaluateNode);
  if (isFlattenNode(obj)) return opFlatten(obj, context, evaluateNode);
  if (isUniqueNode(obj)) return opUnique(obj, context, evaluateNode);
  if (isSortByNode(obj)) return opSortBy(obj, context, evaluateNode);

  // ───────────────────────────────────────────────────────
  // Math ops
  // ───────────────────────────────────────────────────────
  if (isAddNode(obj)) return opAdd(obj, context, evaluateNode);
  if (isSubNode(obj)) return opSub(obj, context, evaluateNode);
  if (isMulNode(obj)) return opMul(obj, context, evaluateNode);
  if (isDivNode(obj)) return opDiv(obj, context, evaluateNode);
  if (isRoundNode(obj)) return opRound(obj, context, evaluateNode);
  if (isModNode(obj)) return opMod(obj, context, evaluateNode);
  if (isToNumberNode(obj)) return opToNumber(obj, context, evaluateNode);

  // ───────────────────────────────────────────────────────
  // String ops
  // ───────────────────────────────────────────────────────
  if (isJoinNode(obj)) return opJoin(obj, context, evaluateNode);
  if (isToStringNode(obj)) return opToString(obj, context, evaluateNode);
  if (isInterpolateNode(obj)) return opInterpolate(obj, context, evaluateNode);
  if (isFillNode(obj)) return opFill(obj, context, evaluateNode);
  if (isTrimNode(obj)) return opTrim(obj, context, evaluateNode);
  if (isLowerNode(obj)) return opLower(obj, context, evaluateNode);
  if (isUpperNode(obj)) return opUpper(obj, context, evaluateNode);
  if (isSplitNode(obj)) return opSplit(obj, context, evaluateNode);
  if (isReplaceNode(obj)) return opReplace(obj, context, evaluateNode);

  // ───────────────────────────────────────────────────────
  // Predicate ops
  // ───────────────────────────────────────────────────────
  if (isEqNode(obj)) return opEq(obj, context, evaluateNode);
  if (isNeqNode(obj)) return opNeq(obj, context, evaluateNode);
  if (isGtNode(obj)) return opGt(obj, context, evaluateNode);
  if (isGteNode(obj)) return opGte(obj, context, evaluateNode);
  if (isLtNode(obj)) return opLt(obj, context, evaluateNode);
  if (isLteNode(obj)) return opLte(obj, context, evaluateNode);
  if (isEmptyNode(obj)) return opEmpty(obj, context, evaluateNode);
  if (isStartsWithNode(obj)) return opStartsWith(obj, context, evaluateNode);
  if (isEndsWithNode(obj)) return opEndsWith(obj, context, evaluateNode);
  if (isContainsNode(obj)) return opContains(obj, context, evaluateNode);

  // ───────────────────────────────────────────────────────
  // Logic ops
  // ───────────────────────────────────────────────────────
  if (isNotNode(obj)) return opNot(obj, context, evaluateNode);
  if (isAndNode(obj)) return opAnd(obj, context, evaluateNode);
  if (isOrNode(obj)) return opOr(obj, context, evaluateNode);

  // ───────────────────────────────────────────────────────
  // Structure ops
  // ───────────────────────────────────────────────────────
  if (isMergeNode(obj)) return opMerge(obj, context, evaluateNode);
  if (isCoalesceNode(obj)) return opCoalesce(obj, context, evaluateNode);
  if (isCaseNode(obj)) return opCase(obj, context, evaluateNode);
  if (isEntriesOfNode(obj)) return opEntriesOf(obj, context, evaluateNode);
  if (isKeyByNode(obj)) return opKeyBy(obj, context, evaluateNode);
  if (isGroupByNode(obj)) return opGroupBy(obj, context, evaluateNode);

  // ───────────────────────────────────────────────────────
  // Object ops
  // ───────────────────────────────────────────────────────
  if (isKeysNode(obj)) return opKeys(obj, context, evaluateNode);
  if (isValuesNode(obj)) return opValues(obj, context, evaluateNode);
  if (isFromEntriesNode(obj)) return opFromEntries(obj, context, evaluateNode);
  if (isPickNode(obj)) return opPick(obj, context, evaluateNode);
  if (isOmitNode(obj)) return opOmit(obj, context, evaluateNode);
  if (isTypeNode(obj)) return opType(obj, context, evaluateNode);
  if (isLengthNode(obj)) return opLength(obj, context, evaluateNode);

  // Transform ops
  if (isHasNode(obj)) return opHas(obj, context, evaluateNode);
  if (isRenameKeysNode(obj)) return opRenameKeys(obj, context, evaluateNode);
  if (isUpdateNode(obj)) return opUpdate(obj, context, evaluateNode);
  if (isAssertNode(obj)) return opAssert(obj, context, evaluateNode);
  if (isWalkNode(obj)) return opWalk(obj, context, evaluateNode);

  // ───────────────────────────────────────────────────────
  // Time ops
  // ───────────────────────────────────────────────────────
  if (isDateNode(obj)) return opDate(obj, context, evaluateNode);
  if (isDateAddNode(obj)) return opDateAdd(obj, context, evaluateNode);
  if (isDateDiffNode(obj)) return opDateDiff(obj, context, evaluateNode);

  // ───────────────────────────────────────────────────────
  // Locale-aware formatting ops
  // ───────────────────────────────────────────────────────
  if (isLocaleDateNode(obj)) return opLocaleDate(obj, context, evaluateNode);
  if (isLocaleMoneyNode(obj)) return opLocaleMoney(obj, context, evaluateNode);
  if (isLocaleNumberNode(obj)) return opLocaleNumber(obj, context, evaluateNode);

  // Unknown node shape — a `$` key no op answers to. The schema refuses these
  // (E_SCHEMA), so this is reached only by a tree that never went through it:
  // an IR handed to execute(), or a node evaluated directly.
  const unknownKeys = Object.keys(obj).filter((k) => k.startsWith('$'));
  throw new PrismError('Unsupported node shape', ErrorCode.NODE_SHAPE, {
    details: { keys: unknownKeys, preview: JSON.stringify(obj).slice(0, 100) },
  });
};

// ═══════════════════════════════════════════════════════════
// Public Entry Points
// ═══════════════════════════════════════════════════════════

// The source a config is evaluated against is JSON: null, strings, booleans,
// finite numbers, and arrays and objects of those.
const isJsonValue = (value: unknown): value is JsonValue => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value !== 'object') return false;
  // A plain object: a Date, a Map or an instance of a class has no fields to
  // look at and would pass for `{}`.
  const proto: unknown = Object.getPrototypeOf(value);
  return (proto === Object.prototype || proto === null) && Object.values(value).every(isJsonValue);
};

// A config, checked: refused with the part that is wrong, or the tree to run.
const checked = (config: unknown): unknown => {
  if (exceedsDepth(config)) throw new PrismError('Invalid config', ErrorCode.SCHEMA, { details: { issues: [{ path: 'root', message: depthRefusal() }] } });
  const parsed = ConfigSchema.safeParse(config);
  if (!parsed.success) {
    const issues = explainIssues(parsed.error.issues).map((i) => ({ path: i.path.join('.') || 'root', message: i.message }));
    throw new PrismError('Invalid config', ErrorCode.SCHEMA, { details: { issues } });
  }
  return desugar(parsed.data);
};

// One evaluation of a tree that is already checked and desugared. `kept` says
// the tree outlives this call (see EvalContext).
const run = (tree: unknown, source: JsonValue, limits: Partial<Limits> | undefined, kept: boolean): JsonValue => {
  const budget = createBudget(limits);
  const result = evaluateNode(tree, kept ? { source, vars: {}, budget, kept } : { source, vars: {}, budget });
  measure(result, budget);
  return result;
};

export type EvaluateOptions = {
  // What this evaluation may cost (./budget.ts). The defaults where not given.
  limits?: Partial<Limits>;
  // 'always': check the config on this call whatever was checked before, and
  // check that the source is plain JSON. For writing a config, for tests and
  // for tools. Without it a config object is checked the first time it is seen.
  check?: 'always';
};

// What a config object was found to be: its tree, and whether the optimizer
// has been over it. Held weakly, by the object.
type Kept = { tree: unknown; optimized: boolean };
const keptTrees = new WeakMap<object, Kept>();

// ═══════════════════════════════════════════════════════════
// evaluate — a config and a source in, the answer out.
//
// A config is checked the first time its object is seen and its tree is kept:
// a host holds its configs and hands the same objects over again, on every
// request, every fact, every row. The second time, the tree is optimized as
// `compile` would (handlers attached, paths parsed, constants folded) and
// from then on a call only evaluates. Not on the first: a config handed over
// once — written inline, or read from a store for this call — would pay for
// an optimization nothing uses.
//
// Kept by the OBJECT, so a config changed in place after its first call is
// not read again; a new object is. `check: 'always'` keeps nothing and checks
// everything, the source too.
//
// Both sides are `unknown`: this is the function a host's transform seam is
// handed (nova's shell, tide's engine, strata's upgrader), and a seam hands
// over whatever the host holds.
// ═══════════════════════════════════════════════════════════

export const evaluate = (config: Config, source: unknown, options?: EvaluateOptions): JsonValue => {
  if (options?.check === 'always') {
    if (!isJsonValue(source)) throw new PrismError('The source must be plain JSON.', ErrorCode.TYPE);
    return run(checked(config), source, options.limits, false);
  }
  const input = source as JsonValue;
  if (typeof config !== 'object' || config === null) return run(checked(config), input, options?.limits, false);
  let kept = keptTrees.get(config);
  if (kept === undefined) {
    kept = { tree: checked(config), optimized: false };
    keptTrees.set(config, kept);
  } else if (!kept.optimized) {
    kept.tree = optimize(kept.tree, evaluateNode).node;
    kept.optimized = true;
  }
  return run(kept.tree, input, options?.limits, true);
};

export const evaluateSafe = (config: Config, source: unknown, options?: EvaluateOptions): Result<JsonValue> => {
  try {
    return { ok: true, data: evaluate(config, source, options) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
  }
};
