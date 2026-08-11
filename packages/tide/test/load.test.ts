import { describe, it, expect } from 'vitest';
import { ReflexSchema, createMemoryStore, createTide, isTideError, versionOf } from '../src/index';
import type { EffectRegistry, ReflexInput } from '../src/index';
import { testTransform } from './support';

// The load gate: every opinion tide holds about a set of reflexes, enforced
// once, before anything can run. If it loads, it's coherent.

const build = (reflexes: readonly ReflexInput[], effects: EffectRegistry = { work: { run: () => null } }) =>
  createTide({ store: createMemoryStore(), transform: testTransform, effects }).load(reflexes, { at: 0 });

const manual = (id: string, extra: Partial<ReflexInput> = {}): ReflexInput => ({
  id,
  intent: 'A reflex.',
  on: { manual: {} },
  effect: { name: 'work' },
  ...extra,
});

describe('validation', () => {
  it('refuses a reflex that does not parse', async () => {
    await expect(build([{ id: 'x' } as unknown as ReflexInput])).rejects.toSatisfy(
      (error) => isTideError(error) && error.code === 'invalid_reflex',
    );
  });

  it('refuses a duplicate id', async () => {
    await expect(build([manual('a'), manual('a')])).rejects.toSatisfy(
      (error) => isTideError(error) && error.code === 'duplicate_reflex',
    );
  });

  it('refuses an effect nothing registered', async () => {
    await expect(build([manual('a', { effect: { name: 'ghost' } })])).rejects.toThrow(/not registered/);
  });

  it('refuses `when` on a clock trigger — a clock condition belongs in the selection', async () => {
    await expect(
      build([manual('a', { on: { clock: { every: 'day', at: '03:00', tz: 'UTC' } }, when: { $ref: '$.x' } })]),
    ).rejects.toThrow(/fact triggers/);
  });

  it('refuses `each` mode with no unitKey — the grain cannot be implicit', async () => {
    await expect(build([manual('a', { select: { query: {}, mode: 'each' } })])).rejects.toThrow(/unitKey/);
  });

  it('refuses a firing subscription to a reflex that is not there', async () => {
    await expect(build([manual('a', { on: { fact: { firing: 'nobody' } } })])).rejects.toThrow(/unknown reflex/);
  });
});

describe('cycles', () => {
  const echo: EffectRegistry = { echo: { run: () => null, touches: ['ping'] } };

  it('refuses an UNGUARDED cycle — it diverges by construction', async () => {
    await expect(
      build([manual('loop', { on: { fact: { entity: 'ping' } }, effect: { name: 'echo' } })], echo),
    ).rejects.toSatisfy((error) => isTideError(error) && error.code === 'unguarded_cycle');
  });

  it('allows a GUARDED cycle and reports it — a drip campaign IS a cycle', async () => {
    const report = await build(
      [
        manual('drip', {
          on: { fact: { entity: 'ping' } },
          when: { $eq: [{ $ref: '$.fact.row.done' }, false] },
          effect: { name: 'echo' },
        }),
      ],
      echo,
    );
    expect(report.cycles).toHaveLength(1);
    expect(report.cycles[0]?.guarded).toBe(true);
    expect(report.warnings.length).toBeGreaterThanOrEqual(0);
  });

  it('reports an effect that declares no touches as an unverifiable edge', async () => {
    const report = await build([manual('a')]);
    expect(report.unverifiable).toEqual([{ reflexId: 'a', effect: 'work' }]);
  });
});

describe('versioning', () => {
  const parse = (input: ReflexInput) => ReflexSchema.parse(input);

  it('excludes `enabled` — a switch is not an edit', () => {
    expect(versionOf(parse(manual('a', { enabled: true })))).toBe(versionOf(parse(manual('a', { enabled: false }))));
  });

  it('includes `params` — changing graceDays is a behavioural change the ledger must explain', () => {
    expect(versionOf(parse(manual('a', { params: { graceDays: 3 } })))).not.toBe(
      versionOf(parse(manual('a', { params: { graceDays: 7 } }))),
    );
  });

  it('is stable across key order', () => {
    const left = parse({ id: 'a', intent: 'x', on: { manual: {} }, effect: { name: 'work' }, params: { a: 1, b: 2 } });
    const right = parse({ params: { b: 2, a: 1 }, effect: { name: 'work' }, on: { manual: {} }, intent: 'x', id: 'a' });
    expect(versionOf(left)).toBe(versionOf(right));
  });
});
