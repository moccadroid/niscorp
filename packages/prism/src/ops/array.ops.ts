import type { JsonValue, EvalContext, EvaluateFn } from '../types';
import type { MapNode, FilterNode, ReduceNode, SliceNode, FlattenNode, UniqueNode, SortByNode } from '../schemas';
import { PrismError, ErrorCode } from '../errors';
import { isJsonArray } from '../schemas/guards';
import { compare } from '../utils/compare';

const requireArray = (value: JsonValue, op: string): JsonValue[] => {
  if (!isJsonArray(value))
    throw new PrismError(`Expected array for ${op}`, ErrorCode.TYPE, { op });
  return value;
};

export const opMap = (node: MapNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const { over, as, body } = node.$map;
  const input = requireArray(evaluate(over, context), '$map.over');
  const result: JsonValue[] = [];
  for (const item of input) {
    result.push(evaluate(body, { ...context, vars: { ...context.vars, [as]: item } }));
  }
  return result;
};

export const opFilter = (node: FilterNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const { over, as, when } = node.$filter;
  const input = requireArray(evaluate(over, context), '$filter.over');
  const result: JsonValue[] = [];
  for (const item of input) {
    const condition = evaluate(when, { ...context, vars: { ...context.vars, [as]: item } });
    if (condition) result.push(item);
  }
  return result;
};

export const opReduce = (node: ReduceNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const { over, as, acc: accName = 'acc', init, body } = node.$reduce;
  const input = requireArray(evaluate(over, context), '$reduce.over');
  let accumulator = evaluate(init, context);
  for (const item of input) {
    accumulator = evaluate(body, {
      ...context,
      vars: { ...context.vars, [as]: item, [accName]: accumulator },
    });
  }
  return accumulator;
};

export const opSlice = (node: SliceNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const { from, start, end } = node.$slice;
  const input = evaluate(from, context);
  if (typeof input === 'string') return input.slice(start, end);
  if (isJsonArray(input)) return input.slice(start, end);
  throw new PrismError('Expected array or string for $slice', ErrorCode.TYPE, { op: '$slice' });
};

export const opFlatten = (node: FlattenNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const input = requireArray(evaluate(node.$flatten, context), '$flatten');
  const result: JsonValue[] = [];
  for (const item of input) {
    if (isJsonArray(item)) result.push(...item);
    else result.push(item);
  }
  return result;
};

export const opUnique = (node: UniqueNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const input = requireArray(evaluate(node.$unique, context), '$unique');
  const seen = new Set<string>();
  const result: JsonValue[] = [];
  for (const item of input) {
    const key = JSON.stringify(item);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
};

export const opSortBy = (node: SortByNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const { over, as, by, dir = 'asc' } = node.$sortBy;
  const input = requireArray(evaluate(over, context), '$sortBy.over');

  const keyed = input.map((item) => ({
    item,
    key: evaluate(by, { ...context, vars: { ...context.vars, [as]: item } }),
  }));

  keyed.sort((a, b) => {
    const cmp = compare(a.key, b.key);
    if (cmp === undefined) return 0;
    return dir === 'desc' ? -cmp : cmp;
  });

  return keyed.map((k) => k.item);
};
