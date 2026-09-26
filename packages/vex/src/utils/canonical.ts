import { createHash } from 'node:crypto';

// ═══════════════════════════════════════════════════════════════
// Canonical JSON — one text per value, whatever order its keys arrived in.
//
// Stored definitions round-trip through jsonb, which reorders object keys,
// and a value compared by its first serialisation would call every such row
// "changed". Keys are sorted recursively; arrays keep their order, because
// their order is part of what they mean.
// ═══════════════════════════════════════════════════════════════

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

export const hashText = (text: string): string => createHash('sha256').update(text).digest('hex');

export const canonicalHash = (value: unknown): string => hashText(canonicalText(value));
