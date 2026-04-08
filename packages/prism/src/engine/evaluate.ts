import type { JsonValue, JsonObject, EvalContext, EvaluateFn, Result } from '../types';
import type { Config } from '../schemas/config.schema';
import { ConfigSchema } from '../schemas/config.schema';
import { OPTIONAL_FIELDS_KEY } from '../schemas/node.schema';
import { PrismError, ErrorCode } from '../errors';
import { desugar } from '../sugar/desugar';

// ─────────────────────────────────────────────────────────
// Guards (local imports to avoid barrel cycles)
// ─────────────────────────────────────────────────────────

import {
  isRefNode, isConstNode, isVarNode, isGetNode, isWithNode,
  isMapNode, isFilterNode, isReduceNode, isSliceNode, isFlattenNode, isUniqueNode, isSortByNode,
  isAddNode, isSubNode, isMulNode, isDivNode, isRoundNode,
  isJoinNode, isToStringNode, isInterpolateNode, isTrimNode, isLowerNode, isUpperNode, isSplitNode, isReplaceNode,
  isEqNode, isNeqNode, isGtNode, isGteNode, isLtNode, isLteNode, isEmptyNode, isStartsWithNode, isEndsWithNode, isContainsNode,
  isNotNode, isAndNode, isOrNode,
  isMergeNode, isCoalesceNode, isCaseNode, isEntriesOfNode, isKeyByNode, isGroupByNode,
  isKeysNode, isValuesNode, isFromEntriesNode, isPickNode, isOmitNode, isTypeNode, isLengthNode,
  isDateNode, isDateAddNode, isDateDiffNode,
  isJsonObject, isPlainObject,
} from '../schemas/guards';

// ─────────────────────────────────────────────────────────
// Op implementations
// ─────────────────────────────────────────────────────────

import { opRef, opConst, opVar, opGet, opWith } from '../ops/core.ops';
import { opMap, opFilter, opReduce, opSlice, opFlatten, opUnique, opSortBy } from '../ops/array.ops';
import { opAdd, opSub, opMul, opDiv, opRound } from '../ops/math.ops';
import { opJoin, opToString, opInterpolate, opTrim, opLower, opUpper, opSplit, opReplace } from '../ops/string.ops';
import { opEq, opNeq, opGt, opGte, opLt, opLte, opEmpty, opStartsWith, opEndsWith, opContains } from '../ops/predicate.ops';
import { opNot, opAnd, opOr } from '../ops/logic.ops';
import { opMerge, opCoalesce, opCase, opEntriesOf, opKeyBy, opGroupBy } from '../ops/structure.ops';
import { opKeys, opValues, opFromEntries, opPick, opOmit, opType, opLength } from '../ops/object.ops';
import { opDate, opDateAdd, opDateDiff } from '../ops/time.ops';

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

export const evaluateNode: EvaluateFn = (node: unknown, context: EvalContext): JsonValue => {
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

  // ───────────────────────────────────────────────────────
  // String ops
  // ───────────────────────────────────────────────────────
  if (isJoinNode(obj)) return opJoin(obj, context, evaluateNode);
  if (isToStringNode(obj)) return opToString(obj, context, evaluateNode);
  if (isInterpolateNode(obj)) return opInterpolate(obj, context, evaluateNode);
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

  // ───────────────────────────────────────────────────────
  // Time ops
  // ───────────────────────────────────────────────────────
  if (isDateNode(obj)) return opDate(obj, context, evaluateNode);
  if (isDateAddNode(obj)) return opDateAdd(obj, context, evaluateNode);
  if (isDateDiffNode(obj)) return opDateDiff(obj, context, evaluateNode);

  // ───────────────────────────────────────────────────────
  // Plain object — recursive template evaluation
  // ───────────────────────────────────────────────────────
  if (isPlainObject(obj)) {
    const optionalFields = new Set<string>(
      Array.isArray(obj[OPTIONAL_FIELDS_KEY]) ? (obj[OPTIONAL_FIELDS_KEY] as string[]) : [],
    );
    const result: Record<string, JsonValue> = {};

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

  // Unknown node shape
  const unknownKeys = Object.keys(obj).filter((k) => k.startsWith('$'));
  throw new PrismError('Unsupported node shape', ErrorCode.NODE_SHAPE, {
    details: { keys: unknownKeys, preview: JSON.stringify(obj).slice(0, 100) },
  });
};

// ═══════════════════════════════════════════════════════════
// Public Entry Points
// ═══════════════════════════════════════════════════════════

export const evaluate = (config: Config, source: JsonObject): JsonValue => {
  const parsed = ConfigSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => ({
      path: i.path.map(String).join('.') || 'root',
      message: i.message,
    }));
    throw new PrismError('Invalid config', ErrorCode.SCHEMA, { details: { issues } });
  }

  const desugared = desugar(parsed.data);
  return evaluateNode(desugared, { source, vars: {} });
};

export const evaluateSafe = (config: Config, source: JsonObject): Result<JsonValue> => {
  try {
    return { ok: true, data: evaluate(config, source) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
  }
};
