import { createMemoryStore, createTide, occurrencesBetween, zonedToUtc, type EffectRegistry, type PreviewReport, type ReflexInput, type Row, type Tide } from '@niscorp/tide';
import { DAY, HOUR, localDate, MINUTE, readLedger, recordOf, runUntil, str, transform, TZ, drain, type Snapshot } from './ledger';

export const WEEK_START = zonedToUtc({ year: 2026, month: 3, day: 2 }, 0, 0, TZ);
export const WEEK_END = WEEK_START + 7 * DAY;
export const BY_HAND_AT = WEEK_START + 2 * DAY + 10 * HOUR;

export type Member = { id: string; name: string; email: string; phone: string; app: boolean; renews: string };

export const MEMBERS: readonly Member[] = [
  { id: 'ada', name: 'Ada', email: 'ada@example.org', phone: '+43 660 111 2233', app: true, renews: '2026-03-05' },
  { id: 'alan', name: 'Alan', email: 'alan@example.org', phone: '+43 660 222 3344', app: true, renews: '2026-03-20' },
  { id: 'grace', name: 'Grace', email: 'grace@example.org', phone: '+43 660 333 4455', app: false, renews: '2026-03-07' },
  { id: 'linus', name: 'Linus', email: 'linus@example.org', phone: '', app: true, renews: '2026-03-03' },
  { id: 'mia', name: 'Mia', email: 'mia@example.org', phone: '+43 660 555 6677', app: true, renews: '2026-03-28' },
  { id: 'ruth', name: 'Ruth', email: 'ruth@example.org', phone: '+43 660 666 7788', app: false, renews: '2026-03-12' },
];

export const CLASSES = {
  morning: { name: 'Morning flow', at: '07:30' },
  power: { name: 'Power hour', at: '12:15' },
  evening: { name: 'Evening stretch', at: '19:00' },
  core: { name: 'Core & breath', at: '18:00' },
  weekend: { name: 'Weekend long flow', at: '10:00' },
} as const;
export type ClassId = keyof typeof CLASSES;

export type Booking = { member: string; cls: ClassId; date: string; madeAt?: number };

export const BOOKINGS: readonly Booking[] = [
  { member: 'ada', cls: 'morning', date: '2026-03-02' },
  { member: 'grace', cls: 'power', date: '2026-03-02' },
  { member: 'mia', cls: 'power', date: '2026-03-02' },
  { member: 'alan', cls: 'evening', date: '2026-03-03' },
  { member: 'ruth', cls: 'evening', date: '2026-03-03' },
  { member: 'ada', cls: 'core', date: '2026-03-04' },
  { member: 'linus', cls: 'core', date: '2026-03-04' },
  { member: 'grace', cls: 'weekend', date: '2026-03-07' },
];

export const NEW_BOOKINGS: readonly Booking[] = [
  { member: 'mia', cls: 'core', date: '2026-03-04', madeAt: WEEK_START + 9 * HOUR + 12 * MINUTE },
  { member: 'alan', cls: 'weekend', date: '2026-03-07', madeAt: WEEK_START + 3 * DAY + 20 * HOUR + 5 * MINUTE },
  { member: 'ruth', cls: 'weekend', date: '2026-03-07', madeAt: WEEK_START + 4 * DAY + 7 * HOUR + 40 * MINUTE },
];

export const nameOf = (id: string): string => MEMBERS.find((m) => m.id === id)?.name ?? id;

export type TriggerId = 'daily' | 'monday' | 'booking' | 'manual';
export type WhoId = 'all' | 'tomorrow' | 'renewing' | 'booker';
export type ChannelId = 'email' | 'sms' | 'push';
export type Choice = { trigger: TriggerId; at: string; who: WhoId; channel: ChannelId };

export const TRIGGERS: readonly { id: TriggerId; label: string }[] = [
  { id: 'daily', label: 'Every day at…' },
  { id: 'monday', label: 'Every Monday at 08:00' },
  { id: 'booking', label: 'When a booking is created' },
  { id: 'manual', label: 'Only by hand' },
];
export const TIMES = ['08:00', '18:00', '21:00'] as const;

export const WHO: readonly { id: WhoId; label: string }[] = [
  { id: 'all', label: 'All members' },
  { id: 'tomorrow', label: 'Members booked into tomorrow’s class' },
  { id: 'renewing', label: 'Members whose plan renews this week' },
  { id: 'booker', label: 'The member who booked' },
];

export const CHANNELS: readonly { id: ChannelId; label: string; icon: string }[] = [
  { id: 'email', label: 'Email', icon: '✉️' },
  { id: 'sms', label: 'SMS', icon: '💬' },
  { id: 'push', label: 'Push', icon: '🔔' },
];

export const whyNot = (trigger: TriggerId, who: WhoId): string | undefined => {
  if (trigger === 'booking' && who !== 'booker')
    return 'A booking is one event about one member — the fact already carries their row. Pick “The member who booked”.';
  if (trigger !== 'booking' && who === 'booker') return 'Only a booking has a booker. Pick “When a booking is created” first.';
  return undefined;
};

export const settle = (c: Choice): Choice =>
  whyNot(c.trigger, c.who) === undefined ? c : { ...c, who: c.trigger === 'booking' ? 'booker' : 'all' };

const TEXT: Record<WhoId, string> = {
  all: 'Hi {{name}} — this week at Acme Studio: five classes, one new playlist.',
  tomorrow: 'Hi {{name}}, see you tomorrow: {{classes}}.',
  renewing: 'Hi {{name}}, your plan renews on {{renews}} — €89.00.',
  booker: 'Booked: {{className}} on {{day}} at {{time}}. See you there, {{name}}.',
};

export const reflexOf = (c: Choice): ReflexInput => {
  const on: ReflexInput['on'] =
    c.trigger === 'daily'
      ? { clock: { every: 'day', at: c.at, tz: TZ } }
      : c.trigger === 'monday'
        ? { clock: { every: 'week', on: 'mon', at: '08:00', tz: TZ } }
        : c.trigger === 'booking'
          ? { fact: { entity: 'bookings', op: 'insert' } }
          : { manual: {} };
  const when = c.trigger === 'daily' ? `every day at ${c.at}` : c.trigger === 'monday' ? 'every Monday at 08:00' : c.trigger === 'booking' ? 'when a booking is created' : 'when someone presses “run now”';
  const whom = WHO.find((w) => w.id === c.who)?.label.toLowerCase() ?? '';
  const channel = CHANNELS.find((x) => x.id === c.channel)?.label ?? '';
  // A clock run selects for its occurrence's day, so a run caught up late still asks
  // about its own day. Prism's `$ref` refuses a missing path, so each names the one that exists.
  const day = { $ref: 'clock' in on ? '$.occurrence.at' : '$.now' };
  return {
    id: `studio.${c.channel}-${c.who}`,
    intent: `${channel} to ${whom}, ${when}.`,
    on,
    // With no selection declared, the row a write fact carries is the unit.
    ...(c.who === 'booker' ? {} : { select: { query: { table: 'members', who: c.who, day }, mode: 'each' as const, unitKey: 'id' } }),
    effect: {
      name: `${c.channel}.send`,
      input: {
        to: { $ref: c.who === 'booker' ? '$.row.member' : '$.row.id' },
        text: { $interpolate: { template: TEXT[c.who], values: { $ref: '$.row' } } },
      },
    },
    policy: { retry: { max: 2, backoff: 'exponential', baseMs: 5 * MINUTE } },
  };
};

export type Message = { at: number; member: string; channel: ChannelId; text: string; delivered: boolean; reason?: string };

const bookingRow = (b: Booking): Row => {
  const m = MEMBERS.find((x) => x.id === b.member);
  const d = new Date(`${b.date}T12:00:00Z`);
  return {
    member: b.member,
    name: m?.name ?? b.member,
    className: CLASSES[b.cls].name,
    day: `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()] ?? ''} ${d.getUTCDate()} March`,
    time: CLASSES[b.cls].at,
    date: b.date,
  };
};

type World = { tide: Tide; messages: Message[]; bookings: Booking[] };

const reach = (m: Member | undefined, channel: ChannelId): string | undefined => {
  if (m === undefined) return 'no such member';
  if (channel === 'sms' && m.phone === '') return 'no phone number on file';
  if (channel === 'push' && !m.app) return 'hasn’t installed the app';
  return undefined;
};

const makeWorld = (): World => {
  const messages: Message[] = [];
  const bookings: Booking[] = [...BOOKINGS];

  const sender = (channel: ChannelId): EffectRegistry[string] => ({
    run: (input, ctx) => {
      const rec = recordOf(input);
      const member = str(rec['to']);
      const why = reach(MEMBERS.find((m) => m.id === member), channel);
      // An unreachable member is returned, not thrown: a retry would not change it.
      messages.push({ at: ctx.now, member, channel, text: str(rec['text']), delivered: why === undefined, ...(why === undefined ? {} : { reason: why }) });
      return why === undefined ? { sent: true } : { sent: false, reason: why };
    },
    preview: (input) => {
      const rec = recordOf(input);
      const member = str(rec['to']);
      const why = reach(MEMBERS.find((m) => m.id === member), channel);
      return { to: member, text: str(rec['text']), ...(why === undefined ? {} : { skip: why }) };
    },
  });

  const tide = createTide({
    store: createMemoryStore(),
    transform,
    select: (query) => {
      const q = recordOf(query);
      const day = typeof q['day'] === 'number' ? q['day'] : WEEK_START;
      const today = localDate(day);
      const tomorrow = localDate(day + DAY);
      const weekOut = localDate(day + 7 * DAY);
      const rows = MEMBERS.map((m) => ({ ...m, classes: bookings.filter((b) => b.member === m.id && b.date === tomorrow).map((b) => `${CLASSES[b.cls].name} ${CLASSES[b.cls].at}`).join(', ') }));
      if (q['who'] === 'tomorrow') return rows.filter((r) => r.classes !== '');
      if (q['who'] === 'renewing') return rows.filter((r) => r.renews > today && r.renews <= weekOut);
      return rows;
    },
    effects: { 'email.send': sender('email'), 'sms.send': sender('sms'), 'push.send': sender('push') },
  });
  return { tide, messages, bookings };
};

const bookingFact = (b: Booking, at: number) => ({ kind: 'write' as const, entity: 'bookings', op: 'insert' as const, row: bookingRow(b), at });

export const previewAt = (c: Choice): number => {
  const reflex = reflexOf(c);
  if ('clock' in reflex.on && 'every' in reflex.on.clock) {
    const first = occurrencesBetween(reflex.on.clock, WEEK_START, WEEK_END, 1)[0];
    return first?.at ?? WEEK_START;
  }
  if (c.trigger === 'booking') return NEW_BOOKINGS[0]?.madeAt ?? WEEK_START;
  return BY_HAND_AT;
};

export const previewOf = async (c: Choice): Promise<PreviewReport> => {
  const { tide } = makeWorld();
  const reflex = reflexOf(c);
  await tide.load([reflex], { at: WEEK_START });
  const now = previewAt(c);
  const first = NEW_BOOKINGS[0];
  return tide.preview(String(reflex.id), c.trigger === 'booking' && first !== undefined ? { now, fact: bookingFact(first, now) } : { now });
};

export type WeekResult = { messages: readonly Message[]; ledger: Snapshot };

export const runWeek = async (c: Choice): Promise<WeekResult> => {
  const { tide, messages, bookings } = makeWorld();
  const reflex = reflexOf(c);
  await tide.load([reflex], { at: WEEK_START });
  const stops = [...NEW_BOOKINGS.map((b) => b.madeAt ?? 0), BY_HAND_AT];
  await runUntil(tide, WEEK_START, WEEK_END, stops, async (at) => {
    for (const b of NEW_BOOKINGS.filter((x) => x.madeAt === at)) {
      bookings.push(b);
      await tide.ingest(bookingFact(b, at));
    }
    if (at === BY_HAND_AT && c.trigger === 'manual') {
      await tide.fire(String(reflex.id), { now: at, by: 'olivia' });
      await drain(tide, at);
    }
  });
  return { messages, ledger: await readLedger(tide, WEEK_END) };
};
