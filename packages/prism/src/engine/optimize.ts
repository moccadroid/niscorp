import type { EvalContext, EvaluateFn, JsonValue } from '../types';
import { parseJsonPath, type JsonPathSegment } from '../utils/jsonpath';
import {
  isJsonObject,
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
import { createBudget } from './budget';

// Both are written as non-enumerable properties, so an optimized tree still
// serializes as the JSON it is: the fingerprint and a stored IR carry neither.
export const HANDLER_KEY = '__op';
export const SEGMENTS_KEY = '__segments';

type OpHandler = (node: unknown, context: EvalContext, evaluate: EvaluateFn) => JsonValue;

// Nothing is checked here: `resolveHandler` attaches an op only to a node that
// has passed that op's guard.
const eraseOp = <T>(op: (n: T, c: EvalContext, e: EvaluateFn) => JsonValue): OpHandler => op as OpHandler;

export type OptimizeStats = {
  refsInlined: number;
  handlersAttached: number;
  constantsFolded: number;
};

export type OptimizeResult = {
  node: unknown;
  stats: OptimizeStats;
};

const attachNonEnumerable = (target: Record<string, unknown>, key: string, value: unknown): void => {
  Object.defineProperty(target, key, {
    value,
    enumerable: false,
    writable: true,
    configurable: true,
  });
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => isJsonObject(value);

// A constant of a compiled tree is handed out by every execute of it. Frozen,
// so that a caller cannot change what the next caller is given.
const freezeConstant = (value: unknown): void => {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return;
  Object.freeze(value);
  for (const inner of Object.values(value)) freezeConstant(inner);
};

const resolveHandler = (node: Record<string, unknown>): OpHandler | undefined => {
  if (isRefNode(node)) return eraseOp(opRef);
  if (isConstNode(node)) return eraseOp(opConst);
  if (isVarNode(node)) return eraseOp(opVar);
  if (isGetNode(node)) return eraseOp(opGet);
  if (isWithNode(node)) return eraseOp(opWith);
  if (isMapNode(node)) return eraseOp(opMap);
  if (isFilterNode(node)) return eraseOp(opFilter);
  if (isReduceNode(node)) return eraseOp(opReduce);
  if (isSliceNode(node)) return eraseOp(opSlice);
  if (isFlattenNode(node)) return eraseOp(opFlatten);
  if (isUniqueNode(node)) return eraseOp(opUnique);
  if (isSortByNode(node)) return eraseOp(opSortBy);
  if (isAddNode(node)) return eraseOp(opAdd);
  if (isSubNode(node)) return eraseOp(opSub);
  if (isMulNode(node)) return eraseOp(opMul);
  if (isDivNode(node)) return eraseOp(opDiv);
  if (isRoundNode(node)) return eraseOp(opRound);
  if (isModNode(node)) return eraseOp(opMod);
  if (isToNumberNode(node)) return eraseOp(opToNumber);
  if (isJoinNode(node)) return eraseOp(opJoin);
  if (isToStringNode(node)) return eraseOp(opToString);
  if (isInterpolateNode(node)) return eraseOp(opInterpolate);
  if (isFillNode(node)) return eraseOp(opFill);
  if (isTrimNode(node)) return eraseOp(opTrim);
  if (isLowerNode(node)) return eraseOp(opLower);
  if (isUpperNode(node)) return eraseOp(opUpper);
  if (isSplitNode(node)) return eraseOp(opSplit);
  if (isReplaceNode(node)) return eraseOp(opReplace);
  if (isEqNode(node)) return eraseOp(opEq);
  if (isNeqNode(node)) return eraseOp(opNeq);
  if (isGtNode(node)) return eraseOp(opGt);
  if (isGteNode(node)) return eraseOp(opGte);
  if (isLtNode(node)) return eraseOp(opLt);
  if (isLteNode(node)) return eraseOp(opLte);
  if (isEmptyNode(node)) return eraseOp(opEmpty);
  if (isStartsWithNode(node)) return eraseOp(opStartsWith);
  if (isEndsWithNode(node)) return eraseOp(opEndsWith);
  if (isContainsNode(node)) return eraseOp(opContains);
  if (isNotNode(node)) return eraseOp(opNot);
  if (isAndNode(node)) return eraseOp(opAnd);
  if (isOrNode(node)) return eraseOp(opOr);
  if (isMergeNode(node)) return eraseOp(opMerge);
  if (isCoalesceNode(node)) return eraseOp(opCoalesce);
  if (isCaseNode(node)) return eraseOp(opCase);
  if (isEntriesOfNode(node)) return eraseOp(opEntriesOf);
  if (isKeyByNode(node)) return eraseOp(opKeyBy);
  if (isGroupByNode(node)) return eraseOp(opGroupBy);
  if (isKeysNode(node)) return eraseOp(opKeys);
  if (isValuesNode(node)) return eraseOp(opValues);
  if (isFromEntriesNode(node)) return eraseOp(opFromEntries);
  if (isPickNode(node)) return eraseOp(opPick);
  if (isOmitNode(node)) return eraseOp(opOmit);
  if (isTypeNode(node)) return eraseOp(opType);
  if (isLengthNode(node)) return eraseOp(opLength);
  if (isHasNode(node)) return eraseOp(opHas);
  if (isRenameKeysNode(node)) return eraseOp(opRenameKeys);
  if (isUpdateNode(node)) return eraseOp(opUpdate);
  if (isAssertNode(node)) return eraseOp(opAssert);
  if (isWalkNode(node)) return eraseOp(opWalk);
  if (isDateNode(node)) return eraseOp(opDate);
  if (isDateAddNode(node)) return eraseOp(opDateAdd);
  if (isDateDiffNode(node)) return eraseOp(opDateDiff);
  if (isLocaleDateNode(node)) return eraseOp(opLocaleDate);
  if (isLocaleMoneyNode(node)) return eraseOp(opLocaleMoney);
  if (isLocaleNumberNode(node)) return eraseOp(opLocaleNumber);
  return undefined;
};

const isFoldableLiteral = (node: unknown): boolean => {
  if (node === null || node === undefined) return true;
  const t = typeof node;
  if (t === 'string' || t === 'number' || t === 'boolean') return true;
  if (Array.isArray(node)) return node.every(isFoldableLiteral);
  if (!isPlainObject(node)) return false;
  if (isConstNode(node)) return isFoldableLiteral(node.$const);
  // An op is no literal: children are optimized before their parent, so one
  // that could fold is a `$const` by now.
  if (Object.keys(node).some((k) => k.startsWith('$'))) return false;
  return Object.values(node).every(isFoldableLiteral);
};

type Stats = OptimizeStats;

const optimizeNode = (
  node: unknown,
  stats: Stats,
  evaluate: EvaluateFn,
): unknown => {
  if (node === null || node === undefined) return node;
  if (typeof node !== 'object') return node;

  if (Array.isArray(node)) {
    const out: unknown[] = [];
    for (const child of node) out.push(optimizeNode(child, stats, evaluate));
    return out;
  }

  if (!isPlainObject(node)) return node;

  // A `$const` payload is data, never a subtree to optimize: an op-shaped value
  // inside it (`{ $const: [{ $upper: 'x' }] }`) stays as written.
  if (isConstNode(node)) {
    const literal: Record<string, unknown> = { ...node };
    freezeConstant(literal['$const']);
    attachNonEnumerable(literal, HANDLER_KEY, eraseOp(opConst));
    stats.handlersAttached += 1;
    return literal;
  }

  const optimizeValues = (record: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(record)) out[key] = optimizeNode(record[key], stats, evaluate);
    return out;
  };

  // Two ops hold a record keyed by names, and a name may be an op's: a `$with`
  // binding called `$upper`, a `$renameKeys` map that renames a key called
  // `$type`. The record is not a node.
  let optimized: Record<string, unknown>;
  if (isWithNode(node)) {
    optimized = { $with: { let: optimizeValues(node.$with.let), value: optimizeNode(node.$with.value, stats, evaluate) } };
  } else if (isRenameKeysNode(node)) {
    optimized = { $renameKeys: { ...node.$renameKeys, from: optimizeNode(node.$renameKeys.from, stats, evaluate) } };
  } else {
    optimized = optimizeValues(node);
  }

  if (isRefNode(optimized)) {
    const segments: JsonPathSegment[] = parseJsonPath(optimized.$ref);
    if (segments.length > 0) {
      attachNonEnumerable(optimized, SEGMENTS_KEY, segments);
      stats.refsInlined += 1;
    }
  }

  const handler = resolveHandler(optimized);
  if (handler !== undefined) {
    attachNonEnumerable(optimized, HANDLER_KEY, handler);
    stats.handlersAttached += 1;
  }

  // `$ref` and `$var` read the context, and their only input is a literal
  // string: the literal check below would fold them against an empty source.
  if (handler !== undefined && !isConstNode(optimized) && !isRefNode(optimized) && !isVarNode(optimized)) {
    const allFoldable = Object.entries(optimized).every(([key, value]) => {
      if (key === HANDLER_KEY || key === SEGMENTS_KEY) return true;
      return isFoldableLiteral(value);
    });
    if (allFoldable) {
      // Budgeted like any evaluation: a literal subtree can blow up too.
      const emptyCtx: EvalContext = { source: {}, vars: {}, budget: createBudget() };
      try {
        const folded = handler(optimized, emptyCtx, evaluate);
        const replacement: Record<string, unknown> = { $const: folded };
        freezeConstant(folded);
        attachNonEnumerable(replacement, HANDLER_KEY, eraseOp(opConst));
        stats.constantsFolded += 1;
        return replacement;
      } catch {
        // The node stays as it is: the runtime evaluates it and refuses it there.
      }
    }
  }

  return optimized;
};

export const optimize = (node: unknown, evaluate: EvaluateFn): OptimizeResult => {
  const stats: Stats = { refsInlined: 0, handlersAttached: 0, constantsFolded: 0 };
  const result = optimizeNode(node, stats, evaluate);
  return { node: result, stats };
};

const annotateNode = (node: unknown): void => {
  if (Array.isArray(node)) {
    for (const child of node) annotateNode(child);
    return;
  }
  if (!isPlainObject(node)) return;

  if (isWithNode(node)) {
    for (const value of Object.values(node.$with.let)) annotateNode(value);
    annotateNode(node.$with.value);
  } else if (isRenameKeysNode(node)) {
    annotateNode(node.$renameKeys.from);
  } else if (!isConstNode(node)) {
    for (const value of Object.values(node)) annotateNode(value);
  } else {
    freezeConstant(node.$const);
  }

  if (isRefNode(node)) {
    const segments: JsonPathSegment[] = parseJsonPath(node.$ref);
    if (segments.length > 0) attachNonEnumerable(node, SEGMENTS_KEY, segments);
  }

  const handler = resolveHandler(node);
  if (handler !== undefined) attachNonEnumerable(node, HANDLER_KEY, handler);
};

export const rehydrate = (core: unknown): void => annotateNode(core);
