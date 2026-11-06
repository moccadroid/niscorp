import type { JsonValue, EvalContext, EvaluateFn } from '../types';
import type { FillNode, JoinNode, ToStringNode, InterpolateNode, TrimNode, LowerNode, UpperNode, SplitNode, ReplaceNode } from '../schemas';
import { isJsonObject } from '../schemas/guards';
import { refuseType } from './refuse';

export const opJoin = (node: JoinNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const { parts, sep = '' } = node.$join;
  const list = evaluate(parts, context);
  if (!Array.isArray(list)) return refuseType({ node, op: '$join', field: 'parts', needs: 'a list', got: list, written: parts });
  return list.map((p) => String(p ?? '')).join(sep);
};

export const opToString = (node: ToStringNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const value = evaluate(node.$toString, context);
  if (value === null) return 'null';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

export const opInterpolate = (node: InterpolateNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const { template, values: valuesNode } = node.$interpolate;
  const values = evaluate(valuesNode, context);
  if (!isJsonObject(values)) return refuseType({ node, op: '$interpolate', field: 'values', needs: 'an object', got: values, written: valuesNode });
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) =>
    String(values[key] ?? ''),
  );
};

const fillOne = (value: JsonValue): JsonValue => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
  const { phrase, slots } = value as { phrase?: JsonValue; slots?: JsonValue };
  if (typeof phrase !== 'string' || !isJsonObject(slots)) return value;
  return phrase.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (hole, name: string) => {
    const slot = slots[name];
    if (slot === undefined || slot === null) return hole;
    const filled = fillOne(slot);
    return typeof filled === 'object' ? hole : String(filled);
  });
};

export const opFill = (node: FillNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => fillOne(evaluate(node.$fill, context));

export const opTrim = (node: TrimNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const value = evaluate(node.$trim, context);
  if (typeof value !== 'string') return refuseType({ node, op: '$trim', needs: 'text', got: value, written: node.$trim });
  return value.trim();
};

export const opLower = (node: LowerNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const value = evaluate(node.$lower, context);
  if (typeof value !== 'string') return refuseType({ node, op: '$lower', needs: 'text', got: value, written: node.$lower });
  return value.toLowerCase();
};

export const opUpper = (node: UpperNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const value = evaluate(node.$upper, context);
  if (typeof value !== 'string') return refuseType({ node, op: '$upper', needs: 'text', got: value, written: node.$upper });
  return value.toUpperCase();
};

export const opSplit = (node: SplitNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const value = evaluate(node.$split.value, context);
  if (typeof value !== 'string') return refuseType({ node, op: '$split', field: 'value', needs: 'text', got: value, written: node.$split.value });
  return value.split(node.$split.sep);
};

export const opReplace = (node: ReplaceNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const value = evaluate(node.$replace.value, context);
  if (typeof value !== 'string') return refuseType({ node, op: '$replace', field: 'value', needs: 'text', got: value, written: node.$replace.value });
  const { search, replacement, all } = node.$replace;
  return all === true ? value.replaceAll(search, replacement) : value.replace(search, replacement);
};
