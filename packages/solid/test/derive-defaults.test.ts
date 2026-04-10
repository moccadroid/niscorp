import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { deriveDefaults } from '../src/derive-defaults';

describe('deriveDefaults', () => {
  it('derives from object with defaults', () => {
    const schema = z.object({
      name: z.string().default(''),
      count: z.number().default(0),
      active: z.boolean().default(false),
    });
    expect(deriveDefaults(schema)).toEqual({ name: '', count: 0, active: false });
  });

  it('derives nested objects', () => {
    const schema = z.object({
      inner: z.object({
        value: z.string().default('hello'),
      }),
    });
    expect(deriveDefaults(schema)).toEqual({ inner: { value: 'hello' } });
  });

  it('optional becomes undefined', () => {
    const schema = z.object({
      opt: z.string().optional(),
    });
    expect(deriveDefaults(schema)).toEqual({ opt: undefined });
  });

  it('nullable becomes null', () => {
    const schema = z.object({
      nul: z.string().nullable(),
    });
    expect(deriveDefaults(schema)).toEqual({ nul: null });
  });

  it('array defaults to empty', () => {
    const schema = z.object({
      items: z.array(z.string()),
    });
    expect(deriveDefaults(schema)).toEqual({ items: [] });
  });

  it('bare string defaults to empty string', () => {
    expect(deriveDefaults(z.string())).toBe('');
  });

  it('bare number defaults to 0', () => {
    expect(deriveDefaults(z.number())).toBe(0);
  });

  it('bare boolean defaults to false', () => {
    expect(deriveDefaults(z.boolean())).toBe(false);
  });
});
