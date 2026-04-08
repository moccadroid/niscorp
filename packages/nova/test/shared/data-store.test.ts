import { describe, expect, it, vi } from 'vitest';
import { createDataStore } from '@shared';

describe('createDataStore', () => {
  it('returns initial via get', () => {
    const store = createDataStore({ a: 1 });
    expect(store.get()).toEqual({ a: 1 });
  });
  it('does not share initial reference', () => {
    const init = { a: 1 };
    const store = createDataStore(init);
    store.update((curr) => ({ ...curr, b: 2 }));
    expect(init).toEqual({ a: 1 });
  });
  it('update replaces and notifies', () => {
    const store = createDataStore<{ a: number; b?: number }>({ a: 1 });
    const fn = vi.fn();
    store.subscribe(fn);
    store.update((curr) => ({ ...curr, b: 2 }));
    expect(store.get()).toEqual({ a: 1, b: 2 });
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it('unsubscribe stops notifications', () => {
    const store = createDataStore<Record<string, number>>({});
    const fn = vi.fn();
    const off = store.subscribe(fn);
    off();
    store.update((curr) => ({ ...curr, x: 1 }));
    expect(fn).not.toHaveBeenCalled();
  });
  it('handler errors do not crash the store', () => {
    const store = createDataStore({ n: 0 });
    store.subscribe(() => {
      throw new Error('boom');
    });
    expect(() => store.update((c) => ({ ...c, n: 1 }))).not.toThrow();
    expect(store.get()).toEqual({ n: 1 });
  });
});
