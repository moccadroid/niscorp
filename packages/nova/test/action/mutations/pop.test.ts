import { describe, expect, it } from 'vitest';
import { applyMutation } from '@action/mutations';

describe('applyMutation — pop', () => {
  it('removes the last element', () => {
    expect(applyMutation({ items: [1, 2, 3] }, { pop: 'items' })).toEqual({ items: [1, 2] });
  });
  it('passes through when target is not an array', () => {
    expect(applyMutation({ items: 'no' }, { pop: 'items' })).toEqual({ items: 'no' });
  });
});
