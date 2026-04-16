// Stable JSON (key-sorted) + a deep-equality check built on top of it.
// Used by every demo that compares a live agent result to an expected
// value — sorting keys makes the check order-independent.

export const stableJson = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableJson(obj[k])}`).join(',')}}`;
};

export const deepEqual = (a: unknown, b: unknown): boolean => stableJson(a) === stableJson(b);
