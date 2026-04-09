import { describe, expect, it } from 'vitest';
import { applyMutation, applyMutations } from '@action/mutations';

describe('applyMutations — registry dispatcher', () => {
  it('runs a sequence in order', () => {
    const next = applyMutations({ n: 0 }, [
      { increment: 'n', by: 5 },
      { decrement: 'n', by: 2 },
      { set: 'label', value: 'done' },
    ]);
    expect(next).toEqual({ n: 3, label: 'done' });
  });

  it('passes through an empty list', () => {
    expect(applyMutations({ a: 1 }, [])).toEqual({ a: 1 });
  });

  it('threads `initial` to reset across the chain', () => {
    const next = applyMutations(
      { n: 9 },
      [{ increment: 'n', by: 1 }, { reset: 'n' }],
      { initial: { n: 0 } },
    );
    expect(next).toEqual({ n: 0 });
  });

  it('dispatches both set forms via the same key', () => {
    expect(applyMutation({ a: 1, b: 2 }, { set: 'a', value: 7 })).toEqual({ a: 7, b: 2 });
    expect(applyMutation({ a: 1, b: 2 }, { set: 'a', from: 'b' })).toEqual({ a: 2, b: 2 });
  });
});
