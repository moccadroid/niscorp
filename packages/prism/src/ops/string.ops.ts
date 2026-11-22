import type { JsonValue, EvalContext, EvaluateFn } from '../types';
import type { FillNode, JoinNode, ToStringNode, InterpolateNode, TrimNode, LowerNode, UpperNode, SplitNode, ReplaceNode } from '../schemas';
import { ErrorCode, describeValue, failAt } from '../errors';
import { isJsonObject } from '../schemas/guards';
import { readOwnKey } from '../utils/own-keys';
import { TEXT_LIKE, isTextLike, refuseType, writtenNote } from './refuse';
import { measureString, type Budget } from '../engine/budget';

export const opJoin = (node: JoinNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const { parts, sep = '' } = node.$join;
  const list = evaluate(parts, context);
  if (!Array.isArray(list)) return refuseType({ node, op: '$join', field: 'parts', needs: 'a list', got: list, written: parts });
  const wrong = list.findIndex((part) => !isTextLike(part));
  if (wrong !== -1)
    return failAt(
      `$join.parts needs items that are ${TEXT_LIKE}, but item ${wrong} is ${describeValue(list[wrong])}.${Array.isArray(parts) ? writtenNote(parts[wrong]) : ''}`,
      ErrorCode.TYPE,
      { op: '$join' },
      { node, op: '$join', field: 'parts', form: true },
    );
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
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = readOwnKey(values, key) ?? '';
    if (!isTextLike(value))
      return failAt(
        `$interpolate.values needs ${TEXT_LIKE} for {{${key}}}, but "${key}" is ${describeValue(value)}.`,
        ErrorCode.TYPE,
        { op: '$interpolate' },
        { node, op: '$interpolate', field: 'values', form: true },
      );
    return String(value);
  });
};

// Measured at every level, not once at the end: a slot used twice in its
// phrase doubles the text at each level of nesting.
const fillOne = (value: JsonValue, budget: Budget | undefined, node: FillNode): JsonValue => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
  const { phrase, slots } = value as { phrase?: JsonValue; slots?: JsonValue };
  if (typeof phrase !== 'string' || !isJsonObject(slots)) return value;
  const filled = phrase.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (hole, name: string) => {
    const slot = readOwnKey(slots, name);
    if (slot === undefined || slot === null) return hole;
    const inner = fillOne(slot, budget, node);
    return typeof inner === 'object' ? hole : String(inner);
  });
  if (budget !== undefined) measureString(filled, budget, node);
  return filled;
};

export const opFill = (node: FillNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => fillOne(evaluate(node.$fill, context), context.budget, node);

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
  return node.$split.sep === '' ? Array.from(value) : value.split(node.$split.sep);
};

export const opReplace = (node: ReplaceNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const value = evaluate(node.$replace.value, context);
  if (typeof value !== 'string') return refuseType({ node, op: '$replace', field: 'value', needs: 'text', got: value, written: node.$replace.value });
  const { search, replacement, all } = node.$replace;
  // A function's answer is written as it is; a replacement string would read `$&` and `$$` as patterns.
  const written = (): string => replacement;
  return all === true ? value.replaceAll(search, written) : value.replace(search, written);
};
