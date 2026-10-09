import type { JsonValue, EvalContext, EvaluateFn } from '../types';
import type { AddNode, SubNode, MulNode, DivNode, ModNode, RoundNode, ToNumberNode } from '../schemas';
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

// The remainder with the sign of the divisor, not of the dividend as `%` gives
// it: what a bucket, a page or every-other-row wants is 0..n-1 for a negative
// number too.
export const opMod = (node: ModNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const [a, b] = requireNumbers(node.$mod, context, evaluate, '$mod');
  if (b === 0) throw new PrismError('Division by zero', ErrorCode.DIVISION_BY_ZERO, { op: '$mod' });
  const remainder = a % b;
  // `-5 % 5` is -0; JSON has no such number.
  if (remainder === 0) return 0;
  return remainder < 0 !== b < 0 ? remainder + b : remainder;
};

const ROUNDING = { nearest: Math.round, floor: Math.floor, ceil: Math.ceil };

export const opRound = (node: RoundNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const value = evaluate(node.$round.value, context);
  if (typeof value !== 'number')
    throw new PrismError('Expected number for $round', ErrorCode.TYPE, { op: '$round' });
  const digits = node.$round.digits ?? 0;
  const factor = Math.pow(10, digits);
  return ROUNDING[node.$round.mode ?? 'nearest'](value * factor) / factor;
};

// A number as it is written in digits, and nothing more of what JavaScript's
// Number() takes: not '', not '0x10', not 'Infinity'.
const NUMERIC_TEXT = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

const whatIs = (value: JsonValue): string => {
  if (typeof value === 'string') return JSON.stringify(value.slice(0, 40));
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'a list';
  return typeof value === 'object' ? 'an object' : String(value);
};

export const opToNumber = (node: ToNumberNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const value = evaluate(node.$toNumber.value, context);
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const text = value.trim();
    const parsed = NUMERIC_TEXT.test(text) ? Number(text) : Number.NaN;
    if (Number.isFinite(parsed)) return parsed;
  }
  if (node.$toNumber.fallback !== undefined) return evaluate(node.$toNumber.fallback, context);
  throw new PrismError(`Expected a number or numeric text for $toNumber, got ${whatIs(value)}`, ErrorCode.TYPE, { op: '$toNumber' });
};
