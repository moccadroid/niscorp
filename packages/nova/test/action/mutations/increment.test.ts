import { describe, expect, it } from 'vitest';
import { applyMutation } from '@action/mutations';

describe('applyMutation — increment', () => {
  it('increments by 1 default', () => {
    expect(applyMutation({ n: 1 }, { increment: 'n' })).toEqual({ n: 2 });
  });
  it('increments by N', () => {
    expect(applyMutation({ n: 1 }, { increment: 'n', by: 5 })).toEqual({ n: 6 });
  });
  it('treats missing as 0', () => {
    expect(applyMutation({}, { increment: 'n' })).toEqual({ n: 1 });
  });
});
