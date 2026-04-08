import { describe, expect, it } from 'vitest';
import { applyMutation } from '@action/mutations';

describe('applyMutation — set', () => {
  it('sets by value', () => {
    const next = applyMutation({ a: 1 }, { set: 'a', value: 9 });
    expect(next).toEqual({ a: 9 });
  });
  it('sets by from path', () => {
    const next = applyMutation({ a: 1, b: 2 }, { set: 'a', from: 'b' });
    expect(next).toEqual({ a: 2, b: 2 });
  });
  it('does not mutate original', () => {
    const orig = { a: 1 };
    applyMutation(orig, { set: 'a', value: 9 });
    expect(orig).toEqual({ a: 1 });
  });
  it('creates nested path', () => {
    const next = applyMutation({}, { set: 'user.name', value: 'Ada' });
    expect(next).toEqual({ user: { name: 'Ada' } });
  });
  it('sets array index', () => {
    const next = applyMutation({ items: ['a', 'b'] }, { set: 'items.0', value: 'A' });
    expect(next).toEqual({ items: ['A', 'b'] });
  });
});
