export const readOwnKey = <T>(object: Readonly<Record<string, T>>, key: string): T | undefined =>
  Object.hasOwn(object, key) ? object[key] : undefined;

// `__proto__` is the one key a plain object inherits a setter for: assigned,
// it would replace the prototype instead of writing a key. Every other key is
// assigned, which is what keeps an object fast.
export const writeOwnKey = <T>(object: Record<string, T>, key: string, value: T): void => {
  if (key === '__proto__') Object.defineProperty(object, key, { value, enumerable: true, writable: true, configurable: true });
  else object[key] = value;
};
