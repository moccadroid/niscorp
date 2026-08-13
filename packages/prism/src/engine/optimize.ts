import type { EvalContext, EvaluateFn, JsonValue } from '../types';
import { parseJsonPath, type JsonPathSegment } from '../utils/jsonpath';
import {
  isJsonObject,
  isRefNode, isConstNode, isVarNode, isGetNode, isWithNode,
  isMapNode, isFilterNode, isReduceNode, isSliceNode, isFlattenNode, isUniqueNode, isSortByNode,
  isAddNode, isSubNode, isMulNode, isDivNode, isRoundNode,
  isFillNode, isJoinNode, isToStringNode, isInterpolateNode, isTrimNode, isLowerNode, isUpperNode, isSplitNode, isReplaceNode,
  isEqNode, isNeqNode, isGtNode, isGteNode, isLtNode, isLteNode, isEmptyNode, isStartsWithNode, isEndsWithNode, isContainsNode,
  isNotNode, isAndNode, isOrNode,
  isMergeNode, isCoalesceNode, isCaseNode, isEntriesOfNode, isKeyByNode, isGroupByNode,
  isKeysNode, isValuesNode, isFromEntriesNode, isPickNode, isOmitNode, isTypeNode, isLengthNode,
  isDateNode, isDateAddNode, isDateDiffNode,
  isLocaleDateNode, isLocaleMoneyNode, isLocaleNumberNode,
} from '../schemas/guards';

import { opRef, opConst, opVar, opGet, opWith } from '../ops/core.ops';
import { opMap, opFilter, opReduce, opSlice, opFlatten, opUnique, opSortBy } from '../ops/array.ops';
import { opAdd, opSub, opMul, opDiv, opRound } from '../ops/math.ops';
import { opFill, opJoin, opToString, opInterpolate, opTrim, opLower, opUpper, opSplit, opReplace } from '../ops/string.ops';
import { opEq, opNeq, opGt, opGte, opLt, opLte, opEmpty, opStartsWith, opEndsWith, opContains } from '../ops/predicate.ops';
import { opNot, opAnd, opOr } from '../ops/logic.ops';
import { opMerge, opCoalesce, opCase, opEntriesOf, opKeyBy, opGroupBy } from '../ops/structure.ops';
import { opKeys, opValues, opFromEntries, opPick, opOmit, opType, opLength } from '../ops/object.ops';
import { opDate, opDateAdd, opDateDiff } from '../ops/time.ops';
import { opLocaleDate, opLocaleMoney, opLocaleNumber } from '../ops/intl.ops';

// ═══════════════════════════════════════════════════════════
// Compile-time optimizer
//
// Walks the desugared AST and produces an annotated tree:
//
//   1. RefsInlined  — every $ref node carries a non-enumerable
//                     `__segments: JsonPathSegment[]` so the runtime
//                     skips JSONPath parsing/lookup.
//
//   2. HandlersAttached — every recognized op node carries a non-
//                     enumerable `__op` pointing at its handler. The
//                     evaluator dispatches via this directly, skipping
//                     the long discriminant chain.
//
//   3. ConstantsFolded — any node whose result depends only on
//                     literal subtrees is pre-evaluated at compile
//                     time and replaced with `{$const: <result>}`.
//
// All annotations use NON-ENUMERABLE properties so:
//   - JSON.stringify(node) still returns pure JSON
//   - The fingerprint stays stable
//   - Consumers that serialize the IR (showroom Compiled tab, on-disk
//     IR caches, hot-reload) don't see the metadata leak through
// ═══════════════════════════════════════════════════════════

export const HANDLER_KEY = '__op';
export const SEGMENTS_KEY = '__segments';

// At runtime every op handler has the same shape: (node, ctx, eval) -> JsonValue.
// Statically, each typed op (opRef, opAdd, ...) declares its own narrow `node`
// parameter type that TypeScript can't unify with `unknown`. The dispatcher
// below only stores a handler AFTER its guard has matched the node, so the
// runtime contract is sound — TypeScript just can't track it across the
// property attachment boundary.
//
// Rather than wrap every op call in a per-op runtime guard (which would
// defeat the optimization), we erase the input type via a generic adapter.
// The adapter forwards the call without re-checking the node shape; the
// guarantee is upheld by `resolveHandler` only ever attaching this op to
// nodes that already passed its corresponding guard once.
type OpHandler = (node: unknown, context: EvalContext, evaluate: EvaluateFn) => JsonValue;

// Erase a typed op into the OpHandler shape. This function does no type
// checking — it relies on the caller having narrowed the node already.
const eraseOp = <T>(op: (n: T, c: EvalContext, e: EvaluateFn) => JsonValue): OpHandler =>
  (node, context, evaluate) => {
    // We forward `node` (typed `unknown`) to the typed op. TypeScript would
    // reject this as a parameter mismatch; the call is sound because the
    // caller guaranteed `node` is a `T` via a guard. We bridge the gap with
    // `Function.prototype.call`, which accepts any args at the type level.
    return op.call(undefined, node as T, context, evaluate);
  };

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

// Resolve an op handler for a node, or undefined if it's not a recognized op.
// The returned handler is type-erased via `eraseOp` so all 50+ ops fit a
// uniform OpHandler slot for attachment to the node.
const resolveHandler = (node: Record<string, unknown>): OpHandler | undefined => {
  // Core ops
  if (isRefNode(node)) return eraseOp(opRef);
  if (isConstNode(node)) return eraseOp(opConst);
  if (isVarNode(node)) return eraseOp(opVar);
  if (isGetNode(node)) return eraseOp(opGet);
  if (isWithNode(node)) return eraseOp(opWith);
  // Array ops
  if (isMapNode(node)) return eraseOp(opMap);
  if (isFilterNode(node)) return eraseOp(opFilter);
  if (isReduceNode(node)) return eraseOp(opReduce);
  if (isSliceNode(node)) return eraseOp(opSlice);
  if (isFlattenNode(node)) return eraseOp(opFlatten);
  if (isUniqueNode(node)) return eraseOp(opUnique);
  if (isSortByNode(node)) return eraseOp(opSortBy);
  // Math ops
  if (isAddNode(node)) return eraseOp(opAdd);
  if (isSubNode(node)) return eraseOp(opSub);
  if (isMulNode(node)) return eraseOp(opMul);
  if (isDivNode(node)) return eraseOp(opDiv);
  if (isRoundNode(node)) return eraseOp(opRound);
  // String ops
  if (isJoinNode(node)) return eraseOp(opJoin);
  if (isToStringNode(node)) return eraseOp(opToString);
  if (isInterpolateNode(node)) return eraseOp(opInterpolate);
  if (isFillNode(node)) return eraseOp(opFill);
  if (isTrimNode(node)) return eraseOp(opTrim);
  if (isLowerNode(node)) return eraseOp(opLower);
  if (isUpperNode(node)) return eraseOp(opUpper);
  if (isSplitNode(node)) return eraseOp(opSplit);
  if (isReplaceNode(node)) return eraseOp(opReplace);
  // Predicate ops
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
  // Logic ops
  if (isNotNode(node)) return eraseOp(opNot);
  if (isAndNode(node)) return eraseOp(opAnd);
  if (isOrNode(node)) return eraseOp(opOr);
  // Structure ops
  if (isMergeNode(node)) return eraseOp(opMerge);
  if (isCoalesceNode(node)) return eraseOp(opCoalesce);
  if (isCaseNode(node)) return eraseOp(opCase);
  if (isEntriesOfNode(node)) return eraseOp(opEntriesOf);
  if (isKeyByNode(node)) return eraseOp(opKeyBy);
  if (isGroupByNode(node)) return eraseOp(opGroupBy);
  // Object ops
  if (isKeysNode(node)) return eraseOp(opKeys);
  if (isValuesNode(node)) return eraseOp(opValues);
  if (isFromEntriesNode(node)) return eraseOp(opFromEntries);
  if (isPickNode(node)) return eraseOp(opPick);
  if (isOmitNode(node)) return eraseOp(opOmit);
  if (isTypeNode(node)) return eraseOp(opType);
  if (isLengthNode(node)) return eraseOp(opLength);
  // Time ops
  if (isDateNode(node)) return eraseOp(opDate);
  if (isDateAddNode(node)) return eraseOp(opDateAdd);
  if (isDateDiffNode(node)) return eraseOp(opDateDiff);
  // Locale-aware formatting ops
  if (isLocaleDateNode(node)) return eraseOp(opLocaleDate);
  if (isLocaleMoneyNode(node)) return eraseOp(opLocaleMoney);
  if (isLocaleNumberNode(node)) return eraseOp(opLocaleNumber);
  return undefined;
};

// ═══════════════════════════════════════════════════════════
// Constant folding
//
// A node is "pure-constant" if its evaluation result doesn't
// depend on the source/vars at all. The conservative rule:
//   - JSON primitives (null/number/string/boolean) are constant
//   - Arrays of constants are constant
//   - {$const: anything} is constant
//   - Object literals (no $-key) whose values are all constant
//
// $ref, $var, $get from a $var, $with, $map etc. are NOT constant
// because they read from source or scope. We only fold ops whose
// inputs are 100% constant — these can be evaluated at compile
// time with an empty context.
// ═══════════════════════════════════════════════════════════

const isFoldableLiteral = (node: unknown): boolean => {
  if (node === null || node === undefined) return true;
  const t = typeof node;
  if (t === 'string' || t === 'number' || t === 'boolean') return true;
  if (Array.isArray(node)) return node.every(isFoldableLiteral);
  if (!isPlainObject(node)) return false;
  // {$const: x} is foldable iff x is foldable
  if (isConstNode(node)) return isFoldableLiteral(node.$const);
  // Any other op or object containing a $-key is NOT a literal — those need
  // a fold pass first. The fold pass checks foldability AFTER recursing into
  // children, so by the time we ask isFoldableLiteral on an op node it's
  // already been folded if possible.
  if (Object.keys(node).some((k) => k.startsWith('$'))) return false;
  // Plain object: foldable iff all values are foldable
  return Object.values(node).every(isFoldableLiteral);
};

// ═══════════════════════════════════════════════════════════
// Visitor — single recursive pass that folds, inlines, and attaches
// ═══════════════════════════════════════════════════════════

type Stats = OptimizeStats;

const optimizeNode = (
  node: unknown,
  stats: Stats,
  evaluate: EvaluateFn,
): unknown => {
  if (node === null || node === undefined) return node;
  if (typeof node !== 'object') return node;

  if (Array.isArray(node)) {
    // Optimize each element. The array itself isn't an op so no handler.
    const out: unknown[] = [];
    for (const child of node) out.push(optimizeNode(child, stats, evaluate));
    return out;
  }

  if (!isPlainObject(node)) return node;

  // Recursively optimize all values first (post-order — children optimized
  // before parents). After this, every op subtree is already folded if
  // possible, so the parent can check isFoldableLiteral on its children.
  const keys = Object.keys(node);
  const optimized: Record<string, unknown> = {};
  for (const key of keys) {
    optimized[key] = optimizeNode(node[key], stats, evaluate);
  }

  // 1. RefsInlined — $ref nodes get parsed segments attached.
  if (isRefNode(optimized)) {
    const segments: JsonPathSegment[] = parseJsonPath(optimized.$ref);
    if (segments.length > 0) {
      attachNonEnumerable(optimized, SEGMENTS_KEY, segments);
      stats.refsInlined += 1;
    }
  }

  // 2. HandlersAttached — every recognized op gets its handler attached.
  const handler = resolveHandler(optimized);
  if (handler !== undefined) {
    attachNonEnumerable(optimized, HANDLER_KEY, handler);
    stats.handlersAttached += 1;
  }

  // 3. ConstantsFolded — if this is an op node AND all its inputs are
  //    foldable literals, evaluate it now and replace with {$const: result}.
  //
  //    "All inputs foldable" means every value in the node is a literal —
  //    no $ref/$var/$get etc. anywhere. Since we already optimized children,
  //    a literal child either is a primitive, an array of literals, a
  //    {$const: x}, or a plain object of literals. Op nodes whose children
  //    are all $const have already been folded by their respective recursive
  //    optimizeNode calls.
  //
  //    Skip $const itself (folding it is a no-op).
  //    Skip ops whose semantics depend on context shape ($var/$ref/$get/$with
  //    and friends will never satisfy the foldability check anyway, so this
  //    is implicit, but documenting for clarity).
  if (handler !== undefined && !isConstNode(optimized)) {
    // Check whether every non-handler/non-segments value in the node is
    // foldable. We test all keys (since the structure of each op differs):
    // for math ops the values are arrays; for $with the value is an object
    // containing $-keys; etc. The conservative rule "every leaf must be a
    // primitive or {$const: ...}" handles all of them.
    const allFoldable = Object.entries(optimized).every(([key, value]) => {
      // skip non-enumerable internal props (they're not in entries anyway,
      // but defensive)
      if (key === HANDLER_KEY || key === SEGMENTS_KEY) return true;
      return isFoldableLiteral(value);
    });
    if (allFoldable) {
      // Try to evaluate at compile time. Use an empty source/vars context.
      const emptyCtx: EvalContext = { source: {}, vars: {} };
      try {
        const folded = handler(optimized, emptyCtx, evaluate);
        const replacement: Record<string, unknown> = { $const: folded };
        attachNonEnumerable(replacement, HANDLER_KEY, eraseOp(opConst));
        stats.constantsFolded += 1;
        // Note: we DO NOT decrement refsInlined/handlersAttached for the
        // folded subtree — the stats reflect the BEFORE state of the
        // optimization (and the folded children no longer ship to runtime).
        return replacement;
      } catch {
        // If folding throws (rare — the foldability check should prevent
        // most cases), leave the node as-is. The runtime will evaluate it.
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
