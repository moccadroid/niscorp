import type { JsonValue, EvalContext, EvaluateFn } from '../types';
import type {
  EqNode, NeqNode, GtNode, GteNode, LtNode, LteNode,
  EmptyNode, StartsWithNode, EndsWithNode, ContainsNode,
} from '../schemas';
import { PrismError, ErrorCode } from '../errors';
import { jsonEqual, compare } from '../utils/compare';
import { isJsonObject, isJsonArray } from '../schemas/guards';

export const opEq = (node: EqNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const a = evaluate(node.$eq[0], context);
  const b = evaluate(node.$eq[1], context);
  return jsonEqual(a, b);
};

export const opNeq = (node: NeqNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const a = evaluate(node.$neq[0], context);
  const b = evaluate(node.$neq[1], context);
  return !jsonEqual(a, b);
};

const compareOp = (
  pair: [unknown, unknown],
  context: EvalContext,
  evaluate: EvaluateFn,
  op: string,
  test: (cmp: number) => boolean,
): JsonValue => {
  const a = evaluate(pair[0], context);
  const b = evaluate(pair[1], context);
  const cmp = compare(a, b);
  if (cmp === undefined)
    throw new PrismError(`Cannot compare values for ${op}`, ErrorCode.TYPE, { op });
  return test(cmp);
};

export const opGt = (node: GtNode, ctx: EvalContext, ev: EvaluateFn): JsonValue =>
  compareOp(node.$gt, ctx, ev, '$gt', (c) => c > 0);

export const opGte = (node: GteNode, ctx: EvalContext, ev: EvaluateFn): JsonValue =>
  compareOp(node.$gte, ctx, ev, '$gte', (c) => c >= 0);

export const opLt = (node: LtNode, ctx: EvalContext, ev: EvaluateFn): JsonValue =>
  compareOp(node.$lt, ctx, ev, '$lt', (c) => c < 0);

export const opLte = (node: LteNode, ctx: EvalContext, ev: EvaluateFn): JsonValue =>
  compareOp(node.$lte, ctx, ev, '$lte', (c) => c <= 0);

export const opEmpty = (node: EmptyNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const value = evaluate(node.$empty, context);
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.length === 0;
  if (isJsonArray(value)) return value.length === 0;
  if (isJsonObject(value)) return Object.keys(value).length === 0;
  return false;
};

export const opStartsWith = (node: StartsWithNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const value = evaluate(node.$startsWith.value, context);
  const prefix = evaluate(node.$startsWith.prefix, context);
  if (typeof value !== 'string' || typeof prefix !== 'string')
    throw new PrismError('Expected strings for $startsWith', ErrorCode.TYPE, { op: '$startsWith' });
  return value.startsWith(prefix);
};

export const opEndsWith = (node: EndsWithNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const value = evaluate(node.$endsWith.value, context);
  const suffix = evaluate(node.$endsWith.suffix, context);
  if (typeof value !== 'string' || typeof suffix !== 'string')
    throw new PrismError('Expected strings for $endsWith', ErrorCode.TYPE, { op: '$endsWith' });
  return value.endsWith(suffix);
};

export const opContains = (node: ContainsNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const value = evaluate(node.$contains.value, context);
  const search = evaluate(node.$contains.search, context);
  if (typeof value !== 'string' || typeof search !== 'string')
    throw new PrismError('Expected strings for $contains', ErrorCode.TYPE, { op: '$contains' });
  return value.includes(search);
};
