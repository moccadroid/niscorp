import type { JsonValue, EvalContext, EvaluateFn } from '../types';
import type { MapNode, FilterNode, ReduceNode, SliceNode, FlattenNode, UniqueNode, SortByNode } from '../schemas';
import { ErrorCode, describeValue, failAt } from '../errors';
import { isJsonArray } from '../schemas/guards';
import { compare } from '../utils/compare';
import { measure } from '../engine/budget';
import { loopScope } from './scope';
import { refuseType } from './refuse';

const requireArray = (value: JsonValue, node: object, op: string, field: string | undefined, written: unknown): JsonValue[] => {
  if (!isJsonArray(value))
    return refuseType({ node, op, ...(field === undefined ? {} : { field }), needs: 'a list', got: value, written, contextOp: field === undefined ? op : `${op}.${field}` });
  return value;
};

export const opMap = (node: MapNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const { over, as, body } = node.$map;
  const input = requireArray(evaluate(over, context), node, '$map', 'over', over);
  const result: JsonValue[] = [];
  const { scope, vars } = loopScope(context);
  for (const item of input) {
    vars[as] = item;
    result.push(evaluate(body, scope));
  }
  return result;
};

export const opFilter = (node: FilterNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const { over, as, when } = node.$filter;
  const input = requireArray(evaluate(over, context), node, '$filter', 'over', over);
  const result: JsonValue[] = [];
  const { scope, vars } = loopScope(context);
  for (const item of input) {
    vars[as] = item;
    const condition = evaluate(when, scope);
    if (condition) result.push(item);
  }
  return result;
};

export const opReduce = (node: ReduceNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const { over, as, acc: accName = 'acc', init, body } = node.$reduce;
  const input = requireArray(evaluate(over, context), node, '$reduce', 'over', over);
  let accumulator = evaluate(init, context);
  const { scope, vars } = loopScope(context);
  for (const item of input) {
    vars[as] = item;
    vars[accName] = accumulator;
    accumulator = evaluate(body, scope);
    // Fed back each item: a body of [acc, acc] doubles it.
    measure(accumulator, context.budget, node);
  }
  return accumulator;
};

export const opSlice = (node: SliceNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const { from, start, end } = node.$slice;
  const input = evaluate(from, context);
  if (typeof input === 'string') return input.slice(start, end);
  if (isJsonArray(input)) return input.slice(start, end);
  return refuseType({ node, op: '$slice', field: 'from', needs: 'a list or text', got: input, written: from, contextOp: '$slice' });
};

export const opFlatten = (node: FlattenNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const input = requireArray(evaluate(node.$flatten, context), node, '$flatten', undefined, node.$flatten);
  const result: JsonValue[] = [];
  for (const item of input) {
    if (isJsonArray(item)) result.push(...item);
    else result.push(item);
  }
  return result;
};

export const opUnique = (node: UniqueNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const input = requireArray(evaluate(node.$unique, context), node, '$unique', undefined, node.$unique);
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

const sortKey = (key: JsonValue, node: SortByNode): JsonValue => {
  if (key !== null && typeof key === 'object') {
    return failAt(
      `$sortBy.by answered ${describeValue(key)}; a sort key is a string or a number. To sort by two keys, sort by the second and then by the first: the sort keeps the order of equal items.`,
      ErrorCode.TYPE,
      { op: '$sortBy' },
      { node, op: '$sortBy', field: 'by', form: true },
    );
  }
  return key;
};

// Every key has a place, by kind first: a key equal to every key of another
// kind would land wherever it happened to be compared. An item with no key
// (null) is last whichever way the sort runs.
const NULL_KIND = 3;
const kindOf = (key: JsonValue): number => (key === null ? NULL_KIND : typeof key === 'number' ? 0 : typeof key === 'string' ? 1 : 2);

export const opSortBy = (node: SortByNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const { over, as, by, dir = 'asc' } = node.$sortBy;
  const input = requireArray(evaluate(over, context), node, '$sortBy', 'over', over);

  const { scope, vars } = loopScope(context);
  const keyed = input.map((item) => {
    vars[as] = item;
    return { item, key: sortKey(evaluate(by, scope), node) };
  });

  keyed.sort((a, b) => {
    const kindA = kindOf(a.key);
    const kindB = kindOf(b.key);
    if (kindA === NULL_KIND || kindB === NULL_KIND) return kindA - kindB;
    const cmp = kindA !== kindB ? kindA - kindB : (compare(a.key, b.key) ?? Number(a.key) - Number(b.key));
    return dir === 'desc' ? -cmp : cmp;
  });

  return keyed.map((k) => k.item);
};
