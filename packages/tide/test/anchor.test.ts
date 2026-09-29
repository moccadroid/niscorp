import { describe, it, expect } from 'vitest';
import { ClockOnceSchema, ReflexDraftSchema, ReflexSchema, anchorDraft, createMemoryStore, createTide, occurrencesBetween, timerMs } from '../src/index';
import type { ReflexDraft } from '../src/index';
import { testTransform } from './support';

// A timer is written as a length and saved as an instant: anchoring fixes it
// to a one-shot clock, to the second, at the moment of saving.

const vienna = 'Europe/Vienna';
const utc = (iso: string): number => Date.parse(iso);

const draftWith = (on: ReflexDraft['on']): ReflexDraft =>
  ReflexDraftSchema.parse({ id: 'r', intent: 'Do the thing.', on, effect: { name: 'work' } });

describe('the one-shot clock, to the second', () => {
  it('accepts seconds, and still accepts a clock without them', () => {
    expect(ClockOnceSchema.safeParse({ at: '2026-03-02T10:15:30', tz: vienna }).success).toBe(true);
    expect(ClockOnceSchema.safeParse({ at: '2026-03-02T10:15', tz: vienna }).success).toBe(true);
    expect(ClockOnceSchema.safeParse({ at: '2026-03-02T10:15:60', tz: vienna }).success).toBe(false);
  });

  it('fires on the second it names', () => {
    const [hit] = occurrencesBetween({ at: '2026-03-02T10:15:30', tz: vienna }, 0, utc('2027-01-01T00:00:00Z'), 1);
    expect(hit?.at).toBe(utc('2026-03-02T09:15:30Z'));
  });

  it('a minute-only clock still fires on the minute', () => {
    const [hit] = occurrencesBetween({ at: '2026-03-02T10:15', tz: vienna }, 0, utc('2027-01-01T00:00:00Z'), 1);
    expect(hit?.at).toBe(utc('2026-03-02T09:15:00Z'));
  });
});

describe('timers', () => {
  it('is only a draft — a stored reflex cannot carry one', () => {
    expect(ReflexSchema.safeParse({ id: 'r', intent: 'x', on: { timer: { minutes: 2 } }, effect: { name: 'work' } }).success).toBe(false);
  });

  it('needs a length', () => {
    expect(ReflexDraftSchema.safeParse({ id: 'r', intent: 'x', on: { timer: {} }, effect: { name: 'work' } }).success).toBe(false);
    expect(ReflexDraftSchema.safeParse({ id: 'r', intent: 'x', on: { timer: { minutes: 0 } }, effect: { name: 'work' } }).success).toBe(false);
  });

  it('adds up its parts', () => {
    expect(timerMs({ hours: 1, minutes: 2, seconds: 3 })).toBe(3_723_000);
  });

  it('counts from the anchor, to the second, in the host timezone', () => {
    const saved = utc('2026-03-02T11:25:50Z'); // 12:25:50 in Vienna
    const reflex = anchorDraft(draftWith({ timer: { minutes: 2 } }), { at: saved, tz: vienna });
    expect(reflex.on).toEqual({ clock: { at: '2026-03-02T12:27:50', tz: vienna } });
    const [hit] = occurrencesBetween({ at: '2026-03-02T12:27:50', tz: vienna }, saved, saved + 3_600_000, 1);
    expect(hit?.at).toBe(saved + 120_000);
  });

  it('rounds a fraction of a second up, never down: a timer is never short', () => {
    const saved = utc('2026-03-02T11:25:50.092Z');
    const reflex = anchorDraft(draftWith({ timer: { minutes: 2 } }), { at: saved, tz: vienna });
    expect(reflex.on).toEqual({ clock: { at: '2026-03-02T12:27:51', tz: vienna } });
  });

  it('crosses midnight into the next local day', () => {
    const reflex = anchorDraft(draftWith({ timer: { minutes: 90 } }), { at: utc('2026-03-02T22:30:00Z'), tz: vienna });
    expect(reflex.on).toEqual({ clock: { at: '2026-03-03T01:00:00', tz: vienna } });
  });

  it('passes any other trigger through as written', () => {
    const on = { clock: { every: 'day' as const, at: '09:00', tz: vienna } };
    expect(anchorDraft(draftWith(on), { at: 0, tz: vienna }).on).toEqual(on);
  });

  it('what is stored survives a restart: a second load names the same instant and fires once', async () => {
    const saved = utc('2026-03-02T11:25:50Z');
    const reflex = anchorDraft(draftWith({ timer: { seconds: 45 } }), { at: saved, tz: vienna });
    const store = createMemoryStore();
    const fired: number[] = [];
    const build = () => createTide({ store, transform: testTransform, effects: { work: { run: () => { fired.push(1); return null; } } } });

    // Advance to quiescence, as the driver does.
    const settle = async (tide: ReturnType<typeof build>, now: number): Promise<void> => {
      for (let i = 0; i < 20; i += 1) await tide.advance({ now });
    };

    const first = build();
    await first.load([reflex], { at: saved });
    await settle(first, saved);

    // "Restart" 20 s later: a new engine over the same store, loading the same stored document.
    const restarted = build();
    await restarted.load([reflex], { at: saved + 20_000 });
    await settle(restarted, saved + 20_000);
    expect(await restarted.nextDue(saved + 20_000)).toBe(saved + 45_000);
    await settle(restarted, saved + 44_999);
    expect(fired).toHaveLength(0);
    await settle(restarted, saved + 45_000);
    expect(fired).toHaveLength(1);

    // And a restart after it fired does not fire it again.
    const again = build();
    await again.load([reflex], { at: saved + 90_000 });
    await settle(again, saved + 90_000);
    expect(fired).toHaveLength(1);
  });
});
