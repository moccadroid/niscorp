import type { JsonValue } from '@niscorp/prism';

export type PrismConfig = Record<string, unknown>;

export const row = (key: string): PrismConfig => ({
  $get: { from: { $var: 'row' }, path: [key] },
});

export const constOf = (value: JsonValue): PrismConfig => ({ $const: value });

export const dayDisplay = (value: unknown): PrismConfig => ({
  $date: { value, format: 'MMM D' },
});

// The round-trip turns the `unknown` the shell's `transform` receives into the
// `JsonValue` Prism wants without a type assertion, and drops what is not JSON.
export const toJson = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value ?? null));
