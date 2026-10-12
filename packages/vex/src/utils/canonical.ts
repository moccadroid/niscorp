import { sha256Hex } from './sha256.js';

export const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    const sorted: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) sorted[key] = canonical(inner);
    return sorted;
  }
  return value;
};

export const canonicalText = (value: unknown): string => JSON.stringify(canonical(value)) ?? 'undefined';

export const hashText = (text: string): string => sha256Hex(text);

export const canonicalHash = (value: unknown): string => hashText(canonicalText(value));
