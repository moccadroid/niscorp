import { describe, it, expect } from 'vitest';
import { createIncrementalParser } from '../src/incremental-parser';

const base = {
  widget: { type: '', title: '' },
  response: '',
  items: [] as { name: string; value: number }[],
  count: 0,
  active: false,
  meta: null as unknown,
};

// Helper: write JSON, take snapshot, return typed result
const parse = (json: string, initial = base): typeof base => {
  const parser = createIncrementalParser(initial);
  parser.write(json);
  const snap = parser.snapshot(initial);
  return snap.changed ? snap.value as typeof base : initial;
};

// ═══════════════════════════════════════════════════════════
// Value extraction
// ═══════════════════════════════════════════════════════════

describe('incremental parser — value extraction', () => {
  it('extracts string values', () => {
    expect(parse('{"widget":{"type":"card"}}').widget.type).toBe('card');
  });

  it('extracts number values', () => {
    expect(parse('{"count":42}').count).toBe(42);
  });

  it('extracts decimal numbers', () => {
    expect(parse('{"count":3.14}').count).toBe(3.14);
  });

  it('extracts negative numbers', () => {
    expect(parse('{"count":-7}').count).toBe(-7);
  });

  it('extracts scientific notation', () => {
    expect(parse('{"count":1.5e3}').count).toBe(1500);
  });

  it('extracts boolean true', () => {
    expect(parse('{"active":true}').active).toBe(true);
  });

  it('extracts boolean false', () => {
    expect(parse('{"active":false}').active).toBe(false);
  });

  it('extracts null', () => {
    expect(parse('{"meta":null}').meta).toBe(null);
  });

  it('preserves base values for unseen keys', () => {
    const result = parse('{"widget":{"type":"card"');
    expect(result.widget.type).toBe('card');
    expect(result.widget.title).toBe('');
    expect(result.response).toBe('');
  });
});

// ═══════════════════════════════════════════════════════════
// Strings
// ═══════════════════════════════════════════════════════════

describe('incremental parser — strings', () => {
  it('partial strings visible mid-stream', () => {
    const parser = createIncrementalParser(base);
    parser.write('{"response":"hel');
    let snap = parser.snapshot(base);
    expect(snap.changed && (snap.value as typeof base).response).toBe('hel');

    parser.write('lo wor');
    snap = parser.snapshot(snap.changed ? snap.value : base);
    expect(snap.changed && (snap.value as typeof base).response).toBe('hello wor');

    parser.write('ld"}');
    snap = parser.snapshot(snap.changed ? snap.value : base);
    expect(snap.changed && (snap.value as typeof base).response).toBe('hello world');
  });

  it('handles escape sequences', () => {
    expect(parse('{"response":"line1\\nline2\\ttab"}').response).toBe('line1\nline2\ttab');
  });

  it('handles escaped quotes', () => {
    expect(parse('{"response":"say \\"hello\\""}').response).toBe('say "hello"');
  });

  it('handles escaped backslash', () => {
    expect(parse('{"response":"path\\\\dir"}').response).toBe('path\\dir');
  });

  it('handles unicode escapes', () => {
    expect(parse('{"response":"caf\\u00e9"}').response).toBe('café');
  });

  it('handles unicode escape split across chunks', () => {
    const parser = createIncrementalParser(base);
    parser.write('{"response":"caf\\u00');
    parser.write('e9"}');
    const snap = parser.snapshot(base);
    expect(snap.changed && (snap.value as typeof base).response).toBe('café');
  });
});

// ═══════════════════════════════════════════════════════════
// Arrays
// ═══════════════════════════════════════════════════════════

describe('incremental parser — arrays', () => {
  it('builds array elements incrementally', () => {
    const result = parse('{"items":[{"name":"first","value":1}');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({ name: 'first', value: 1 });
  });

  it('appends as elements stream in', () => {
    const result = parse('{"items":[{"name":"a","value":1},{"name":"b","value":2}]}');
    expect(result.items).toHaveLength(2);
    expect(result.items[1]).toEqual({ name: 'b', value: 2 });
  });

  it('handles primitive arrays', () => {
    const simpleBase = { tags: [] as string[] };
    const parser = createIncrementalParser(simpleBase);
    parser.write('{"tags":["alpha","beta","gamma"]}');
    const snap = parser.snapshot(simpleBase);
    expect(snap.changed && (snap.value as typeof simpleBase).tags).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('handles number arrays', () => {
    const simpleBase = { scores: [] as number[] };
    const parser = createIncrementalParser(simpleBase);
    parser.write('{"scores":[1,2,3]}');
    const snap = parser.snapshot(simpleBase);
    expect(snap.changed && (snap.value as typeof simpleBase).scores).toEqual([1, 2, 3]);
  });
});

// ═══════════════════════════════════════════════════════════
// Chunked streaming
// ═══════════════════════════════════════════════════════════

describe('incremental parser — chunked', () => {
  it('character-by-character streaming', () => {
    const parser = createIncrementalParser(base);
    const json = '{"widget":{"type":"card","title":"Hi"},"count":42}';
    for (const ch of json) parser.write(ch);
    const snap = parser.snapshot(base);
    const result = snap.changed ? snap.value as typeof base : base;
    expect(result.widget.type).toBe('card');
    expect(result.widget.title).toBe('Hi');
    expect(result.count).toBe(42);
  });

  it('arbitrary chunk boundaries', () => {
    const parser = createIncrementalParser(base);
    parser.write('{"wid');
    parser.write('get":{"ty');
    parser.write('pe":"car');
    parser.write('d","title":"H');
    parser.write('ello"},"count":');
    parser.write('7}');
    const snap = parser.snapshot(base);
    const result = snap.changed ? snap.value as typeof base : base;
    expect(result.widget.type).toBe('card');
    expect(result.widget.title).toBe('Hello');
    expect(result.count).toBe(7);
  });
});

// ═══════════════════════════════════════════════════════════
// Structural sharing
// ═══════════════════════════════════════════════════════════

describe('incremental parser — structural sharing', () => {
  it('unchanged subtrees keep the same reference', () => {
    const initial = { a: { x: 1 }, b: { y: 2 } };
    const parser = createIncrementalParser(initial);
    parser.write('{"a":{"x":99}}');
    const snap = parser.snapshot(initial);
    if (!snap.changed) throw new Error('expected change');

    // a changed — new reference
    expect(snap.value.a).not.toBe(initial.a);
    expect(snap.value.a.x).toBe(99);

    // b unchanged — SAME reference
    expect(snap.value.b).toBe(initial.b);
  });

  it('sequential snapshots share unchanged paths', () => {
    const initial = { a: '', b: '', c: '' };
    const parser = createIncrementalParser(initial);

    parser.write('{"a":"hello"');
    const snap1 = parser.snapshot(initial);
    if (!snap1.changed) throw new Error('expected change');

    parser.write(',"b":"world"');
    const snap2 = parser.snapshot(snap1.value);
    if (!snap2.changed) throw new Error('expected change');

    // snap2.a should be the same reference as snap1.a (unchanged between snapshots)
    expect(snap2.value.a).toBe(snap1.value.a);
    // snap2.b is new
    expect(snap2.value.b).toBe('world');
    // snap2.c should still be the ORIGINAL reference
    expect(snap2.value.c).toBe(initial.c);
  });

  it('snapshot with no changes returns changed: false', () => {
    const parser = createIncrementalParser(base);
    parser.write('{"widget"');  // just a key, no value set
    const snap = parser.snapshot(base);
    expect(snap.changed).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════
// Events
// ═══════════════════════════════════════════════════════════

describe('incremental parser — events', () => {
  it('emits enterObject/leaveObject', () => {
    const parser = createIncrementalParser(base);
    const events = parser.write('{"widget":{"type":"x"}}');
    const types = events.map(e => e.type);
    expect(types).toContain('enterObject');
    expect(types).toContain('leaveObject');
  });

  it('emits enterKey for object keys', () => {
    const parser = createIncrementalParser(base);
    const events = parser.write('{"widget":{"type":"x"},"response":"y"}');
    const keys = events.filter(e => e.type === 'enterKey');
    expect(keys.length).toBeGreaterThanOrEqual(3);
  });

  it('emits enterIndex for array elements', () => {
    const simpleBase = { items: [] as number[] };
    const parser = createIncrementalParser(simpleBase);
    const events = parser.write('{"items":[1,2,3]}');
    const indices = events.filter(e => e.type === 'enterIndex');
    expect(indices).toHaveLength(3);
  });

  it('root leaveObject has correct path', () => {
    const parser = createIncrementalParser({ a: '', b: '' });
    const events = parser.write('{"a":"x","b":"y"}');
    const leaves = events.filter(e => e.type === 'leaveObject');
    expect(leaves[leaves.length - 1].path).toBe('');
  });
});

// ═══════════════════════════════════════════════════════════
// Complex structures
// ═══════════════════════════════════════════════════════════

describe('incremental parser — complex', () => {
  it('deeply nested objects', () => {
    const deepBase = { a: { b: { c: { d: '' } } } };
    const parser = createIncrementalParser(deepBase);
    parser.write('{"a":{"b":{"c":{"d":"deep"}}}}');
    const snap = parser.snapshot(deepBase);
    expect(snap.changed && (snap.value as typeof deepBase).a.b.c.d).toBe('deep');
  });

  it('array of objects with nested arrays', () => {
    const complexBase = { data: [] as Array<{ tags: string[] }> };
    const parser = createIncrementalParser(complexBase);
    parser.write('{"data":[{"tags":["a","b"]},{"tags":["c"]}]}');
    const snap = parser.snapshot(complexBase);
    if (!snap.changed) throw new Error('expected change');
    expect(snap.value.data).toHaveLength(2);
    expect(snap.value.data[0].tags).toEqual(['a', 'b']);
    expect(snap.value.data[1].tags).toEqual(['c']);
  });

  it('mixed value types', () => {
    const mixedBase = { s: '', n: 0, b: false, a: [] as string[], o: { x: '' } };
    const parser = createIncrementalParser(mixedBase);
    parser.write('{"s":"hi","n":42,"b":true,"a":["x"],"o":{"x":"y"}}');
    const snap = parser.snapshot(mixedBase);
    if (!snap.changed) throw new Error('expected change');
    expect(snap.value.s).toBe('hi');
    expect(snap.value.n).toBe(42);
    expect(snap.value.b).toBe(true);
    expect(snap.value.a).toEqual(['x']);
    expect(snap.value.o.x).toBe('y');
  });
});
