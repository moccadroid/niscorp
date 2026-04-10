import { describe, it, expect } from 'vitest';
import { splitPath, resolvePath, getByPath } from '../src/path';

describe('splitPath', () => {
  it('splits dot-separated paths', () => {
    expect(splitPath('widget.field1.subField2')).toEqual(['widget', 'field1', 'subField2']);
  });

  it('returns empty array for empty string', () => {
    expect(splitPath('')).toEqual([]);
  });

  it('single segment', () => {
    expect(splitPath('widget')).toEqual(['widget']);
  });
});

describe('resolvePath', () => {
  it('combines base and relative', () => {
    expect(resolvePath('widget', 'field1')).toBe('widget.field1');
  });

  it('returns relative when base is empty', () => {
    expect(resolvePath('', 'widget')).toBe('widget');
  });

  it('returns base when relative is empty', () => {
    expect(resolvePath('widget', '')).toBe('widget');
  });
});

describe('getByPath', () => {
  const obj = { widget: { field1: { subField2: 'value' } }, items: [10, 20, 30] };

  it('traverses object path', () => {
    expect(getByPath(obj, ['widget', 'field1', 'subField2'])).toBe('value');
  });

  it('traverses array index', () => {
    expect(getByPath(obj, ['items', '1'])).toBe(20);
  });

  it('returns undefined for missing path', () => {
    expect(getByPath(obj, ['nonexistent', 'path'])).toBe(undefined);
  });

  it('returns root for empty segments', () => {
    expect(getByPath(obj, [])).toBe(obj);
  });
});
