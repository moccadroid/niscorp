import { describe, expect, it } from 'vitest';
import {
  hasKey,
  isArray,
  isBoolean,
  isNonNull,
  isNumber,
  isObject,
  isString,
} from '@shared';

describe('guards', () => {
  it('isObject narrows plain objects only', () => {
    expect(isObject({})).toBe(true);
    expect(isObject({ a: 1 })).toBe(true);
    expect(isObject(null)).toBe(false);
    expect(isObject([])).toBe(false);
    expect(isObject('')).toBe(false);
    expect(isObject(1)).toBe(false);
  });

  it('isString / isNumber / isBoolean', () => {
    expect(isString('x')).toBe(true);
    expect(isString(1)).toBe(false);
    expect(isNumber(1)).toBe(true);
    expect(isBoolean(false)).toBe(true);
  });

  it('isArray', () => {
    expect(isArray([])).toBe(true);
    expect(isArray({})).toBe(false);
  });

  it('isNonNull', () => {
    expect(isNonNull(null)).toBe(false);
    expect(isNonNull(undefined)).toBe(false);
    expect(isNonNull(0)).toBe(true);
    expect(isNonNull('')).toBe(true);
  });

  it('hasKey narrows', () => {
    const obj: unknown = { foo: 1 };
    expect(hasKey(obj, 'foo')).toBe(true);
    expect(hasKey(obj, 'bar')).toBe(false);
    expect(hasKey(null, 'foo')).toBe(false);
  });
});
