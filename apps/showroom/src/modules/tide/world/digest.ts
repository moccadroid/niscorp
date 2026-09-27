import { createMemoryStore, createTide, zonedToUtc, type EffectRegistry, type ReflexInput, type Tide } from '@niscorp/tide';
import { MINUTE, readLedger, recordOf, runUntil, str, transform, TZ, drain, type Snapshot } from './ledger';

// ═══════════════════════════════════════════════════════════
// Tonight's digest for Olivia — fan-in, with no "am I the last one?" code.
//
// REAL: two reflexes. One texts every member booked into tomorrow's class, one
// per member. The other watches the FIRST reflex's runs: when a run settles,
// tide itself mints a fact carrying its counts, and that fact is what emails
// Olivia her one summary. `retry()` on a failed task re-settles the run — and
// does not send the digest again.
// SIMULATED, and labelled on the page: the SMS gateway (the reader chooses
// whose carrier it times out for tonight) and Olivia's mailer.
// ═══════════════════════════════════════════════════════════

export const NIGHT_START = zonedToUtc({ year: 2026, month: 3, day: 3 }, 20, 55, TZ);
export const NIGHT_END = zonedToUtc({ year: 2026, month: 3, day: 3 }, 21, 45, TZ);
export const RECOVERED = zonedToUtc({ year: 2026, month: 3, day: 3 }, 22, 0, TZ);

export const BOOKED = [
  { id: 'ada', name: 'Ada' },
  { id: 'alan', name: 'Alan' },
  { id: 'grace', name: 'Grace' },
  { id: 'linus', name: 'Linus' },
  { id: 'mia', name: 'Mia' },
  { id: 'ruth', name: 'Ruth' },
] as const;

export const REMINDERS: ReflexInput = {
  id: 'reminders.nightly',
  intent: 'Every night at 21:00, text each member booked into tomorrow’s class.',
  on: { clock: { every: 'day', at: '21:00', tz: TZ } },
  select: { query: { table: 'bookings', day: 'tomorrow' }, mode: 'each', unitKey: 'id' },
  effect: { name: 'sms.send', input: { to: { $ref: '$.row.id' }, text: { $interpolate: { template: 'Hi {{name}} — Core & breath tomorrow at 18:00.', values: { $ref: '$.row' } } } } },
  // A gateway timeout is worth one more try, five minutes on.
  policy: { retry: { max: 1, backoff: 'fixed', baseMs: 5 * MINUTE } },
};

export const DIGEST: ReflexInput = {
  id: 'reminders.digest',
  intent: 'When the nightly reminders have all finished, email Olivia one summary.',
  // Fan-in: fires on the SETTLEMENT of the other reflex's run.
  on: { fact: { run: 'reminders.nightly' } },
  effect: {
    name: 'mail.send',
    input: {
      to: 'olivia',
      night: { $ref: '$.fact.occurrence' },
      text: { $interpolate: { template: '{{done}} of {{total}} reminders sent tonight · {{failed}} failed.', values: { $ref: '$.fact.stats' } } },
      failed: { $ref: '$.fact.stats.failed' },
    },
  },
};

export type Sms = { at: number; member: string; text: string; ok: boolean };
export type Digest = { at: number; text: string; failed: number };
export type NightState = { now: number; sms: readonly Sms[]; digests: readonly Digest[]; ledger: Snapshot };
export type Night = { state: () => NightState; retry: (member: string) => Promise<NightState> };

export const createNight = async (failing: ReadonlySet<string>): Promise<Night> => {
  const down = new Set(failing);
  const sms: Sms[] = [];
  const digests: Digest[] = [];
  let now = NIGHT_START;
  let snapshot: NightState = { now, sms: [], digests: [], ledger: { facts: [], runs: [], tasks: [], now } };

  const effects: EffectRegistry = {
    'sms.send': {
      run: (input, ctx) => {
        const rec = recordOf(input);
        const member = str(rec['to']);
        const ok = !down.has(member);
        sms.push({ at: ctx.now, member, text: str(rec['text']), ok });
        // A timeout is a bad minute, not an answer: throw, and tide retries.
        if (!ok) throw new Error('SMS gateway timed out (carrier unreachable)');
        return { sent: true };
      },
    },
    'mail.send': {
      run: (input, ctx) => {
        const rec = recordOf(input);
        digests.push({ at: ctx.now, text: str(rec['text']), failed: Number(rec['failed'] ?? 0) });
        return { sent: true };
      },
    },
  };

  const tide: Tide = createTide({ store: createMemoryStore(), transform, select: () => BOOKED.map((b) => ({ ...b })), effects });
  await tide.load([REMINDERS, DIGEST], { at: NIGHT_START });

  const read = async (): Promise<NightState> => {
    snapshot = { now, sms: [...sms], digests: [...digests], ledger: await readLedger(tide, now) };
    return snapshot;
  };

  await runUntil(tide, NIGHT_START, NIGHT_END);
  now = NIGHT_END;
  await read();

  return {
    state: () => snapshot,
    // An hour later the carrier is back. A person presses retry on the failed
    // task: the task reopens, its run rewinds and re-settles.
    retry: async (member) => {
      const [task] = await tide.ledger.tasks({ reflexId: 'reminders.nightly', state: 'failed' }).then((ts) => ts.filter((t) => t.unit === member));
      if (task === undefined) return snapshot;
      down.delete(member);
      now = Math.max(now, RECOVERED);
      await tide.retry(task.id, now);
      await drain(tide, now);
      now += MINUTE;
      await drain(tide, now);
      return read();
    },
  };
};

