import { describe, it, expect } from 'vitest';
import { PrismError, prismTransform } from '../src/index';
import { PRISM_EXAMPLES } from '../src/examples/index';
import { prismTransform as fromMigrations } from '../src/migrations/index';

// Prism in the shape a host's transform seam takes — `(config, source) =>
// unknown`, what nova's shell, tide's engine and strata's upgrader are handed.
// Both sides arrive untyped, so both are checked here.
describe('prismTransform', () => {
  it('evaluates a config over a source', () => {
    const config: unknown = { to: { $ref: '$.row.email' }, count: { $length: { $ref: '$.rows' } } };
    const source: unknown = { row: { email: 'ada@example.com' }, rows: [1, 2, 3] };
    expect(prismTransform(config, source)).toEqual({ to: 'ada@example.com', count: 3 });
  });

  it('a source may be any JSON value, not only an object', () => {
    expect(prismTransform({ $length: { $ref: '$' } }, ['a', 'b'])).toBe(2);
  });

  it('refuses a config the schema refuses', () => {
    expect(() => prismTransform({ $notAnOp: 1 }, {})).toThrow();
  });

  it('refuses a source that is not plain JSON, and says so', () => {
    expect(() => prismTransform({ $ref: '$' }, { note: undefined })).toThrow('The source of a transform must be plain JSON.');
    expect(() => prismTransform({ $ref: '$' }, { at: () => 1 })).toThrow('The source of a transform must be plain JSON.');
  });

  it('is one function, from the main entry and from /migrations', () => {
    expect(fromMigrations).toBe(prismTransform);
  });
});

// A host keeps its configs and hands the same object over again. The first
// call checks it; what a later call answers, and refuses, is the same.
describe('prismTransform, the same config object again', () => {
  it('answers every example the same on a later call', () => {
    for (const example of PRISM_EXAMPLES) {
      expect(prismTransform(example.config, example.source), example.id).toEqual(example.expected);
      expect(prismTransform(example.config, example.source), example.id).toEqual(example.expected);
    }
  });

  it('answers for the source of each call', () => {
    const config = { name: { $upper: { $ref: '$.name' } } };
    expect(prismTransform(config, { name: 'ada' })).toEqual({ name: 'ADA' });
    expect(prismTransform(config, { name: 'grace' })).toEqual({ name: 'GRACE' });
  });

  it('a caller that changes a result does not change the next one', () => {
    const config = { tags: { $const: ['a'] }, folded: { $merge: [{ $const: { n: 1 } }, { $const: { m: 2 } }] } };
    const first = prismTransform(config, {}) as { tags: string[]; folded: Record<string, number> };
    first.tags.push('b');
    first.folded.n = 9;
    expect(prismTransform(config, {})).toEqual({ tags: ['a'], folded: { n: 1, m: 2 } });
  });

  it('spends a budget of its own on each call', () => {
    const rows = Array.from({ length: 110 }, (_, i) => i);
    const cube = { $map: { over: { $ref: '$' }, as: 'a', body: { $map: { over: { $ref: '$' }, as: 'b', body: { $map: { over: { $ref: '$' }, as: 'c', body: 1 } } } } } };
    expect(() => prismTransform(cube, rows)).toThrow(expect.objectContaining({ code: 'E_BUDGET' }));
    expect(() => prismTransform(cube, rows)).toThrow(expect.objectContaining({ code: 'E_BUDGET' }));
    expect(prismTransform(cube, [1])).toEqual([[[1]]]);
  });

  it('refuses a config nested past the depth limit', () => {
    let config: unknown = 1;
    for (let i = 0; i < 300; i++) config = { a: config };
    expect(() => prismTransform(config, {})).toThrow(PrismError);
    expect(() => prismTransform(config, {})).toThrow(PrismError);
  });
});
