import type { JsonValue } from '../types';

// ═══════════════════════════════════════════════════════════
// Deep Equality (JSON-safe)
// ═══════════════════════════════════════════════════════════

// Two values are equal when their JSON text is. That text is only needed for
// two different objects: the same value is equal, and a scalar is equal to
// nothing but itself. Writing both out to compare `'paid'` with `'paid'` was a
// third of the time of a filter over 10,000 rows.
export const jsonEqual = (a: JsonValue, b: JsonValue): boolean => {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  return JSON.stringify(a) === JSON.stringify(b);
};

// ═══════════════════════════════════════════════════════════
// Ordered Comparison (numbers and strings)
// ═══════════════════════════════════════════════════════════

export const compare = (a: JsonValue, b: JsonValue): number | undefined => {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  return undefined;
};
