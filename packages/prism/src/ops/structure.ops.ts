import type { JsonValue, JsonObject, EvalContext, EvaluateFn } from '../types';
import type { MergeNode, CoalesceNode, CaseNode, EntriesOfNode, KeyByNode, GroupByNode } from '../schemas';
import { PrismError, ErrorCode } from '../errors';
import { isJsonObject, isJsonArray } from '../schemas/guards';

export const opMerge = (node: MergeNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const result: JsonObject = {};
  for (const part of node.$merge) {
    const evaluated = evaluate(part, context);
    if (!isJsonObject(evaluated))
      throw new PrismError('Expected object for $merge element', ErrorCode.TYPE, { op: '$merge' });
    Object.assign(result, evaluated);
  }
  return result;
};

export const opCoalesce = (node: CoalesceNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  for (const candidate of node.$coalesce) {
    const value = evaluate(candidate, context);
    if (value !== null && value !== undefined) return value;
  }
  return null;
};

export const opCase = (node: CaseNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  for (const branch of node.$case.branches) {
    const condition = evaluate(branch.when, context);
    if (condition) return evaluate(branch.then, context);
  }
  if (node.$case.else !== undefined) return evaluate(node.$case.else, context);
  return null;
};

export const opEntriesOf = (node: EntriesOfNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const value = evaluate(node.$entriesOf, context);
  if (!isJsonObject(value))
    throw new PrismError('Expected object for $entriesOf', ErrorCode.TYPE, { op: '$entriesOf' });
  return Object.entries(value).map(([k, v]) => [k, v]);
};

export const opKeyBy = (node: KeyByNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const { over, as, key: keyExpr } = node.$keyBy;
  const input = evaluate(over, context);
  if (!isJsonArray(input))
    throw new PrismError('Expected array for $keyBy.over', ErrorCode.TYPE, { op: '$keyBy' });
  const result: JsonObject = {};
  for (const item of input) {
    const key = evaluate(keyExpr, { ...context, vars: { ...context.vars, [as]: item } });
    result[String(key)] = item;
  }
  return result;
};

export const opGroupBy = (node: GroupByNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const { over, as, key: keyExpr } = node.$groupBy;
  const input = evaluate(over, context);
  if (!isJsonArray(input))
    throw new PrismError('Expected array for $groupBy.over', ErrorCode.TYPE, { op: '$groupBy' });
  const result: Record<string, JsonValue[]> = {};
  for (const item of input) {
    const key = String(evaluate(keyExpr, { ...context, vars: { ...context.vars, [as]: item } }));
    if (!result[key]) result[key] = [];
    result[key]!.push(item);
  }
  return result;
};
