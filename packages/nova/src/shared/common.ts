export type Unsubscribe = () => void;

export type HandlerErrorConfig = {
  onHandlerError?: (error: unknown) => void;
};

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

// What every object inherits from Object.prototype (toString, constructor, __proto__) is not an entry; what a record inherits from a prototype of its own is.
export const isEntry = (record: object, name: string): boolean => {
  for (let at: object | null = record; at !== null && at !== Object.prototype; at = Object.getPrototypeOf(at)) {
    if (Object.hasOwn(at, name)) return true;
  }
  return false;
};

export const ownEntry = <T>(record: Record<string, T> | undefined, name: string): T | undefined =>
  record !== undefined && isEntry(record, name) ? record[name] : undefined;
