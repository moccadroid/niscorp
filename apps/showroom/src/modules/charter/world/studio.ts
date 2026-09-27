import { PGlite } from '@electric-sql/pglite';
import { createPglitePool } from '@niscorp/vex/pglite';
import {
  createMemoryCache,
  createPostgresAdapter,
  createQueryEngine,
  createScopePolicy,
  handleQuery,
  mergeScopePolicies,
  scopeGrants,
  seedCache,
  type QueryEngine,
  type ScopeBehaviors,
  type ScopePolicy,
  type SeedEntry,
} from '@niscorp/vex';
import { resolvePrincipal, resolveScoping, type Charter } from '@niscorp/charter';

// ═══════════════════════════════════════════════════════════
// Acme Studio, as its policy sees it.
//
// Four people, one app, one charter. Everything that decides what a person sees
// is real: @niscorp/charter resolves the roles, vex compiles the resolved data
// grants into a scope policy, and every read goes through vex's own
// `handleQuery` — the endpoint moss serves — against Postgres in this page.
// Only the studio is made up.
// ═══════════════════════════════════════════════════════════

export type Person = { id: string; name: string; blurb: string; userId?: string; roles: readonly string[] };

export const PEOPLE: readonly Person[] = [
  { id: 'olivia', name: 'Olivia', blurb: 'owns the studio', userId: 'u-olivia', roles: ['owner'] },
  { id: 'theo', name: 'Theo', blurb: 'teaches here — and trains here too', userId: 'm-theo', roles: ['instructor', 'member'] },
  { id: 'mia', name: 'Mia', blurb: 'a member', userId: 'm-mia', roles: ['member'] },
  { id: 'visitor', name: 'A visitor', blurb: 'not signed in', roles: ['guest'] },
];

export const ROLES = ['guest', 'member', 'instructor', 'owner'] as const;

// ── the screens the app ships (the actions universe) ────────────

export type Screen = { id: string; title: string; icon: string };

export const SCREENS: readonly Screen[] = [
  { id: 'welcome', title: 'Welcome', icon: '👋' },
  { id: 'home', title: 'Home', icon: '🏠' },
  { id: 'timetable', title: 'Timetable', icon: '🗓' },
  { id: 'me.bookings', title: 'My bookings', icon: '🎟' },
  { id: 'me.bill', title: 'My plan', icon: '💳' },
  { id: 'roster', title: 'Class roster', icon: '📋' },
  { id: 'members', title: 'Members', icon: '👥' },
  { id: 'revenue', title: 'Revenue', icon: '📈' },
  { id: 'settings', title: 'Settings', icon: '⚙️' },
];

export const ACTIONS: readonly string[] = SCREENS.map((s) => s.id);
export const TABLES = ['members', 'subscriptions', 'classes', 'bookings'] as const;
export const DATA: readonly string[] = scopeGrants([...TABLES]);

// The first screen a person lands on: the first candidate they actually hold.
export const LANDING_CANDIDATES = ['home', 'welcome'] as const;

// ── the charter ─────────────────────────────────────────────────

export const CHARTER: Charter = {
  guest: { actions: ['welcome', 'timetable'], data: ['classes.read'] },
  member: {
    actions: ['home', 'timetable', 'me.*'],
    data: ['classes.read', 'bookings.read', 'members.read', 'subscriptions.read'],
    scoping: 'personal',
  },
  instructor: { actions: ['home', 'timetable', 'roster'], data: ['classes.read', 'bookings.read', 'members.read'] },
  owner: { extends: ['instructor'], actions: { allow: ['*'], deny: ['welcome', 'me.*'] }, data: ['*.read'] },
};

// Row behaviors — what a GRANTED read does, per reach. Not access control:
// listing a table here grants nothing. `personal` narrows a table to the
// reader's own rows; a role without a profile reads the default.
export const BEHAVIORS: ScopeBehaviors = {
  members: { default: { read: [] }, personal: { read: [{ match: 'id', to: 'userId' }] } },
  subscriptions: { default: { read: [] }, personal: { read: [{ match: 'member_id', to: 'userId' }] } },
  bookings: { default: { read: [] }, personal: { read: [{ match: 'member_id', to: 'userId' }] } },
  classes: { read: [] },
};

// ── resolution — what moss does per principal at login ──────────

export const grantedActions = (charter: Charter, roles: readonly string[]): ReadonlySet<string> =>
  resolvePrincipal(charter, ACTIONS, [...roles], 'actions');

export const grantedData = (charter: Charter, roles: readonly string[]): ReadonlySet<string> =>
  resolvePrincipal(charter, DATA, [...roles], 'data');

// One policy per role, each at that role's own reach, merged: a person may do
// anything any of their roles permits.
export const policyFor = (charter: Charter, roles: readonly string[]): ScopePolicy =>
  mergeScopePolicies(roles.map((role) => createScopePolicy(resolvePrincipal(charter, DATA, [role], 'data'), BEHAVIORS, resolveScoping(charter, role))));

export const landingOf = (granted: ReadonlySet<string>): string | undefined => LANDING_CANDIDATES.find((id) => granted.has(id));

// ── the database ────────────────────────────────────────────────

const DDL = `
CREATE TABLE members (id text PRIMARY KEY, name text NOT NULL);
CREATE TABLE subscriptions (member_id text PRIMARY KEY REFERENCES members(id), plan text NOT NULL, price_cents integer NOT NULL);
CREATE TABLE classes (id text PRIMARY KEY, name text NOT NULL, starts_at text NOT NULL, slot integer NOT NULL, instructor text NOT NULL);
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
  ['m-edsger', 'Edsger', 'Student', 5900],
];

const CLASSES: readonly [string, string, string, string][] = [
  ['c-flow', 'Morning flow', 'Mon 07:30', 'Theo'],
  ['c-power', 'Power hour', 'Mon 12:15', 'Olivia'],
  ['c-stretch', 'Evening stretch', 'Tue 19:00', 'Theo'],
  ['c-core', 'Core & breath', 'Wed 18:00', 'Olivia'],
  ['c-weekend', 'Weekend long flow', 'Sat 10:00', 'Theo'],
];

// Who booked what. Theo trains in Olivia's classes; Mia is a regular.
const BOOKINGS: readonly [string, string][] = [
  ['c-flow', 'm-mia'], ['c-stretch', 'm-mia'], ['c-weekend', 'm-mia'],
  ['c-power', 'm-theo'], ['c-core', 'm-theo'],
  ['c-flow', 'm-ada'], ['c-power', 'm-ada'], ['c-core', 'm-ada'],
  ['c-flow', 'm-grace'], ['c-stretch', 'm-grace'],
  ['c-power', 'm-linus'], ['c-weekend', 'm-linus'], ['c-core', 'm-linus'],
  ['c-flow', 'm-ruth'], ['c-weekend', 'm-ruth'],
  ['c-stretch', 'm-alan'], ['c-core', 'm-alan'],
  ['c-power', 'm-edsger'], ['c-weekend', 'm-edsger'],
];

const q = (s: string): string => `'${s.replace(/'/g, "''")}'`;
const SEED = [
  `INSERT INTO members (id, name) VALUES ${MEMBERS.map(([id, name]) => `(${q(id)}, ${q(name)})`).join(', ')};`,
  `INSERT INTO subscriptions (member_id, plan, price_cents) VALUES ${MEMBERS.map(([id, , plan, price]) => `(${q(id)}, ${q(plan)}, ${price})`).join(', ')};`,
  `INSERT INTO classes (id, name, starts_at, slot, instructor) VALUES ${CLASSES.map(([id, name, at, who], i) => `(${q(id)}, ${q(name)}, ${q(at)}, ${i + 1}, ${q(who)})`).join(', ')};`,
  `INSERT INTO bookings (id, class_id, member_id) VALUES ${BOOKINGS.map(([c, m], i) => `('b${i + 1}', ${q(c)}, ${q(m)})`).join(', ')};`,
].join('\n');

// ── the reads the screens replay ────────────────────────────────

const money = (value: unknown) => ({ $localeMoney: { value, currency: 'EUR', locale: 'en-IE' } });
// An object shape hands the mapping the one aggregated row as `$.result`.
const field = (key: string) => ({ $get: { from: { $ref: '$.result' }, path: [key], fallback: 0 } });

export const ENTRIES: readonly SeedEntry[] = [
  {
    fingerprint: 'classes/timetable',
    intent: 'This week’s classes, in order',
    dsl: {
      from: ['classes'],
      fields: [{ field: 'classes.name', as: 'name' }, { field: 'classes.starts_at', as: 'time' }, { field: 'classes.instructor', as: 'instructor' }],
      sort: [{ field: 'classes.slot', dir: 'asc' }],
    },
  },
  {
    fingerprint: 'bookings/mine',
    intent: 'The classes the reader has booked',
    // "Mine" means mine whatever else the reader is — see the reach toggle.
    reach: 'personal',
    dsl: {
      from: ['bookings', 'classes'],
      fields: [{ field: 'classes.name', as: 'name' }, { field: 'classes.starts_at', as: 'time' }],
      sort: [{ field: 'classes.slot', dir: 'asc' }],
    },
  },
  {
    fingerprint: 'bookings/roster',
    intent: 'Who is booked into which class',
    dsl: {
      from: ['bookings', 'classes', 'members'],
      fields: [{ field: 'members.name', as: 'name' }, { field: 'classes.name', as: 'class' }, { field: 'classes.starts_at', as: 'time' }],
      sort: [{ field: 'classes.slot', dir: 'asc' }, { field: 'members.name', dir: 'asc' }],
    },
  },
  {
    fingerprint: 'members/all',
    intent: 'Everyone with a membership',
    dsl: { from: ['members', 'subscriptions'], fields: [{ field: 'members.name', as: 'name' }, { field: 'subscriptions.plan', as: 'plan' }], sort: [{ field: 'members.name', dir: 'asc' }] },
  },
  {
    fingerprint: 'subscriptions/revenue',
    intent: 'What memberships bring in each month',
    shape: { monthly: '', members: 0 },
    dsl: { from: ['subscriptions'], aggregate: { monthly: { sum: 'subscriptions.price_cents' }, members: { count: '*' } } },
    mapping: { monthly: money(field('monthly')), members: field('members') },
  },
];

// The same "my bookings" read WITHOUT its declared reach — the version that
// shipped first, and showed an instructor who trains the whole studio's.
export const MINE_WITHOUT_REACH: SeedEntry = {
  fingerprint: 'bookings/mine-unpinned',
  intent: 'The classes the reader has booked (no declared reach)',
  dsl: {
    from: ['bookings', 'classes'],
    fields: [{ field: 'classes.name', as: 'name' }, { field: 'classes.starts_at', as: 'time' }],
    sort: [{ field: 'classes.slot', dir: 'asc' }],
  },
};

// Which read each screen replays.
export const SCREEN_READ: Readonly<Record<string, string>> = {
  timetable: 'classes/timetable',
  'me.bookings': 'bookings/mine',
  'me.bill': 'subscriptions/revenue',
  roster: 'bookings/roster',
  members: 'members/all',
  revenue: 'subscriptions/revenue',
};

// ── the studio server: one engine, a policy per person ──────────

export type Answer = { status: number; body: unknown; where: readonly string[] };

// `open` asks the same endpoint with no policy at all — how most apps serve
// data, with the lock drawn on the button instead.
export type Studio = { ask: (charter: Charter, person: Person, fingerprint: string, open?: boolean) => Promise<Answer> };

const boot = async (): Promise<Studio> => {
  const db = new PGlite();
  await db.exec(DDL);
  await db.exec(SEED);
  const sql: string[] = [];
  const engine: QueryEngine = createQueryEngine({
    adapter: createPostgresAdapter({ pool: createPglitePool(db) }),
    cache: createMemoryCache(),
    onEvent: (e) => {
      if (e.type === 'query.sql') sql.push(e.sql);
    },
  });
  await engine.introspect();
  await seedCache(engine.cache, [...ENTRIES, MINE_WITHOUT_REACH]);

  // Requests run one at a time, so the SQL captured during a request is its own.
  let queue: Promise<unknown> = Promise.resolve();
  const ask = (charter: Charter, person: Person, fingerprint: string, open = false): Promise<Answer> => {
    const run = async (): Promise<Answer> => {
      sql.length = 0;
      const grants = grantedData(charter, person.roles);
      const result = await handleQuery(
        open
          ? { engine, locked: true }
          : {
              engine,
              locked: true,
              scopePolicy: policyFor(charter, person.roles),
              policyForReach: (reach) => createScopePolicy(grants, BEHAVIORS, reach),
            },
        { fingerprint, context: {} },
        person.userId === undefined ? {} : { userId: person.userId },
      );
      const where = sql.flatMap((s) => {
        const at = s.search(/\bWHERE\b/i);
        return at < 0 ? [] : [s.slice(at).replace(/\s+ORDER BY[\s\S]*$/i, '').replace(/\s+LIMIT[\s\S]*$/i, '')];
      });
      return { status: result.status, body: result.body, where };
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
