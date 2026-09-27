import { evaluate } from '@niscorp/prism';
import { createMemoryStore, createTide, zonedParts, type ReflexInput, type Tide } from '@niscorp/tide';
import { readLedger, type Snapshot } from './ledger';

// ═══════════════════════════════════════════════════════════
// Acme Studio's nightly job — run by cron, and run by tide.
//
// The same job, the same members, the same nights, the same accidents. The cron
// side is a SIMULATION of what cron does, written here and labelled as such: it
// wakes every minute, compares the local wall clock to 02:30, and runs the job;
// a crashed job is restarted from the top by its supervisor; while the server is
// down, nothing ticks. The tide side is the real engine and its memory store,
// driven the way a host drives it — including a real crash and takeover.
// ═══════════════════════════════════════════════════════════

export const TZ = 'Europe/Vienna';
export const AT = '02:30';
const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

export const MEMBERS = [
  { id: 'ada', name: 'Ada' },
  { id: 'alan', name: 'Alan' },
  { id: 'grace', name: 'Grace' },
  { id: 'linus', name: 'Linus' },
  { id: 'mia', name: 'Mia' },
  { id: 'ruth', name: 'Ruth' },
] as const;

export type Job = { id: string; what: string; subject: string };

export const REMINDERS: Job = { id: 'studio.reminders', what: 'tomorrow’s class reminders', subject: 'See you tomorrow — Morning flow, 07:30' };
export const INVOICES: Job = { id: 'studio.invoices', what: 'the nightly invoice run', subject: 'Your Acme Studio invoice' };

export type Scenario = {
  id: string;
  label: string;
  story: string;
  job: Job;
  // Local calendar dates of the five nights shown, YYYY-MM-DD.
  nights: readonly string[];
  // Nights the job crashes on — once, after this many emails have gone out.
  crash?: { night: string; after: number };
  // Nights the server is down for (it comes back the morning after the last).
  down?: readonly string[];
  cron: string;
  tide: string;
};

const nightsFrom = (y: number, m: number, d: number): string[] =>
  Array.from({ length: 5 }, (_, i) => new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10));

export const SCENARIOS: readonly Scenario[] = [
  {
    id: 'ordinary',
    label: 'An ordinary week',
    story: 'Every night at 02:30 the studio emails each member tomorrow’s class. Nothing goes wrong.',
    job: REMINDERS,
    nights: nightsFrom(2026, 3, 2),
    cron: 'Five nights, six emails a night. Cron is fine when nothing happens.',
    tide: 'Five nights, six emails a night. So is tide.',
  },
  {
    id: 'crash',
    label: 'The job crashes halfway',
    story: 'On Tuesday the process dies right after the mail provider accepts Grace’s email — before anyone recorded that it was sent.',
    job: REMINDERS,
    nights: nightsFrom(2026, 3, 2),
    crash: { night: '2026-03-03', after: 3 },
    cron: 'The supervisor restarts the job and it runs from the top: Ada, Alan and Grace get Tuesday’s email twice.',
    tide: 'The new process takes over what the dead one held. Ada and Alan are not emailed again — their tasks are done rows. Grace’s send is retried with the same idempotency key, so the provider drops the copy.',
  },
  {
    id: 'spring',
    label: 'Clocks go forward',
    story: 'On 29 March Vienna skips from 02:00 straight to 03:00. There is no 02:30 that night.',
    job: REMINDERS,
    nights: nightsFrom(2026, 3, 27),
    cron: 'The wall clock never reads 02:30 on the 29th, so the job never runs. Nobody gets Monday’s reminder, and nothing says so.',
    tide: 'The 29th is still a day, so it still has a run: it fires once, at 03:30 local. The date is the key, not the instant.',
  },
  {
    id: 'autumn',
    label: 'Clocks go back',
    story: 'On 25 October Vienna falls back from 03:00 to 02:00. 02:30 happens twice that night.',
    job: REMINDERS,
    nights: nightsFrom(2026, 10, 23),
    cron: 'The wall clock reads 02:30 twice, so the job runs twice. Every member gets two reminders.',
    tide: 'One date, one key, one run — at the first 02:30. The second one finds the key already used.',
  },
  {
    id: 'down',
    label: 'Three nights down',
    story: 'The server is down from Tuesday to Thursday night and comes back on Friday. This time the job is the nightly invoice run.',
    job: INVOICES,
    nights: nightsFrom(2026, 3, 9),
    down: ['2026-03-10', '2026-03-11', '2026-03-12'],
    cron: 'Cron does not run what it missed. Three nights of invoices are never sent, and no log line says they were skipped.',
    tide: 'This reflex is authored `catchUp: run`, so the three missed nights run when the server returns — late, and each recorded. (Reminders would say `skip`: a late reminder is worse than none.)',
  },
];

export type Delivery = { member: string; night: string; at: number; late?: boolean; dropped?: boolean };
export type LogLine = { night: string; text: string; tone: 'ok' | 'bad' | 'warn' | 'idle' };
// `ledger` is tide's own rows after the week — the cron side has none to show.
export type Side = { deliveries: readonly Delivery[]; log: readonly LogLine[]; ledger?: Snapshot };

const localDate = (at: number): string => {
  const p = zonedParts(at, TZ);
  return `${String(p.year)}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
};
const localTime = (at: number): string => {
  const p = zonedParts(at, TZ);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
};

// The span a scenario covers, in UTC: noon before the first night to noon after the last.
const spanOf = (s: Scenario): { from: number; to: number } => {
  const first = s.nights[0] ?? '2026-03-02';
  const last = s.nights[s.nights.length - 1] ?? first;
  return { from: Date.parse(`${first}T00:00:00Z`) - 12 * HOUR, to: Date.parse(`${last}T00:00:00Z`) + 12 * HOUR };
};

const isDown = (s: Scenario, at: number): boolean => {
  const downs = s.down ?? [];
  if (downs.length === 0) return false;
  const first = downs[0] ?? '';
  const last = downs[downs.length - 1] ?? '';
  // Down from the evening before the first night; back just after midnight UTC
  // the day after the last — before that night's run is due.
  return at >= Date.parse(`${first}T00:00:00Z`) - 6 * HOUR && at < Date.parse(`${last}T00:00:00Z`) + DAY;
};

// ── cron, simulated ─────────────────────────────────────────────

export const runCron = (s: Scenario): Side => {
  const deliveries: Delivery[] = [];
  const log: LogLine[] = [];
  const { from, to } = spanOf(s);
  let crashed = false;
  for (let t = from; t < to; t += MINUTE) {
    if (localTime(t) !== AT) continue;
    const night = localDate(t);
    if (!s.nights.includes(night)) continue;
    if (isDown(s, t)) {
      log.push({ night, text: `${night} · (no log line at all — the server was down and cron never ticked)`, tone: 'bad' });
      continue;
    }
    const send = (members: readonly (typeof MEMBERS)[number][], at: number) => {
      for (const m of members) deliveries.push({ member: m.id, night, at });
    };
    if (s.crash !== undefined && s.crash.night === night && !crashed) {
      crashed = true;
      send(MEMBERS.slice(0, s.crash.after), t);
      log.push({ night, text: `${night} · 02:30 job started — crashed after ${s.crash.after} emails`, tone: 'bad' });
      send(MEMBERS, t + MINUTE);
      log.push({ night, text: `${night} · supervisor restarted the job — sent all ${MEMBERS.length} again`, tone: 'bad' });
      continue;
    }
    send(MEMBERS, t);
    const twice = deliveries.filter((d) => d.night === night && d.member === MEMBERS[0].id).length > 1;
    log.push({ night, text: `${night} · wall clock read 02:30 (${new Date(t).toISOString().slice(11, 16)}Z) — job ran${twice ? ' AGAIN' : ''}`, tone: twice ? 'bad' : 'ok' });
  }
  for (const night of s.nights) {
    if (!log.some((l) => l.night === night)) log.push({ night, text: `${night} · the wall clock never read 02:30 — no run`, tone: 'bad' });
  }
  log.sort((a, b) => a.night.localeCompare(b.night));
  return { deliveries, log };
};

// ── tide, for real ──────────────────────────────────────────────

const reflexFor = (s: Scenario): ReflexInput => ({
  id: s.job.id,
  intent: `Send ${s.job.what} every night at ${AT}.`,
  on: { clock: { every: 'day', at: AT, tz: TZ } },
  select: { query: { table: 'members' }, mode: 'each', unitKey: 'id' },
  effect: { name: 'mail.send', input: { to: { $ref: '$.row.id' }, night: { $ref: '$.occurrence.key' } } },
  // Every missed night is its own run, and they may overlap as they catch up.
  policy: { catchUp: 'run', overlap: 'allow' },
});

const quiet = (r: { materialized: number; factsMatched: number; tasksCreated: number; executed: number; runsSettled: number }): boolean =>
  r.materialized + r.factsMatched + r.tasksCreated + r.executed + r.runsSettled === 0;

const HUNG = Symbol('hung');

export const runTide = async (s: Scenario): Promise<Side> => {
  const deliveries: Delivery[] = [];
  const log: LogLine[] = [];
  const store = createMemoryStore();
  // The mail provider honours an idempotency key: a second send with a key it
  // has seen is accepted and dropped.
  const seenKeys = new Set<string>();
  let crashing = s.crash !== undefined;

  const make = (): Tide =>
    createTide({
      store,
      leaseMs: 5 * MINUTE,
      transform: (config, source) => evaluate(config, JSON.parse(JSON.stringify(source))),
      select: () => MEMBERS.map((m) => ({ ...m })),
      effects: {
        'mail.send': {
          run: (input: unknown, ctx) => {
            const rec = typeof input === 'object' && input !== null ? Object.fromEntries(Object.entries(input)) : {};
            const member = String(rec['to'] ?? '');
            const night = String(rec['night'] ?? '');
            const dropped = seenKeys.has(ctx.taskKey);
            seenKeys.add(ctx.taskKey);
            const due = Date.parse(`${night}T00:00:00Z`);
            deliveries.push({ member, night, at: ctx.now, dropped, late: ctx.now - due > DAY / 2 });
            // The crash: the provider has accepted Grace's email, and the
            // process dies before it can record that.
            if (crashing && s.crash !== undefined && night === s.crash.night && member === MEMBERS[s.crash.after - 1]?.id) {
              crashing = false;
              return new Promise(() => undefined);
            }
            return { sent: true };
          },
        },
      },
    });

  const { from, to } = spanOf(s);
  let tide = make();
  await tide.load([reflexFor(s)], { at: from });

  const drain = async (at: number): Promise<'quiet' | 'hung'> => {
    for (let pass = 0; pass < 20; pass += 1) {
      const report = await Promise.race([tide.advance({ now: at, limit: 500 }), new Promise<typeof HUNG>((r) => setTimeout(() => r(HUNG), 250))]);
      if (report === HUNG) return 'hung';
      if (quiet(report)) return 'quiet';
    }
    return 'quiet';
  };

  for (let t = from; t <= to; t += 15 * MINUTE) {
    if (isDown(s, t)) continue;
    if ((await drain(t)) === 'hung') {
      log.push({ night: localDate(t), text: `${localDate(t)} · the process died mid-run (after the provider accepted Grace’s email)`, tone: 'bad' });
      tide = make();
      await tide.load([reflexFor(s)], { at: from });
      log.push({ night: localDate(t), text: `${localDate(t)} · a new process started; the dead one’s claims come back after their lease`, tone: 'warn' });
    }
  }

  const runs = await tide.ledger.runs({ limit: 50 });
  for (const run of [...runs].reverse()) {
    const night = run.occurrence ?? '';
    if (!s.nights.includes(night)) continue;
    const firstSend = deliveries.find((d) => d.night === night);
    const when = firstSend === undefined ? '' : ` at ${localTime(firstSend.at)} local${firstSend.late === true ? ` on ${localDate(firstSend.at)} — late, caught up` : ''}`;
    log.push({ night, text: `${night} · run ${run.state}: ${run.done}/${run.total} sent${when}`, tone: run.state === 'settled' ? (firstSend?.late === true ? 'warn' : 'ok') : 'idle' });
  }
  log.sort((a, b) => a.night.localeCompare(b.night));
  return { deliveries, log, ledger: await readLedger(tide, to) };
};

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const localStamp = (at: number): string => {
  const p = zonedParts(at, TZ);
  return `${DOW[new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay()] ?? ''} ${p.day} · ${localTime(at)}`;
};
