import { describe, it, expect } from 'vitest';
import { ReflexSchema, createMemoryStore, createTide, isTideError, versionOf } from '../src/index';
import type { EffectRegistry, ReflexInput } from '../src/index';
import { testTransform } from './support';

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
    const load = build([manual('a', { effect: { name: 'ghost' } })]);
    await expect(load).rejects.toThrow(/not registered/);
    await expect(load).rejects.toSatisfy((error) => isTideError(error) && error.code === 'unknown_effect');
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
    const load = build([manual('a', { on: { fact: { run: 'nobody' } } })]);
    await expect(load).rejects.toThrow(/unknown reflex/);
    await expect(load).rejects.toSatisfy((error) => isTideError(error) && error.code === 'unknown_reflex');
  });
});

describe('cycles', () => {
  const echo: EffectRegistry = { echo: { run: () => null, writes: ['ping'] } };

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

  it('reports an effect that declares no writes as a blind edge', async () => {
    const report = await build([manual('a')]);
    expect(report.blind).toEqual([{ reflexId: 'a', effect: 'work' }]);
  });
});

describe('the lease', () => {
  it('warns when an effect may run as long as its lease, and loads the reflex', async () => {
    const tide = createTide({ store: createMemoryStore(), transform: testTransform, effects: { work: { run: () => null } }, leaseMs: 60_000 });
    const report = await tide.load([manual('slow', { policy: { timeoutMs: 60_000 } }), manual('quick', { policy: { timeoutMs: 59_999 } })], { at: 0 });
    expect(report.loaded).toBe(2);
    expect(report.warnings).toEqual([expect.stringMatching(/^slow: .*timeoutMs 60000.*leaseMs 60000/)]);
  });
});

describe('a one-shot clock on a date that does not exist', () => {
  const once = (id: string, at: string): ReflexInput => manual(id, { on: { clock: { at, tz: 'Europe/Vienna' } } });

  it('is loaded, with a warning naming the date and the day it fires on', async () => {
    const report = await build([once('feb', '2026-02-30T10:00'), once('real', '2026-02-28T10:00')]);
    expect(report.loaded).toBe(2);
    expect(report.warnings).toEqual(['feb: clock.at names 2026-02-30, which does not exist — it fires on 2026-03-02']);
  });

  it('a month past December is named too', async () => {
    const report = await build([once('late', '2026-13-01T10:00')]);
    expect(report.warnings).toEqual(['late: clock.at names 2026-13-01, which does not exist — it fires on 2027-01-01']);
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
