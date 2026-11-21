import type { JsonObject, JsonValue } from './contracts.js';
import { types } from 'node:util';
import { ArtifactError } from './errors.js';
export const freezeOwned = <T>(value: T): T => {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeOwned(child);
    Object.freeze(value);
  }
  return value;
};
const refuse = (path: string, reason: string): never => {
  throw new ArtifactError('INVALID_JSON', reason, path);
};
const ownValue = (value: object, key: string, path: string): unknown => {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
    return refuse(path, 'JSON values must have enumerable data properties');
  }
  return descriptor.value;
};
export const snapshotJson = (value: unknown, maxDepth: number): JsonValue => {
  if (!Number.isSafeInteger(maxDepth) || maxDepth < 1) {
    throw new ArtifactError('INVALID_JSON', 'maxDepth must be a positive safe integer', '$');
  }
  const ancestors = new WeakSet<object>();
  const copy = (input: unknown, path: string, depth: number): JsonValue => {
    if (depth > maxDepth) {
      return refuse(path, 'JSON depth limit exceeded');
    }
    if (input === null || typeof input === 'string' || typeof input === 'boolean') return input;
    if (typeof input === 'number' && Number.isFinite(input)) return input;
    if (typeof input !== 'object' || input === null)
      return refuse(path, 'Expected a plain JSON value');
    if (types.isProxy(input)) return refuse(path, 'Proxies are not plain JSON');
    if (ancestors.has(input)) return refuse(path, 'Cyclic JSON is not supported');
    ancestors.add(input);
    try {
      if (Array.isArray(input)) {
        if (Object.getPrototypeOf(input) !== Array.prototype) {
          return refuse(path, 'Expected a plain JSON array');
        }
        const keys = Reflect.ownKeys(input);
        if (keys.length !== input.length + 1) {
          return refuse(path, 'JSON arrays cannot be sparse or carry extra properties');
        }
        const result: JsonValue[] = [];
        for (let index = 0; index < input.length; index += 1) {
          result.push(copy(ownValue(input, String(index), path), path + '/' + index, depth + 1));
        }
        Object.freeze(result);
        return result;
      }
      const prototype: unknown = Object.getPrototypeOf(input);
      if (prototype !== Object.prototype && prototype !== null)
        return refuse(path, 'Expected a plain JSON object');
      const entries: [string, JsonValue][] = [];
      const keys = Reflect.ownKeys(input);
      for (const key of keys) {
        if (typeof key !== 'string') return refuse(path, 'JSON objects cannot have symbol keys');
        const childPath = path + '/' + key.replaceAll('~', '~0').replaceAll('/', '~1');
        entries.push([key, copy(ownValue(input, key, childPath), childPath, depth + 1)]);
      }
      return Object.freeze(Object.fromEntries(entries));
    } finally {
      ancestors.delete(input);
    }
  };
  return copy(value, '$', 0);
};
export const snapshotObject = (value: unknown, maxDepth: number): JsonObject => {
  const result = snapshotJson(value, maxDepth);
  if (result === null || typeof result !== 'object' || Array.isArray(result)) {
    throw new ArtifactError('INVALID_JSON', 'Expected a JSON object', '$');
  }
  return result;
};
