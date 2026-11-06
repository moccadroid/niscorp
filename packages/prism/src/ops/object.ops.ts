import type { JsonValue, JsonObject, EvalContext, EvaluateFn } from '../types';
import type { KeysNode, ValuesNode, FromEntriesNode, PickNode, OmitNode, TypeNode, LengthNode } from '../schemas';
import { ErrorCode, describeValue, failAt } from '../errors';
import { refuseType } from './refuse';
import { isJsonObject, isJsonArray } from '../schemas/guards';

export const opKeys = (node: KeysNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const value = evaluate(node.$keys, context);
  if (!isJsonObject(value)) return refuseType({ node, op: '$keys', needs: 'an object', got: value, written: node.$keys });
  return Object.keys(value);
};

export const opValues = (node: ValuesNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const value = evaluate(node.$values, context);
  if (!isJsonObject(value)) return refuseType({ node, op: '$values', needs: 'an object', got: value, written: node.$values });
  return Object.values(value);
};

export const opFromEntries = (node: FromEntriesNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const value = evaluate(node.$fromEntries, context);
  if (!isJsonArray(value)) return refuseType({ node, op: '$fromEntries', needs: 'a list of [key, value] pairs', got: value, written: node.$fromEntries });
  const result: JsonObject = {};
  for (let index = 0; index < value.length; index++) {
    const entry = value[index];
    if (!isJsonArray(entry) || entry.length < 2)
      return failAt(`$fromEntries needs a list of [key, value] pairs, but item ${index} is ${describeValue(entry)}.`, ErrorCode.TYPE, { op: '$fromEntries' }, { node, op: '$fromEntries', form: true });
    result[String(entry[0])] = entry[1]!;
  }
  return result;
};

export const opPick = (node: PickNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const value = evaluate(node.$pick.from, context);
  if (!isJsonObject(value)) return refuseType({ node, op: '$pick', field: 'from', needs: 'an object', got: value, written: node.$pick.from, contextOp: '$pick' });
  const result: JsonObject = {};
  for (const key of node.$pick.keys) {
    if (key in value) result[key] = value[key]!;
  }
  return result;
};

export const opOmit = (node: OmitNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const value = evaluate(node.$omit.from, context);
  if (!isJsonObject(value)) return refuseType({ node, op: '$omit', field: 'from', needs: 'an object', got: value, written: node.$omit.from, contextOp: '$omit' });
  const keysToOmit = new Set(node.$omit.keys);
  const result: JsonObject = {};
  for (const [k, v] of Object.entries(value)) {
    if (!keysToOmit.has(k)) result[k] = v;
  }
  return result;
};

export const opType = (node: TypeNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const value = evaluate(node.$type, context);
  if (value === null) return 'null';
  if (isJsonArray(value)) return 'array';
  return typeof value;
};

export const opLength = (node: LengthNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const value = evaluate(node.$length, context);
  if (typeof value === 'string') return value.length;
  if (isJsonArray(value)) return value.length;
  return refuseType({ node, op: '$length', needs: 'a list or text', got: value, written: node.$length });
};
