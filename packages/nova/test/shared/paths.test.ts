import { describe, expect, it } from 'vitest';
import { deletePath, getPath, setPath } from '@shared';

describe('getPath', () => {
  it('reads root key', () => {
    expect(getPath({ a: 1 }, 'a')).toBe(1);
  });
  it('reads nested', () => {
    expect(getPath({ a: { b: { c: 9 } } }, 'a.b.c')).toBe(9);
  });
  it('reads array index', () => {
    expect(getPath({ items: ['x', 'y'] }, 'items.1')).toBe('y');
  });
  it('returns undefined for missing', () => {
    expect(getPath({ a: 1 }, 'b.c')).toBeUndefined();
  });
  it('returns undefined for null mid-path', () => {
    expect(getPath({ a: null }, 'a.b')).toBeUndefined();
  });
  it('empty path returns root', () => {
    expect(getPath({ a: 1 }, '')).toEqual({ a: 1 });
  });
});

describe('setPath', () => {
  it('sets root key without mutating original', () => {
    const orig = { a: 1 };
    const next = setPath(orig, 'b', 2) as Record<string, unknown>;
    expect(next).toEqual({ a: 1, b: 2 });
    expect(orig).toEqual({ a: 1 });
  });
  it('sets nested path, structurally sharing siblings', () => {
    const orig = { a: { b: 1 }, c: { d: 2 } };
    const next = setPath(orig, 'a.b', 9) as { a: { b: number }; c: { d: number } };
    expect(next.a.b).toBe(9);
    expect(next.c).toBe(orig.c);
    expect(orig.a.b).toBe(1);
  });
  it('creates missing intermediate objects', () => {
    const next = setPath({}, 'a.b.c', 7) as { a: { b: { c: number } } };
    expect(next.a.b.c).toBe(7);
  });
  it('creates intermediate arrays for index segments', () => {
    const next = setPath({}, 'items.0.name', 'x') as { items: { name: string }[] };
    expect(Array.isArray(next.items)).toBe(true);
    const first = next.items[0];
    if (!first) throw new Error('expected element');
    expect(first.name).toBe('x');
  });
  it('updates array index', () => {
    const orig = { items: ['a', 'b'] };
    const next = setPath(orig, 'items.1', 'B') as { items: string[] };
    expect(next.items).toEqual(['a', 'B']);
    expect(orig.items).toEqual(['a', 'b']);
  });
});

describe('deletePath', () => {
  it('deletes a key', () => {
    const next = deletePath({ a: 1, b: 2 }, 'a') as Record<string, unknown>;
    expect(next).toEqual({ b: 2 });
  });
  it('removes an array element by splice', () => {
    const next = deletePath({ items: ['a', 'b', 'c'] }, 'items.1') as { items: string[] };
    expect(next.items).toEqual(['a', 'c']);
  });
});
