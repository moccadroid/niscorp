// What a plain object inherits is Object.prototype's: functions, and the
// `__proto__` accessor. A value that is neither is the object's own, so only
// those two are asked about, which keeps a read as fast as a plain one.
export const readOwnKey = <T>(object: Readonly<Record<string, T>>, key: string): T | undefined => {
  const value = object[key];
  if (value === undefined || (typeof value !== 'function' && key !== '__proto__')) return value;
  return Object.hasOwn(object, key) ? value : undefined;
};

// `__proto__` is the one key a plain object inherits a setter for: assigned,
// it would replace the prototype instead of writing a key. Every other key is
// assigned, which is what keeps an object fast.
export const writeOwnKey = <T>(object: Record<string, T>, key: string, value: T): void => {
  if (key === '__proto__') Object.defineProperty(object, key, { value, enumerable: true, writable: true, configurable: true });
  else object[key] = value;
};
