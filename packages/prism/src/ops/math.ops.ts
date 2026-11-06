import type { JsonValue, EvalContext, EvaluateFn } from '../types';
import type { AddNode, SubNode, MulNode, DivNode, ModNode, RoundNode, ToNumberNode } from '../schemas';
import { ErrorCode, describeValue, failAt } from '../errors';
import { refuseType, writtenNote } from './refuse';

const requireNumbers = (node: object, pair: [unknown, unknown], context: EvalContext, evaluate: EvaluateFn, op: string): [number, number] => {
  const a = evaluate(pair[0], context);
  const b = evaluate(pair[1], context);
  if (typeof a !== 'number' || typeof b !== 'number') {
    const wrong = typeof a === 'number' ? 1 : 0;
    return failAt(
      `${op} needs two numbers, but got ${describeValue(a)} and ${describeValue(b)}.${writtenNote(pair[wrong])}`,
      ErrorCode.TYPE,
      { op },
      { node, op, field: String(wrong), form: true },
    );
  }
  return [a, b];
};

const refuseZero = (node: object, op: string): never =>
  failAt(`Division by zero: the second value of ${op} is 0.`, ErrorCode.DIVISION_BY_ZERO, { op }, { node, op, field: '1', form: false });

export const opAdd = (node: AddNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const [a, b] = requireNumbers(node, node.$add, context, evaluate, '$add');
  return a + b;
};

export const opSub = (node: SubNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const [a, b] = requireNumbers(node, node.$sub, context, evaluate, '$sub');
  return a - b;
};

export const opMul = (node: MulNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const [a, b] = requireNumbers(node, node.$mul, context, evaluate, '$mul');
  return a * b;
};

export const opDiv = (node: DivNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const [a, b] = requireNumbers(node, node.$div, context, evaluate, '$div');
  if (b === 0) return refuseZero(node, '$div');
  return a / b;
};

// The remainder with the sign of the divisor, not of the dividend as `%` gives it.
export const opMod = (node: ModNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const [a, b] = requireNumbers(node, node.$mod, context, evaluate, '$mod');
  if (b === 0) return refuseZero(node, '$mod');
  const remainder = a % b;
  // `-5 % 5` is -0; JSON has no such number.
  if (remainder === 0) return 0;
  return remainder < 0 !== b < 0 ? remainder + b : remainder;
};

const ROUNDING = { nearest: Math.round, floor: Math.floor, ceil: Math.ceil };

export const opRound = (node: RoundNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const value = evaluate(node.$round.value, context);
  if (typeof value !== 'number') return refuseType({ node, op: '$round', field: 'value', needs: 'a number', got: value, written: node.$round.value });
  const digits = node.$round.digits ?? 0;
  const factor = Math.pow(10, digits);
  return ROUNDING[node.$round.mode ?? 'nearest'](value * factor) / factor;
};

// A number as it is written in digits, not all that Number() takes: not '',
// not '0x10', not 'Infinity'.
const NUMERIC_TEXT = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

export const opToNumber = (node: ToNumberNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const value = evaluate(node.$toNumber.value, context);
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const text = value.trim();
    const parsed = NUMERIC_TEXT.test(text) ? Number(text) : Number.NaN;
    if (Number.isFinite(parsed)) return parsed;
  }
  if (node.$toNumber.fallback !== undefined) return evaluate(node.$toNumber.fallback, context);
  return refuseType({ node, op: '$toNumber', field: 'value', needs: 'a number or numeric text', got: value, written: node.$toNumber.value, contextOp: '$toNumber' });
};
