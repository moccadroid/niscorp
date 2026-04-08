import { describe, expect, it } from 'vitest';
import { applyMutation } from '@action/mutations';

describe('applyMutation — push', () => {
  it('appends to existing array', () => {
    expect(applyMutation({ items: [1, 2] }, { push: 'items', value: 3 })).toEqual({
      items: [1, 2, 3],
    });
  });
  it('initializes a missing array', () => {
    expect(applyMutation({}, { push: 'items', value: 1 })).toEqual({ items: [1] });
  });
  it('does not mutate the original array', () => {
    const orig = { items: [1, 2] };
    applyMutation(orig, { push: 'items', value: 3 });
    expect(orig.items).toEqual([1, 2]);
  });
});
