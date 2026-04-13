// ═══════════════════════════════════════════════════════════
// Condition evaluator — Prism-style $-operators for rules
// ═══════════════════════════════════════════════════════════
//
// Evaluates declarative JSON conditions against a scope object.
// Operators: $eq, $neq, $gt, $gte, $lt, $lte, $and, $or, $not.
//
// Path resolution: strings starting with "$" are resolved against
// the scope via the shared resolvePath utility.
// "$watch.toolCalls" → scope.watch.toolCalls.
// Anything else is a literal value.
//
// The evaluator accepts `unknown` for the condition parameter
// because conditions are Zod-validated at defineRule() time —
// by the time they reach the evaluator, they are known-good.
// The evaluator does runtime dispatch on operator keys, not
// static type narrowing, so a hand-written discriminated union
// adds no safety. This avoids `as` casts between the Zod-inferred
// type and a hand-written mirror type.

import { resolvePath } from '../utils/resolve-path';

// ───────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────

// Scope is what conditions are evaluated against. Path references
// like "$watch.toolCalls" resolve against this object.
export type ConditionScope = Record<string, Record<string, unknown> | unknown>;

// ───────────────────────────────────────────────────────────
// Value resolution
// ───────────────────────────────────────────────────────────

const resolveValue = (value: unknown, scope: ConditionScope): unknown => {
  if (typeof value === 'string' && value.startsWith('$')) {
    return resolvePath(scope, value.slice(1));
  }
  return value;
};

// ───────────────────────────────────────────────────────────
// Comparison
// ───────────────────────────────────────────────────────────

const compare = (a: unknown, b: unknown): number | undefined => {
  if (typeof a === 'number' && typeof b === 'number') {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }
  if (typeof a === 'string' && typeof b === 'string') {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }
  return undefined;
};

const deepEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
};

// ───────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const asPair = (value: unknown): [unknown, unknown] | undefined => {
  if (!Array.isArray(value) || value.length !== 2) return undefined;
  return [value[0], value[1]];
};

// ───────────────────────────────────────────────────────────
// Evaluator
// ───────────────────────────────────────────────────────────

export const evaluateCondition = (condition: unknown, scope: ConditionScope): boolean => {
  if (!isObject(condition)) return false;

  // $and — short-circuit
  if ('$and' in condition && Array.isArray(condition.$and)) {
    return condition.$and.every((c: unknown) => evaluateCondition(c, scope));
  }

  // $or — short-circuit
  if ('$or' in condition && Array.isArray(condition.$or)) {
    return condition.$or.some((c: unknown) => evaluateCondition(c, scope));
  }

  // $not
  if ('$not' in condition) {
    return !evaluateCondition(condition.$not, scope);
  }

  // Binary comparison operators
  if ('$eq' in condition) {
    const pair = asPair(condition.$eq);
    if (!pair) return false;
    return deepEqual(resolveValue(pair[0], scope), resolveValue(pair[1], scope));
  }
  if ('$neq' in condition) {
    const pair = asPair(condition.$neq);
    if (!pair) return false;
    return !deepEqual(resolveValue(pair[0], scope), resolveValue(pair[1], scope));
  }
  if ('$gt' in condition) {
    const pair = asPair(condition.$gt);
    if (!pair) return false;
    const cmp = compare(resolveValue(pair[0], scope), resolveValue(pair[1], scope));
    return cmp !== undefined && cmp > 0;
  }
  if ('$gte' in condition) {
    const pair = asPair(condition.$gte);
    if (!pair) return false;
    const cmp = compare(resolveValue(pair[0], scope), resolveValue(pair[1], scope));
    return cmp !== undefined && cmp >= 0;
  }
  if ('$lt' in condition) {
    const pair = asPair(condition.$lt);
    if (!pair) return false;
    const cmp = compare(resolveValue(pair[0], scope), resolveValue(pair[1], scope));
    return cmp !== undefined && cmp < 0;
  }
  if ('$lte' in condition) {
    const pair = asPair(condition.$lte);
    if (!pair) return false;
    const cmp = compare(resolveValue(pair[0], scope), resolveValue(pair[1], scope));
    return cmp !== undefined && cmp <= 0;
  }

  return false;
};
