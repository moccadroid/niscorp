import type { JsonValue, EvalContext, EvaluateFn } from '../types';
import type { AddNode, SubNode, MulNode, DivNode, RoundNode } from '../schemas';
import { PrismError, ErrorCode } from '../errors';

const requireNumbers = (node: [unknown, unknown], context: EvalContext, evaluate: EvaluateFn, op: string): [number, number] => {
  const a = evaluate(node[0], context);
  const b = evaluate(node[1], context);
  if (typeof a !== 'number' || typeof b !== 'number')
    throw new PrismError(`Expected numbers for ${op}`, ErrorCode.TYPE, { op });
  return [a, b];
};

export const opAdd = (node: AddNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const [a, b] = requireNumbers(node.$add, context, evaluate, '$add');
  return a + b;
};

export const opSub = (node: SubNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const [a, b] = requireNumbers(node.$sub, context, evaluate, '$sub');
  return a - b;
};

export const opMul = (node: MulNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const [a, b] = requireNumbers(node.$mul, context, evaluate, '$mul');
  return a * b;
};

export const opDiv = (node: DivNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const [a, b] = requireNumbers(node.$div, context, evaluate, '$div');
  if (b === 0) throw new PrismError('Division by zero', ErrorCode.DIVISION_BY_ZERO, { op: '$div' });
  return a / b;
};

export const opRound = (node: RoundNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const value = evaluate(node.$round.value, context);
  if (typeof value !== 'number')
    throw new PrismError('Expected number for $round', ErrorCode.TYPE, { op: '$round' });
  const digits = node.$round.digits ?? 0;
  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
};
