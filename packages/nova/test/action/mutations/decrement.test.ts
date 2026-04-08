import { describe, expect, it } from 'vitest';
import { applyMutation } from '@action/mutations';

describe('applyMutation — decrement', () => {
  it('decrements by N', () => {
    expect(applyMutation({ n: 5 }, { decrement: 'n', by: 2 })).toEqual({ n: 3 });
  });
  it('decrements by 1 default', () => {
    expect(applyMutation({ n: 5 }, { decrement: 'n' })).toEqual({ n: 4 });
  });
  it('treats missing as 0', () => {
    expect(applyMutation({}, { decrement: 'n' })).toEqual({ n: -1 });
  });
});
