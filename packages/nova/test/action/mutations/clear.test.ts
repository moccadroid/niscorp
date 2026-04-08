import { describe, expect, it } from 'vitest';
import { applyMutation } from '@action/mutations';

describe('applyMutation — clear', () => {
  it('empties an array', () => {
    expect(applyMutation({ items: [1, 2] }, { clear: 'items' })).toEqual({ items: [] });
  });
  it('empties an object', () => {
    expect(applyMutation({ obj: { a: 1 } }, { clear: 'obj' })).toEqual({ obj: {} });
  });
  it('deletes a primitive field', () => {
    expect(applyMutation({ a: 1, b: 2 }, { clear: 'a' })).toEqual({ b: 2 });
  });
});
