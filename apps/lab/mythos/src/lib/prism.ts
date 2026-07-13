import type { JsonValue } from '@niscorp/prism';

// ───────────────────────────────────────────────────────────
// Builders for Prism config fragments shared by the read
// mappings (src/api/reads.ts) and the endpoint transforms
// (nova/**/*.prism.ts). Authored data: every function returns
// plain JSON that Prism validates at compile/evaluate time.
// ───────────────────────────────────────────────────────────

export type PrismConfig = Record<string, unknown>;

// `$get` on the loop variable a `$map`/`$reduce` bound as `row`.
export const row = (key: string): PrismConfig => ({
  $get: { from: { $var: 'row' }, path: [key] },
});

export const constOf = (value: JsonValue): PrismConfig => ({ $const: value });

// 'Jul 9' style display for a raw `YYYY-MM-DD` wire string.
export const dayDisplay = (value: unknown): PrismConfig => ({
  $date: { value, format: 'MMM D' },
});

// Round-trip JSON coercion: the transform socket receives `unknown`
// (action data, endpoint replies) and Prism wants `JsonValue`. All of
// it is JSON by construction; the round-trip proves it without a type
// assertion and drops anything that isn't.
export const toJson = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value ?? null));
