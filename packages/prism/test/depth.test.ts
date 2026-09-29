import { describe, expect, it } from 'vitest';
import { compile, validate } from '../src';

// A config a few thousand levels deep used to throw RangeError from inside
// the schema; it is refused like any other invalid config.
const deep = (): unknown => {
  let config: unknown = 1;
  for (let i = 0; i < 2000; i++) config = { $if: [true, config, 0] };
  return config;
};

describe('a config nested past the depth limit', () => {
  it('is refused by compile', async () => {
    await expect(compile(deep())).rejects.toThrow(/nests deeper than 256/);
  });

  it('is refused by validate', () => {
    const result = validate(deep());
    expect(result.ok).toBe(false);
  });
});
