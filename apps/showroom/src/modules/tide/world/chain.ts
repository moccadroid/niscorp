import { createMemoryStore, createTide, zonedToUtc, type EffectRegistry, type ReflexInput, type Tide } from '@niscorp/tide';
import { drain, hhmm, HOUR, MINUTE, readLedger, recordOf, str, transform, TZ, type Snapshot } from './ledger';

// ═══════════════════════════════════════════════════════════
// One booking, a chain of events — Power hour, Monday 2 March, 12:15.
//
// REAL: seven reflexes and the engine that chains them. There is no run body
// anywhere: every hop — a confirmation, a timer, a reminder, a promotion off
// the waitlist — is a fact that wakes the next reflex, and each is a row.
// SIMULATED, and labelled on the page: the studio's booking table (a few rows
// in memory — the host writes them and pushes a fact for each write, which is
// what moss's vex bridge does), and the push service, which records what it
// was handed instead of sending it.
// ═══════════════════════════════════════════════════════════

export const CLASS = { id: 'power', name: 'Power hour', date: '2026-03-02', capacity: 4 } as const;
export const STARTS = zonedToUtc({ year: 2026, month: 3, day: 2 }, 12, 15, TZ);
export const ENDS = STARTS + HOUR;
export const OPENS = zonedToUtc({ year: 2026, month: 3, day: 2 }, 8, 0, TZ);
export const TWO_HOURS_BEFORE = STARTS - 2 * HOUR;
export const AFTER = ENDS + 5 * MINUTE;

export const PEOPLE: Record<string, string> = { ada: 'Ada', alan: 'Alan', grace: 'Grace', mia: 'Mia', ruth: 'Ruth' };
export const SEEDED = ['ada', 'alan', 'grace'] as const;

// ── the reflexes ────────────────────────────────────────────────

const bookingInsert = { fact: { entity: 'bookings', op: 'insert' as const } };
const stillBooked = { query: { table: 'bookings', member: { $ref: '$.fact.payload.member' } }, mode: 'each' as const, unitKey: 'member' };

export const REFLEXES: readonly ReflexInput[] = [
  {
    id: 'booking.confirm',
    intent: 'Confirm a booking the moment it is made.',
    on: bookingInsert,
    effect: { name: 'push.send', input: { to: { $ref: '$.row.member' }, kind: 'confirmed', via: { $ref: '$.row.via' } } },
  },
  {
    id: 'booking.timers',
    intent: 'When a booking is made, set two timers: two hours before the class, and just after it ends.',
    on: bookingInsert,
    effect: { name: 'timers.set', input: { member: { $ref: '$.row.member' } } },
  },
  {
    id: 'class.reminder',
    intent: 'Two hours before, remind the member — if they are still booked.',
    on: { fact: { signal: 'class.soon' } },
    // Reality is the cancellation token: a member who cancelled selects no
    // row, and zero rows is an ordinary, recorded outcome.
    select: stillBooked,
    effect: { name: 'push.send', input: { to: { $ref: '$.row.member' }, kind: 'reminder' } },
  },
  {
    id: 'class.feedback',
    intent: 'After the class, ask the member how it was — if they were booked.',
    on: { fact: { signal: 'class.over' } },
    select: stillBooked,
    effect: { name: 'push.send', input: { to: { $ref: '$.row.member' }, kind: 'feedback' } },
  },
  {
    id: 'booking.cancelled',
    intent: 'Confirm a cancellation to the member who cancelled.',
    on: { fact: { entity: 'bookings', op: 'delete' } },
    effect: { name: 'push.send', input: { to: { $ref: '$.row.member' }, kind: 'cancelled' } },
  },
  {
    id: 'waitlist.promote',
    intent: 'When a spot opens, give it to the first person on the waitlist.',
    on: { fact: { entity: 'bookings', op: 'delete' } },
    select: { query: { table: 'waitlist', first: true }, mode: 'each', unitKey: 'member' },
    effect: { name: 'booking.promote', input: { member: { $ref: '$.row.member' } } },
  },
  {
    id: 'waitlist.joined',
    intent: 'Tell a member the class is full and where they are in the queue.',
    on: { fact: { entity: 'waitlist', op: 'insert' } },
    effect: { name: 'push.send', input: { to: { $ref: '$.row.member' }, kind: 'waitlisted', position: { $ref: '$.row.position' } } },
  },
];

// ── the world ───────────────────────────────────────────────────

export type PushKind = 'confirmed' | 'promoted' | 'reminder' | 'feedback' | 'cancelled' | 'waitlisted';
export type Push = { at: number; member: string; kind: PushKind; text: string; reflex: string };

export const TEXT: Record<PushKind, (position: number) => string> = {
  confirmed: () => 'Booked: Power hour, today at 12:15. See you there!',
  promoted: () => 'A spot opened up — you’re in Power hour at 12:15.',
  reminder: () => 'Power hour starts in 2 hours (12:15). Bring water.',
  feedback: () => 'How was Power hour? Tap to rate it.',
  cancelled: () => 'Cancelled: Power hour at 12:15. Hope to see you soon.',
  waitlisted: (n) => `Power hour is full — you’re #${n} on the waitlist.`,
};

export type ChainState = { now: number; booked: readonly string[]; waitlist: readonly string[]; pushes: readonly Push[]; ledger: Snapshot };

export type Chain = {
  state: () => Promise<ChainState>;
  book: (member: string) => Promise<ChainState>;
  cancel: (member: string) => Promise<ChainState>;
  clockTo: (at: number) => Promise<ChainState>;
};

export const createChain = async (): Promise<Chain> => {
  let now = OPENS;
  const booked: string[] = [...SEEDED];
  const waitlist: string[] = [];
  const pushes: Push[] = [];

  const row = (member: string, extra: Record<string, unknown> = {}) => ({ member, name: PEOPLE[member] ?? member, cls: CLASS.id, ...extra });

  const effects: EffectRegistry = {
    'push.send': {
      run: (input, ctx) => {
        const rec = recordOf(input);
        const raw = str(rec['kind']);
        const kind: PushKind =
          raw === 'confirmed' && rec['via'] === 'waitlist' ? 'promoted' : raw === 'reminder' || raw === 'feedback' || raw === 'cancelled' || raw === 'waitlisted' ? raw : 'confirmed';
        const member = str(rec['to']);
        pushes.push({ at: ctx.now, member, kind, text: TEXT[kind](Number(rec['position'] ?? 1)), reflex: ctx.reflexId });
        return { pushed: kind };
      },
    },
    // Timers are data: two DELAYED facts, each with a dedupe key, so booking
    // twice cannot set two reminders. `emit` commits with this attempt only.
    'timers.set': {
      run: (input, ctx) => {
        const member = str(recordOf(input)['member']);
        ctx.emit({ kind: 'signal', name: 'class.soon', payload: { member }, at: ctx.now, notBefore: TWO_HOURS_BEFORE, dedupeKey: `soon:${CLASS.date}:${member}` });
        ctx.emit({ kind: 'signal', name: 'class.over', payload: { member }, at: ctx.now, notBefore: ENDS, dedupeKey: `over:${CLASS.date}:${member}` });
        return { reminder: hhmm(TWO_HOURS_BEFORE), feedback: hhmm(ENDS) };
      },
    },
    // The promotion is a WRITE: move the member from the waitlist to the
    // bookings, and say so as a fact — which is what wakes the confirmation.
    'booking.promote': {
      writes: ['bookings'],
      run: (input, ctx) => {
        const member = str(recordOf(input)['member']);
        const i = waitlist.indexOf(member);
        if (i < 0 || booked.length >= CLASS.capacity) return { promoted: false };
        waitlist.splice(i, 1);
        booked.push(member);
        ctx.emit({ kind: 'write', entity: 'bookings', op: 'insert', row: row(member, { via: 'waitlist' }), at: ctx.now });
        return { promoted: member };
      },
    },
  };

  const tide: Tide = createTide({
    store: createMemoryStore(),
    transform,
    select: (query) => {
      const q = recordOf(query);
      if (q['table'] === 'waitlist') return waitlist.slice(0, 1).map((m) => row(m));
      return booked.filter((m) => m === q['member']).map((m) => row(m));
    },
    effects,
  });
  await tide.load(REFLEXES, { at: OPENS });

  // Every write the studio makes goes through here: change the table, then
  // push the fact. (Under moss the vex bridge does this at the write itself.)
  const write = async (entity: 'bookings' | 'waitlist', op: 'insert' | 'delete', r: Record<string, unknown>, at: number): Promise<void> => {
    await tide.ingest({ kind: 'write', entity, op, row: r, at });
  };

  const state = async (): Promise<ChainState> => {
    await drain(tide, now);
    return { now, booked: [...booked], waitlist: [...waitlist], pushes: [...pushes], ledger: await readLedger(tide, now) };
  };

  return {
    state,
    book: async (member) => {
      if (booked.includes(member) || waitlist.includes(member)) return state();
      if (booked.length < CLASS.capacity) {
        booked.push(member);
        await write('bookings', 'insert', row(member, { via: 'app' }), now);
      } else {
        waitlist.push(member);
        await write('waitlist', 'insert', row(member, { position: waitlist.length }), now);
      }
      return state();
    },
    cancel: async (member) => {
      if (booked.includes(member)) {
        booked.splice(booked.indexOf(member), 1);
        await write('bookings', 'delete', row(member), now);
      } else if (waitlist.includes(member)) {
        waitlist.splice(waitlist.indexOf(member), 1);
        await write('waitlist', 'delete', row(member), now);
      }
      return state();
    },
    clockTo: async (at) => {
      // Time only moves forward — and every instant in between is visited,
      // the way a driver wakes at `nextDue`.
      if (at > now) {
        for (let guard = 0; guard < 50; guard += 1) {
          const due = await tide.nextDue(now);
          if (due === undefined || due > at || due <= now) break;
          now = due;
          await drain(tide, now);
        }
        now = at;
      }
      return state();
    },
  };
};
