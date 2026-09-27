import { PGlite } from '@electric-sql/pglite';
import { createPglitePool } from '@niscorp/vex/pglite';
import { createMemoryCache, createPostgresAdapter, createQueryEngine, seedCache, type QueryEngine, type SeedEntry } from '@niscorp/vex';
import { makeGenerateDsl, makeMapToShape } from '../runtime/live';

// ═══════════════════════════════════════════════════════════
// Acme Studio's database, and the questions its owner asks it.
//
// Real: Postgres in the page (PGlite), a real vex engine over it, the DSL →
// SQL compiler, the Prism mappings, the cache. Every answer on the landing
// page is this engine replaying an entry by its fingerprint.
//
// Authored here: the studio's rows, and the DSL of each seeded question. In an
// app that DSL is written once — by a model the first time somebody asks, or by
// hand — and stored under a name. These were written by hand. When a model key
// is set in Signal → Settings the page can also ask the question fresh, and then
// the DSL really comes from the model (makeGenerateDsl, the showroom's live hook).
// ═══════════════════════════════════════════════════════════

const DDL = `
CREATE TABLE members (id text PRIMARY KEY, name text NOT NULL, email text NOT NULL);
CREATE TABLE subscriptions (member_id text PRIMARY KEY REFERENCES members(id), plan text NOT NULL, price_cents integer NOT NULL);
CREATE TABLE classes (id text PRIMARY KEY, name text NOT NULL, starts_at text NOT NULL, slot integer NOT NULL, instructor text NOT NULL, capacity integer NOT NULL);
CREATE TABLE bookings (id text PRIMARY KEY, class_id text NOT NULL REFERENCES classes(id), member_id text NOT NULL REFERENCES members(id));
`;

const MEMBERS: readonly [string, string, string, number][] = [
  ['m-mia', 'Mia', 'Monthly', 8900],
  ['m-theo', 'Theo', 'Staff rate', 2900],
  ['m-ada', 'Ada', 'Monthly', 8900],
  ['m-grace', 'Grace', 'Ten-pass', 12000],
  ['m-linus', 'Linus', 'Monthly', 8900],
  ['m-ruth', 'Ruth', 'Annual', 7400],
  ['m-alan', 'Alan', 'Monthly', 8900],
];

// [id, name, when, instructor, capacity]
export const CLASSES: readonly [string, string, string, string, number][] = [
  ['c-flow', 'Morning flow', 'Mon 07:30', 'Theo', 6],
  ['c-power', 'Power hour', 'Mon 12:15', 'Olivia', 8],
  ['c-stretch', 'Evening stretch', 'Tue 19:00', 'Theo', 10],
  ['c-core', 'Core & breath', 'Wed 18:00', 'Olivia', 4],
  ['c-weekend', 'Weekend long flow', 'Sat 10:00', 'Theo', 12],
];

const BOOKINGS: readonly [string, string][] = [
  ['c-flow', 'm-mia'], ['c-flow', 'm-ada'], ['c-flow', 'm-grace'], ['c-flow', 'm-ruth'], ['c-flow', 'm-linus'],
  ['c-power', 'm-theo'], ['c-power', 'm-ada'], ['c-power', 'm-linus'],
  ['c-stretch', 'm-mia'], ['c-stretch', 'm-grace'], ['c-stretch', 'm-alan'],
  ['c-core', 'm-theo'], ['c-core', 'm-ada'], ['c-core', 'm-linus'], ['c-core', 'm-alan'],
  ['c-weekend', 'm-mia'], ['c-weekend', 'm-ruth'],
];

const q = (s: string): string => `'${s.replace(/'/g, "''")}'`;
const SEED = [
  `INSERT INTO members (id, name, email) VALUES ${MEMBERS.map(([id, name]) => `(${q(id)}, ${q(name)}, ${q(`${name.toLowerCase()}@example.com`)})`).join(', ')};`,
  `INSERT INTO subscriptions (member_id, plan, price_cents) VALUES ${MEMBERS.map(([id, , plan, price]) => `(${q(id)}, ${q(plan)}, ${price})`).join(', ')};`,
  `INSERT INTO classes (id, name, starts_at, slot, instructor, capacity) VALUES ${CLASSES.map(([id, name, at, who, cap], i) => `(${q(id)}, ${q(name)}, ${q(at)}, ${i + 1}, ${q(who)}, ${cap})`).join(', ')};`,
  `INSERT INTO bookings (id, class_id, member_id) VALUES ${BOOKINGS.map(([c, m], i) => `('b${i + 1}', ${q(c)}, ${q(m)})`).join(', ')};`,
].join('\n');

// ── Olivia's questions ──────────────────────────────────────────

export type Question = {
  entry: SeedEntry & { intent: string; shape: unknown };
  // Context the replay carries — the values, never the query.
  context: Record<string, unknown>;
  // The phone's title for the answer.
  screen: string;
};

const row = (key: string) => ({ $get: { from: { $var: 'r' }, path: [key] } });
const money = (value: unknown) => ({ $localeMoney: { value, currency: 'EUR', locale: 'de-AT' } });

export const QUESTIONS: readonly Question[] = [
  {
    screen: 'How full is each class?',
    context: {},
    entry: {
      fingerprint: 'olivia/class-fill',
      intent: 'How full is each class this week?',
      shape: [{ name: '', when: '', filled: '' }],
      dsl: {
        from: ['bookings', 'classes'],
        fields: [
          { field: 'classes.name', as: 'name' },
          { field: 'classes.starts_at', as: 'when' },
          { field: 'classes.capacity', as: 'capacity' },
        ],
        aggregate: { booked: { count: '*' } },
        groupBy: ['classes.name', 'classes.starts_at', 'classes.capacity', 'classes.slot'],
        sort: [{ field: 'classes.slot', dir: 'asc' }],
      },
      // The SQL answers numbers; the phone wants "5 of 6".
      mapping: {
        $map: {
          over: { $ref: '$.result' },
          as: 'r',
          body: {
            name: row('name'),
            when: row('when'),
            filled: { $interpolate: { template: '{{b}} of {{c}} booked', values: { b: row('booked'), c: row('capacity') } } },
          },
        },
      },
    },
  },
  {
    screen: 'Who is coming?',
    context: { className: 'Morning flow' },
    entry: {
      fingerprint: 'olivia/roster',
      intent: 'Who is booked into a given class?',
      shape: [{ name: '', plan: '' }],
      dsl: {
        from: ['bookings', 'classes', 'members', 'subscriptions'],
        fields: [
          { field: 'members.name', as: 'name' },
          { field: 'subscriptions.plan', as: 'plan' },
        ],
        filter: { eq: ['classes.name', { $context: 'className' }] },
        sort: [{ field: 'members.name', dir: 'asc' }],
      },
    },
  },
  {
    screen: 'Memberships',
    context: {},
    entry: {
      fingerprint: 'olivia/revenue',
      intent: 'What do memberships bring in each month?',
      shape: { monthly: '', members: 0 },
      dsl: { from: ['subscriptions'], aggregate: { monthly: { sum: 'subscriptions.price_cents' }, members: { count: '*' } } },
      mapping: {
        monthly: money({ $get: { from: { $ref: '$.result' }, path: ['monthly'], fallback: 0 } }),
        members: { $get: { from: { $ref: '$.result' }, path: ['members'], fallback: 0 } },
      },
    },
  },
];

export const CLASS_NAMES: readonly string[] = CLASSES.map(([, name]) => name);

// ── the studio's server ─────────────────────────────────────────

export type Asked = {
  ok: boolean;
  // Where the DSL came from on THIS ask.
  source: 'replayed' | 'generated';
  dsl?: unknown;
  sql?: string;
  rowCount?: number;
  answer?: unknown;
  error?: string;
  ms: number;
};

type Studio = { ask: (question: Question, context: Record<string, unknown>, live: boolean) => Promise<Asked> };

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err));

const boot = async (): Promise<Studio> => {
  const db = new PGlite();
  await db.exec(DDL);
  await db.exec(SEED);

  // What happened during the current ask, caught off the engine's own events.
  let seen: { dsl?: unknown; sql?: string; rowCount?: number } = {};
  const adapter = createPostgresAdapter({ pool: createPglitePool(db) });
  const probe = createQueryEngine({ adapter });
  await probe.introspect();
  const engine: QueryEngine = createQueryEngine({
    adapter,
    cache: createMemoryCache(),
    // Only called when a question is asked fresh with a model key present.
    generateDsl: makeGenerateDsl(probe.getDslSchema()),
    mapToShape: makeMapToShape(),
    onEvent: (e) => {
      if (e.type === 'query.dsl') seen = { ...seen, dsl: e.dsl };
      if (e.type === 'query.sql') seen = { ...seen, sql: e.sql };
      if (e.type === 'query.rows') seen = { ...seen, rowCount: e.count };
    },
  });
  await engine.introspect();
  await seedCache(
    engine.cache,
    QUESTIONS.map((x) => x.entry),
  );

  // One ask at a time, so the events caught belong to it.
  let queue: Promise<unknown> = Promise.resolve();
  const ask = (question: Question, context: Record<string, unknown>, live: boolean): Promise<Asked> => {
    const run = async (): Promise<Asked> => {
      seen = {};
      const started = performance.now();
      const { entry } = question;
      try {
        if (live) {
          // A fresh name, emptied first: the engine has never seen this
          // question, so it must generate — the model writes the DSL.
          const fingerprint = `${entry.fingerprint}/fresh`;
          await engine.cache.delete(fingerprint);
          const res = await engine.execute({ fingerprint, intent: entry.intent, shape: entry.shape, context });
          return { ok: true, source: 'generated', ...seen, answer: res.result, ms: performance.now() - started };
        }
        // The call an app makes: a name and the values. No query on the wire.
        const res = await engine.execute({ fingerprint: entry.fingerprint, context });
        return { ok: true, source: 'replayed', ...seen, dsl: seen.dsl ?? entry.dsl, answer: res.result, ms: performance.now() - started };
      } catch (err) {
        return { ok: false, source: live ? 'generated' : 'replayed', ...seen, error: messageOf(err), ms: performance.now() - started };
      }
    };
    const next = queue.then(run, run);
    queue = next.catch(() => undefined);
    return next;
  };
  return { ask };
};

let studio: Promise<Studio> | undefined;
export const getStudio = (): Promise<Studio> => {
  studio ??= boot();
  return studio;
};
