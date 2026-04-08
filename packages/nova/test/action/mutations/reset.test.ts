import { describe, expect, it } from 'vitest';
import { applyMutation } from '@action/mutations';

describe('applyMutation — reset', () => {
  it('restores from initial', () => {
    const next = applyMutation({ n: 9 }, { reset: 'n' }, { n: 0 });
    expect(next).toEqual({ n: 0 });
  });
  it('restores nested fields', () => {
    const next = applyMutation({ user: { name: 'X' } }, { reset: 'user.name' }, { user: { name: 'Ada' } });
    expect(next).toEqual({ user: { name: 'Ada' } });
  });
});
