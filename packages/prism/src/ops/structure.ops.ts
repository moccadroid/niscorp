import type { JsonValue, JsonObject, EvalContext, EvaluateFn } from '../types';
import type { MergeNode, CoalesceNode, CaseNode, EntriesOfNode, KeyByNode, GroupByNode } from '../schemas';
import { TEXT_LIKE, isTextLike, refuseType } from './refuse';
import { isJsonObject, isJsonArray } from '../schemas/guards';
import { loopScope } from './scope';

export const opMerge = (node: MergeNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const result: JsonObject = {};
  for (let index = 0; index < node.$merge.length; index++) {
    const part = node.$merge[index];
    const evaluated = evaluate(part, context);
    if (!isJsonObject(evaluated)) return refuseType({ node, op: '$merge', field: String(index), needs: 'an object', got: evaluated, written: part, contextOp: '$merge' });
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
  if (!isJsonObject(value)) return refuseType({ node, op: '$entriesOf', needs: 'an object', got: value, written: node.$entriesOf });
  return Object.entries(value).map(([k, v]) => [k, v]);
};

export const opKeyBy = (node: KeyByNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const { over, as, key: keyExpr } = node.$keyBy;
  const input = evaluate(over, context);
  if (!isJsonArray(input)) return refuseType({ node, op: '$keyBy', field: 'over', needs: 'a list', got: input, written: over, contextOp: '$keyBy' });
  const result: JsonObject = {};
  const { scope, vars } = loopScope(context);
  for (const item of input) {
    vars[as] = item;
    const key = evaluate(keyExpr, scope);
    if (!isTextLike(key)) return refuseType({ node, op: '$keyBy', field: 'key', needs: TEXT_LIKE, got: key, written: keyExpr, contextOp: '$keyBy' });
    result[String(key)] = item;
  }
  return result;
};

export const opGroupBy = (node: GroupByNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const { over, as, key: keyExpr } = node.$groupBy;
  const input = evaluate(over, context);
  if (!isJsonArray(input)) return refuseType({ node, op: '$groupBy', field: 'over', needs: 'a list', got: input, written: over, contextOp: '$groupBy' });
  const result: Record<string, JsonValue[]> = {};
  const { scope, vars } = loopScope(context);
  for (const item of input) {
    vars[as] = item;
    const value = evaluate(keyExpr, scope);
    if (!isTextLike(value)) return refuseType({ node, op: '$groupBy', field: 'key', needs: TEXT_LIKE, got: value, written: keyExpr, contextOp: '$groupBy' });
    const key = String(value);
    if (!result[key]) result[key] = [];
    result[key]!.push(item);
  }
  return result;
};
