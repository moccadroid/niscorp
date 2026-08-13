import type { JsonValue, EvalContext, EvaluateFn } from '../types';
import type { FillNode, JoinNode, ToStringNode, InterpolateNode, TrimNode, LowerNode, UpperNode, SplitNode, ReplaceNode } from '../schemas';
import { PrismError, ErrorCode } from '../errors';
import { isJsonObject } from '../schemas/guards';

export const opJoin = (node: JoinNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const { parts, sep = '' } = node.$join;
  const evaluated = parts.map((p) => String(evaluate(p, context) ?? ''));
  return evaluated.join(sep);
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
  if (!isJsonObject(values))
    throw new PrismError('Expected object for $interpolate.values', ErrorCode.TYPE, { op: '$interpolate' });
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) =>
    String(values[key] ?? ''),
  );
};

// A counted phrase — `{ phrase: '{n} of {total}', slots: { n: 1, total: 12 } }`
// — filled with its own slots, in the source language. The TRANSLATED fill
// belongs to the render pass, which holds the book; this op exists for the
// places that compose a sentence from pattern values before any pass runs
// (a confirm sheet's message, a notification body). A nested pattern slot
// fills recursively; anything that is not a pattern passes through as the
// string it already was.
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
  if (typeof value !== 'string')
    throw new PrismError('Expected string for $trim', ErrorCode.TYPE, { op: '$trim' });
  return value.trim();
};

export const opLower = (node: LowerNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const value = evaluate(node.$lower, context);
  if (typeof value !== 'string')
    throw new PrismError('Expected string for $lower', ErrorCode.TYPE, { op: '$lower' });
  return value.toLowerCase();
};

export const opUpper = (node: UpperNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const value = evaluate(node.$upper, context);
  if (typeof value !== 'string')
    throw new PrismError('Expected string for $upper', ErrorCode.TYPE, { op: '$upper' });
  return value.toUpperCase();
};

export const opSplit = (node: SplitNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const value = evaluate(node.$split.value, context);
  if (typeof value !== 'string')
    throw new PrismError('Expected string for $split', ErrorCode.TYPE, { op: '$split' });
  return value.split(node.$split.sep);
};

export const opReplace = (node: ReplaceNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const value = evaluate(node.$replace.value, context);
  if (typeof value !== 'string')
    throw new PrismError('Expected string for $replace', ErrorCode.TYPE, { op: '$replace' });
  return value.replace(node.$replace.search, node.$replace.replacement);
};
