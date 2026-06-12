import { describe, expect, it } from 'vitest';
import { applyMutation } from '@action/mutations';

describe('applyMutation — move', () => {
  it('moves an element forward', () => {
    expect(applyMutation({ items: ['a', 'b', 'c'] }, { move: 'items', from: 0, to: 2 })).toEqual({
      items: ['b', 'c', 'a'],
    });
  });

  it('moves an element backward', () => {
    expect(applyMutation({ items: ['a', 'b', 'c'] }, { move: 'items', from: 2, to: 0 })).toEqual({
      items: ['c', 'a', 'b'],
    });
  });

  it('passes through on out-of-range source', () => {
    expect(applyMutation({ items: ['a'] }, { move: 'items', from: 5, to: 0 })).toEqual({ items: ['a'] });
  });

  it('passes through when target is not an array', () => {
    expect(applyMutation({ items: 1 }, { move: 'items', from: 0, to: 1 })).toEqual({ items: 1 });
  });
});
