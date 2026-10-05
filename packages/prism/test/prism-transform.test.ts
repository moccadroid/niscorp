import { describe, it, expect } from 'vitest';
import { prismTransform } from '../src/index';
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
