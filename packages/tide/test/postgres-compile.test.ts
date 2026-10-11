import { describe, expect, it } from 'vitest';
import { compileWhere } from '../src/store/postgres/compile';

// What the Postgres store makes of a `where`, with no database: the compiler
// is a function of what it is handed.
describe('compileWhere', () => {
  it('compiles an equality, a missing value and a comparison, and numbers the parameters from where it is told', () => {
    const bound = compileWhere({ state: 'pending', token: undefined, dueAt: { lte: 5 }, reflexId: { in: ['a', 'b'] } }, 3);
    expect(bound.sql).toBe('state = $3 AND token IS NULL AND due_at <= $4 AND reflex_id = ANY($5)');
    expect(bound.params).toEqual(['pending', 5, ['a', 'b']]);
  });

  it('answers TRUE for no where at all', () => {
    expect(compileWhere(undefined, 1)).toEqual({ sql: 'TRUE', params: [] });
  });

  it('refuses what is not a comparison, naming the field', () => {
    expect(() => compileWhere({ state: { in: 'pending' } }, 1)).toThrow(/"state" is compared with does not read as a comparison \(in: /);
    expect(() => compileWhere({ drained: { isNull: 'yes' } }, 1)).toThrow(/"drained" is compared with does not read as a comparison \(isNull: /);
  });
});
