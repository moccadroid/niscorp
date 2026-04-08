import { describe, expect, it } from 'vitest';
import { applyMutation } from '@action/mutations';

describe('applyMutation — removeAt', () => {
  it('removes element at index', () => {
    expect(applyMutation({ items: ['a', 'b', 'c'] }, { removeAt: 'items', index: 1 })).toEqual({
      items: ['a', 'c'],
    });
  });
  it('passes through when target is not an array', () => {
    expect(applyMutation({ items: 1 }, { removeAt: 'items', index: 0 })).toEqual({ items: 1 });
  });
});
