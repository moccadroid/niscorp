import { describe, it, expect } from 'vitest';
import { validate, evaluateSafe } from '../src';

describe('validate', () => {
  it('accepts valid config', () => {
    const result = validate({ $ref: '$.user.name' });
    expect(result.ok).toBe(true);
  });

  it('accepts plain object config', () => {
    const result = validate({ name: { $ref: '$.user.name' }, active: true });
    expect(result.ok).toBe(true);
  });

  it('accepts primitives', () => {
    expect(validate(42).ok).toBe(true);
    expect(validate('hello').ok).toBe(true);
    expect(validate(null).ok).toBe(true);
  });
});

describe('evaluateSafe', () => {
  it('returns ok on success', () => {
    const result = evaluateSafe({ $const: 42 }, {});
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toBe(42);
  });

  it('returns error on failure', () => {
    const result = evaluateSafe({ $ref: '$.missing' }, {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(Error);
  });
});
