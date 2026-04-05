import type { JsonValue, JsonObject, EvalContext, EvaluateFn } from '../types';
import type { KeysNode, ValuesNode, FromEntriesNode, PickNode, OmitNode, TypeNode, LengthNode } from '../schemas';
import { PrismError, ErrorCode } from '../errors';
import { isJsonObject, isJsonArray } from '../schemas/guards';

export const opKeys = (node: KeysNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const value = evaluate(node.$keys, context);
  if (!isJsonObject(value))
    throw new PrismError('Expected object for $keys', ErrorCode.TYPE, { op: '$keys' });
  return Object.keys(value);
};

export const opValues = (node: ValuesNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const value = evaluate(node.$values, context);
  if (!isJsonObject(value))
    throw new PrismError('Expected object for $values', ErrorCode.TYPE, { op: '$values' });
  return Object.values(value);
};

export const opFromEntries = (node: FromEntriesNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const value = evaluate(node.$fromEntries, context);
  if (!isJsonArray(value))
    throw new PrismError('Expected array for $fromEntries', ErrorCode.TYPE, { op: '$fromEntries' });
  const result: JsonObject = {};
  for (const entry of value) {
    if (!isJsonArray(entry) || entry.length < 2)
      throw new PrismError('Expected [key, value] pairs for $fromEntries', ErrorCode.TYPE, { op: '$fromEntries' });
    result[String(entry[0])] = entry[1]!;
  }
  return result;
};

export const opPick = (node: PickNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const value = evaluate(node.$pick.from, context);
  if (!isJsonObject(value))
    throw new PrismError('Expected object for $pick', ErrorCode.TYPE, { op: '$pick' });
  const result: JsonObject = {};
  for (const key of node.$pick.keys) {
    if (key in value) result[key] = value[key]!;
  }
  return result;
};

export const opOmit = (node: OmitNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const value = evaluate(node.$omit.from, context);
  if (!isJsonObject(value))
    throw new PrismError('Expected object for $omit', ErrorCode.TYPE, { op: '$omit' });
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
  throw new PrismError('Expected array or string for $length', ErrorCode.TYPE, { op: '$length' });
};
