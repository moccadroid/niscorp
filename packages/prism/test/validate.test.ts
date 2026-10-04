import { describe, it, expect } from 'vitest';
import { validate, evaluate, evaluateSafe, compile, execute, PrismError } from '../src';

describe('validate', () => {
  it('accepts valid config', () => {
    const result = validate({ $ref: '$.user.name' });
    expect(result.ok).toBe(true);
  });

  it('accepts plain object config', () => {
    const result = validate({ name: { $ref: '$.user.name' }, active: true });
    expect(result.ok).toBe(true);
  });

  it('accepts primitives', () => {
    expect(validate(42).ok).toBe(true);
    expect(validate('hello').ok).toBe(true);
    expect(validate(null).ok).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// A `$` name is an op's. A `$` key no op answers to used to validate as a
// template key and fail only when it was evaluated (E_NODE_SHAPE) — so a config
// could pass validation, be stored, and fail every time it ran. The schema
// refuses it now: what validates is what the evaluator can dispatch.
// ═══════════════════════════════════════════════════════════

describe('a `$` key that is not an op', () => {
  const NOT_AN_OP = 'Not a Prism op. A key that starts with "$" names an op; data with such a key goes in $const.';
  const issuesOf = (config: unknown): string[] => {
    const result = validate(config);
    return result.ok ? [] : result.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
  };
  const stored = { name: { $ref: '$.member.name' }, card: { $fetch: { url: 'https://example.com/cards', body: { $ref: '$.member' } } } };
  const member = { member: { name: 'Grace' } };

  it('is refused by validate, with the key and where it is', () => {
    expect(issuesOf(stored)).toEqual([`card.$fetch: ${NOT_AN_OP}`]);
    expect(issuesOf({ $eval: '1 + 1' })).toEqual([`$eval: ${NOT_AN_OP}`]);
  });

  it('is refused beside plain keys, and at any depth', () => {
    expect(issuesOf({ a: 1, $fetch: 2 })).toEqual([`$fetch: ${NOT_AN_OP}`]);
    expect(issuesOf({ $: 1 })).toEqual([`$: ${NOT_AN_OP}`]);
    expect(issuesOf({ rows: { $map: { over: { $ref: '$.rows' }, as: 'row', body: { card: { $fetch: 1 } } } } })).toEqual([
      `rows.$map.body.card.$fetch: ${NOT_AN_OP}`,
    ]);
  });

  // The cases that evaluated before: nothing reached the key, so nothing refused it.
  it('is refused where evaluation would never have reached it', () => {
    expect(issuesOf({ $case: { branches: [{ when: true, then: 'kept' }], else: { $todo: 'later' } } })).toEqual([`$case.else.$todo: ${NOT_AN_OP}`]);
    expect(issuesOf({ $or: [{ $ref: '$.member.name' }, { $lookup: 'name' }] })).toEqual([`$or.1.$lookup: ${NOT_AN_OP}`]);
    expect(issuesOf({ $map: { over: { $ref: '$.none' }, as: 'row', body: { $fetch: 1 } } })).toEqual([`$map.body.$fetch: ${NOT_AN_OP}`]);
  });

  it('fails evaluate and compile as E_SCHEMA, before anything runs', async () => {
    const result = evaluateSafe(stored, member);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(PrismError);
    expect(result.error).toMatchObject({ code: 'E_SCHEMA', context: { details: { issues: [{ path: 'card.$fetch', message: NOT_AN_OP }] } } });
    await expect(compile(stored)).rejects.toMatchObject({ code: 'E_SCHEMA', message: `Invalid config: card.$fetch: ${NOT_AN_OP}` });
  });

  it('an op name as a template key keeps its own sentence', () => {
    expect(issuesOf({ a: 1, $map: 2 })).toEqual(['$map: An op name cannot be a plain object key. Use the op itself.']);
  });

  it('leaves `$` keys that are data alone', () => {
    const literal = { $schema: 'https://json-schema.org/draft-07/schema', $fetch: { url: '/cards' } };
    expect(evaluate({ $const: literal }, {})).toEqual(literal);
    expect(evaluate({ $with: { let: { $n: 2 }, value: { $var: '$n' } } }, {})).toBe(2);
    expect(evaluate({ $renameKeys: { from: { $ref: '$' }, map: { $old: 'fresh' } } }, { $old: 1 })).toEqual({ fresh: 1 });
    expect(evaluate({ $fromEntries: [['$id', { $ref: '$.member.name' }]] }, member)).toEqual({ $id: 'Grace' });
    expect(evaluate({ a$b: { $ref: '$.member.name' } }, member)).toEqual({ a$b: 'Grace' });
  });

  // E_NODE_SHAPE is still the evaluator's answer to a tree the schema never saw.
  it('is E_NODE_SHAPE only for a tree that skipped the schema', async () => {
    const ir = await compile({ name: { $ref: '$.member.name' } });
    expect(() => execute({ ...ir, core: stored }, member)).toThrow(expect.objectContaining({ code: 'E_NODE_SHAPE' }));
  });
});

describe('evaluateSafe', () => {
  it('returns ok on success', () => {
    const result = evaluateSafe({ $const: 42 }, {});
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toBe(42);
  });

  it('returns error on failure', () => {
    const result = evaluateSafe({ $ref: '$.missing' }, {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(Error);
  });
});
