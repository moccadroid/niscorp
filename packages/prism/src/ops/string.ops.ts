import type { JsonValue, EvalContext, EvaluateFn } from '../types';
import type { JoinNode, ToStringNode, InterpolateNode, TrimNode, LowerNode, UpperNode, SplitNode, ReplaceNode } from '../schemas';
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
