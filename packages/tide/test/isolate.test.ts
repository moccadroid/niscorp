import { describe, it, expect } from 'vitest';
import { ReflexDraftSchema, ReflexSchema, anchorDraft, createMemoryStore, createTide, isTideError, occurrencesBetween, reflexSchemaOf } from '../src/index';
import type { EffectRegistry, ReflexDraft, ReflexInput } from '../src/index';
import { testTransform, utc } from './support';

const vienna = 'Europe/Vienna';
const T0 = utc('2026-03-01T00:00:00Z');

// One person's reflexes among everybody's: every effect writes `answers`, as a host's card effect does.
const effects: EffectRegistry = { show: { writes: ['answers'], run: () => ({ ok: true }) }, note: { writes: [], run: () => ({ ok: true }) } };

const once = (id: string, at: string, tz = vienna): ReflexInput => ({ id, intent: 'Show a card once.', on: { clock: { at, tz } }, effect: { name: 'show' } });

const tideWith = () => createTide({ store: createMemoryStore(), transform: testTransform, effects });

describe('a time zone', () => {
  it('is refused where a reflex is parsed when Intl does not know it', () => {
    expect(ReflexSchema.safeParse(once('a', '2026-03-02T10:00', 'Mars/Base')).success).toBe(false);
    expect(ReflexSchema.safeParse({ ...once('b', '2026-03-02T10:00'), on: { clock: { every: 'day', at: '07:00', tz: 'Mars/Base' } } }).success).toBe(false);
    expect(ReflexSchema.safeParse(once('c', '2026-03-02T10:00', 'UTC')).success).toBe(true);
  });
});

describe('load, one reflex at a time (`isolate`)', () => {
  const looping: ReflexInput = { id: 'loop', intent: 'Wakes on every answer and writes one.', on: { fact: { entity: 'answers' } }, effect: { name: 'show' } };

  it('leaves out each bad reflex with its reason, and loads the rest', async () => {
    const tide = tideWith();
    const report = await tide.load(
      [once('good', '2026-03-01T10:00'), { id: 'broken' } as unknown as ReflexInput, once('zone', '2026-03-01T10:00', 'Mars/Base'), once('good', '2026-03-01T11:00'), { ...once('ghost', '2026-03-01T10:00'), effect: { name: 'nothing' } }, looping],
      { at: T0, isolate: true },
    );
    expect(report.loaded).toBe(1);
    expect(tide.reflexes().map((reflex) => reflex.id)).toEqual(['good']);
    expect(report.refused.map((refusal) => [refusal.reflexId, refusal.code])).toEqual([
      ['broken', 'invalid_reflex'],
      ['zone', 'invalid_reflex'],
      ['good', 'duplicate_reflex'],
      ['ghost', 'unknown_effect'],
      ['loop', 'unguarded_cycle'],
    ]);
  });

  it('a reflex left out does not stop the others from firing', async () => {
    const tide = tideWith();
    await tide.load([once('good', '2026-03-01T10:00'), looping], { at: T0, isolate: true });
    const report = await tide.advance({ now: utc('2026-03-01T09:30:00Z') });
    expect(report.succeeded).toBe(1);
  });

  it('a reflex stranded by one left out is left out too', async () => {
    const after: ReflexInput = { id: 'after', intent: 'Runs after the loop.', on: { fact: { run: 'loop' } }, effect: { name: 'note' } };
    const report = await tideWith().load([looping, after, once('good', '2026-03-01T10:00')], { at: T0, isolate: true });
    expect(report.loaded).toBe(1);
    expect(report.refused.map((refusal) => [refusal.reflexId, refusal.code])).toEqual([
      ['loop', 'unguarded_cycle'],
      ['after', 'unknown_reflex'],
    ]);
  });

  it('without it, a load still refuses whole', async () => {
    await expect(tideWith().load([once('good', '2026-03-01T10:00'), looping], { at: T0 })).rejects.toSatisfy((error) => isTideError(error) && error.code === 'unguarded_cycle');
  });
});

describe('a stored reflex narrowed to the triggers a host offers', () => {
  it('refuses a kind it was not given, and parses the rest as ReflexSchema does', () => {
    const clocksOnly = reflexSchemaOf({ triggers: ['clock'] });
    expect(clocksOnly.safeParse(once('a', '2026-03-02T10:00')).success).toBe(true);
    expect(clocksOnly.safeParse({ id: 'b', intent: 'x', on: { fact: { entity: 'answers' } }, effect: { name: 'show' } }).success).toBe(false);
    expect(clocksOnly.safeParse(once('c', '2026-03-02T10:00', 'Mars/Base')).success).toBe(false);
    expect(reflexSchemaOf()).toBe(ReflexSchema);
  });
});

describe('a timer in the hour a clock turns back', () => {
  const draft: ReflexDraft = ReflexDraftSchema.parse({ id: 'r', intent: 'Ten minutes.', on: { timer: { minutes: 10 } }, effect: { name: 'show' } });

  it('fires when it was set to, not an hour early', () => {
    // Vienna turns back at 01:00Z on 25 October 2026: 02:55 CEST (00:55Z), ten minutes on, is 02:05 CET — a local time
    // the morning shows twice.
    const saved = utc('2026-10-25T00:55:00Z');
    const reflex = anchorDraft(draft, { at: saved, tz: vienna });
    const clock = 'clock' in reflex.on ? reflex.on.clock : undefined;
    expect(clock).toBeDefined();
    if (clock === undefined || 'every' in clock) return;
    const [hit] = occurrencesBetween(clock, saved, saved + 3_600_000, 1);
    expect(hit?.at).toBe(saved + 600_000);
  });

  it('keeps the host zone wherever its wall clock names the instant', () => {
    const reflex = anchorDraft(draft, { at: utc('2026-03-02T11:25:50Z'), tz: vienna });
    expect(reflex.on).toEqual({ clock: { at: '2026-03-02T12:35:50', tz: vienna } });
  });
});
