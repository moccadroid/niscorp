// ═══════════════════════════════════════════════════════════
// Shared primitives — common types + generic guards used to
// narrow `unknown` across the package.
// ═══════════════════════════════════════════════════════════

export type Unsubscribe = () => void;

export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const isString = (value: unknown): value is string => typeof value === 'string';

export const isNumber = (value: unknown): value is number => typeof value === 'number';

export const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';

export const isArray = (value: unknown): value is unknown[] => Array.isArray(value);

export const isNonNull = <T>(value: T | null | undefined): value is T =>
  value !== null && value !== undefined;

export const hasKey = <K extends string>(
  obj: unknown,
  key: K,
): obj is Record<K, unknown> => isObject(obj) && key in obj;
