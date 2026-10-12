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

const HANDLER_KEY = '__op';

type AttachedFn = (node: Record<string, unknown>, context: EvalContext, evaluate: EvaluateFn) => JsonValue;

const isAttachedFn = (value: unknown): value is AttachedFn => typeof value === 'function';

export const evaluateNode: EvaluateFn = (node: unknown, context: EvalContext): JsonValue => {
  const { budget } = context;
  if (budget === undefined) return evaluateUnbudgeted(node, context);
  spendStep(budget);
  const out = evaluateUnbudgeted(node, context);
  measureString(out, budget);
  return out;
};

const evaluateUnbudgeted = (node: unknown, context: EvalContext): JsonValue => {
  if (node === null || node === undefined) return null;
  if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') return node;

  if (Array.isArray(node)) return node.map((n) => evaluateNode(n, context));

  if (typeof node !== 'object') return null;

  const obj = node as Record<string, unknown>;

  const attached = obj[HANDLER_KEY];
  if (isAttachedFn(attached)) return attached(obj, context, evaluateNode);

  // Before the ops, though no node is both: a template has no handler attached,
  // so placed last it would fall through every guard, in a compiled tree too.
  if (isPlainObject(obj)) {
    const result: Record<string, JsonValue> = {};
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

  if (isRefNode(obj)) return opRef(obj, context, evaluateNode);
  if (isConstNode(obj)) return opConst(obj, context, evaluateNode);
  if (isVarNode(obj)) return opVar(obj, context, evaluateNode);
  if (isGetNode(obj)) return opGet(obj, context, evaluateNode);
  if (isWithNode(obj)) return opWith(obj, context, evaluateNode);

  if (isMapNode(obj)) return opMap(obj, context, evaluateNode);
  if (isFilterNode(obj)) return opFilter(obj, context, evaluateNode);
  if (isReduceNode(obj)) return opReduce(obj, context, evaluateNode);
  if (isSliceNode(obj)) return opSlice(obj, context, evaluateNode);
  if (isFlattenNode(obj)) return opFlatten(obj, context, evaluateNode);
  if (isUniqueNode(obj)) return opUnique(obj, context, evaluateNode);
  if (isSortByNode(obj)) return opSortBy(obj, context, evaluateNode);

  if (isAddNode(obj)) return opAdd(obj, context, evaluateNode);
  if (isSubNode(obj)) return opSub(obj, context, evaluateNode);
  if (isMulNode(obj)) return opMul(obj, context, evaluateNode);
  if (isDivNode(obj)) return opDiv(obj, context, evaluateNode);
  if (isRoundNode(obj)) return opRound(obj, context, evaluateNode);
  if (isModNode(obj)) return opMod(obj, context, evaluateNode);
  if (isToNumberNode(obj)) return opToNumber(obj, context, evaluateNode);

  if (isJoinNode(obj)) return opJoin(obj, context, evaluateNode);
  if (isToStringNode(obj)) return opToString(obj, context, evaluateNode);
  if (isInterpolateNode(obj)) return opInterpolate(obj, context, evaluateNode);
  if (isFillNode(obj)) return opFill(obj, context, evaluateNode);
  if (isTrimNode(obj)) return opTrim(obj, context, evaluateNode);
  if (isLowerNode(obj)) return opLower(obj, context, evaluateNode);
  if (isUpperNode(obj)) return opUpper(obj, context, evaluateNode);
  if (isSplitNode(obj)) return opSplit(obj, context, evaluateNode);
  if (isReplaceNode(obj)) return opReplace(obj, context, evaluateNode);

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

  if (isNotNode(obj)) return opNot(obj, context, evaluateNode);
  if (isAndNode(obj)) return opAnd(obj, context, evaluateNode);
  if (isOrNode(obj)) return opOr(obj, context, evaluateNode);

  if (isMergeNode(obj)) return opMerge(obj, context, evaluateNode);
  if (isCoalesceNode(obj)) return opCoalesce(obj, context, evaluateNode);
  if (isCaseNode(obj)) return opCase(obj, context, evaluateNode);
  if (isEntriesOfNode(obj)) return opEntriesOf(obj, context, evaluateNode);
  if (isKeyByNode(obj)) return opKeyBy(obj, context, evaluateNode);
  if (isGroupByNode(obj)) return opGroupBy(obj, context, evaluateNode);

  if (isKeysNode(obj)) return opKeys(obj, context, evaluateNode);
  if (isValuesNode(obj)) return opValues(obj, context, evaluateNode);
  if (isFromEntriesNode(obj)) return opFromEntries(obj, context, evaluateNode);
  if (isPickNode(obj)) return opPick(obj, context, evaluateNode);
  if (isOmitNode(obj)) return opOmit(obj, context, evaluateNode);
  if (isTypeNode(obj)) return opType(obj, context, evaluateNode);
  if (isLengthNode(obj)) return opLength(obj, context, evaluateNode);

  if (isHasNode(obj)) return opHas(obj, context, evaluateNode);
  if (isRenameKeysNode(obj)) return opRenameKeys(obj, context, evaluateNode);
  if (isUpdateNode(obj)) return opUpdate(obj, context, evaluateNode);
  if (isAssertNode(obj)) return opAssert(obj, context, evaluateNode);
  if (isWalkNode(obj)) return opWalk(obj, context, evaluateNode);

  if (isDateNode(obj)) return opDate(obj, context, evaluateNode);
  if (isDateAddNode(obj)) return opDateAdd(obj, context, evaluateNode);
  if (isDateDiffNode(obj)) return opDateDiff(obj, context, evaluateNode);

  if (isLocaleDateNode(obj)) return opLocaleDate(obj, context, evaluateNode);
  if (isLocaleMoneyNode(obj)) return opLocaleMoney(obj, context, evaluateNode);
  if (isLocaleNumberNode(obj)) return opLocaleNumber(obj, context, evaluateNode);

  const unknownKeys = Object.keys(obj).filter((k) => k.startsWith('$'));
  throw new PrismError('Unsupported node shape', ErrorCode.NODE_SHAPE, {
    details: { keys: unknownKeys, preview: JSON.stringify(obj).slice(0, 100) },
  });
};

const isJsonValue = (value: unknown): value is JsonValue => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value !== 'object') return false;
  // A Date, a Map or an instance of a class has no fields to look at and would
  // pass for `{}`.
  const proto: unknown = Object.getPrototypeOf(value);
  return (proto === Object.prototype || proto === null) && Object.values(value).every(isJsonValue);
};

const checked = (config: unknown): unknown => {
  if (exceedsDepth(config)) throw new PrismError('Invalid config', ErrorCode.SCHEMA, { details: { issues: [{ path: 'root', message: depthRefusal() }] } });
  const parsed = ConfigSchema.safeParse(config);
  if (!parsed.success) {
    const issues = explainIssues(parsed.error.issues).map((i) => ({ path: i.path.join('.') || 'root', message: i.message }));
    throw new PrismError('Invalid config', ErrorCode.SCHEMA, { details: { issues } });
  }
  return desugar(parsed.data);
};

const run = (tree: unknown, source: JsonValue, limits: Partial<Limits> | undefined, kept: boolean): JsonValue => {
  const budget = createBudget(limits);
  const result = evaluateNode(tree, kept ? { source, vars: {}, budget, kept } : { source, vars: {}, budget });
  measure(result, budget);
  return result;
};

export type EvaluateOptions = {
  limits?: Partial<Limits>;
  check?: 'always';
};

type Kept = { tree: unknown; optimized: boolean };
const keptTrees = new WeakMap<object, Kept>();

// A config object is checked the first time it is seen and its tree kept; the
// tree is optimized the second time. Not the first: a config handed over once
// would pay for an optimization nothing uses. Kept by the object, so a config
// changed in place after its first call is not read again.
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
