import { describe, expect, it } from 'vitest';
import { createIdFactory } from '@shared';

describe('createIdFactory', () => {
  it('produces strings with the given prefix', () => {
    const f = createIdFactory('act');
    const id = f();
    expect(typeof id).toBe('string');
    expect(id.startsWith('act-')).toBe(true);
  });

  it('produces unique values across many calls', () => {
    const f = createIdFactory('x');
    const seen = new Set<string>();
    for (let i = 0; i < 500; i += 1) seen.add(f());
    expect(seen.size).toBe(500);
  });

  it('factories with different prefixes are independent', () => {
    const a = createIdFactory('a');
    const b = createIdFactory('b');
    expect(a().startsWith('a-')).toBe(true);
    expect(b().startsWith('b-')).toBe(true);
  });
});
