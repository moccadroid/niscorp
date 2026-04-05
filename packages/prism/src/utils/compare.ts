import type { JsonValue } from '../types';

// ═══════════════════════════════════════════════════════════
// Deep Equality (JSON-safe)
// ═══════════════════════════════════════════════════════════

export const jsonEqual = (a: JsonValue, b: JsonValue): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

// ═══════════════════════════════════════════════════════════
// Ordered Comparison (numbers and strings)
// ═══════════════════════════════════════════════════════════

export const compare = (a: JsonValue, b: JsonValue): number | undefined => {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  return undefined;
};
