// What only a real Postgres can show: two connections that meet.
//
// Every test of tide's store and of moss runs on PGlite, a Postgres in the
// test's own process with ONE connection. Two statements never run at the same
// time there, so a fix for something two processes do to each other passes
// with the fix taken out. Three such fixes exist, and each was proved once, by
// hand, on a real server, with scripts that were kept nowhere:
//
//   defect 16  two instances of tide claiming in one serial group
//              (packages/tide/src/store/postgres/claim.ts, the advisory lock)
//   the generation pointer, moved by several processes at once
//              (packages/moss/src/data/pointer.ts, through own-entries.ts)
//   defect 22  two first registrations of one integration at once
//              (packages/moss/src/integrations: the key is kept where the row
//              holds none, and answered only when it was kept)
//
// This is those runs, as a check of the repository: `pnpm check:postgres`. It
// is not a test of a package (no package test starts a server), it runs the
// BUILT packages, and it needs a Postgres it may create databases on:
//
//   CHECK_POSTGRES_URL=postgres://user:password@host:port/postgres
//
// WITHOUT THE VARIABLE IT DOES NOT RUN, says so in one line, and exits 0: a
// machine with no Postgres can still run `pnpm verify`. CI sets it
// (.github/workflows/verify.yml, the `postgres` service), so there it runs.
//
// What it runs, each side of a race on a `pg` pool of its own:
//
//   1. tide's store: its contract, each check on empty tables; then a serial
//      group claimed by two pools at once, and by four claims from each. Every
//      round: exactly one task of the group is held, the claimers were told as
//      many as are held, and the group is claimable again once that is done.
//   2. the generation pointer, through servers that each move it: every move
//      that was not said to have failed is one step of the counter, and every
//      process follows to where it ended.
//   3. the integrations registry: the tables on an empty database and again
//      on a migrated one (`migrateTables`); a registration is one transaction;
//      two first registrations of one integration at once are answered one
//      key, and it is the key the row holds; an approval by one process is
//      served by the other.
//
// It makes databases named `nisc_check_<pid>_<n>` and drops them when it ends.
//
// What it cannot see: anything two connections do that these three races do
// not provoke; a network between the processes and the database; a Postgres
// older or newer than the one it is pointed at.
//
// Run after `pnpm build`. Exits non-zero when a line says `[fail]`.

import { createHash } from 'node:crypto';
import { createServer as createHttp } from 'node:http';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const URL_VARIABLE = 'CHECK_POSTGRES_URL';
const url = process.env[URL_VARIABLE];

if (url === undefined || url === '') {
  console.log(`[check:postgres] NOT RUN: ${URL_VARIABLE} is not set, so nothing here was checked. It needs a real Postgres (two connections that meet); name one to run it: ${URL_VARIABLE}=postgres://user:password@host:port/postgres`);
  process.exit(0);
}

// How many times each race is run. The two that have a fix to take out failed
// in all but one round without it (the header of each part says the numbers),
// so these are many times what it takes to see one.
const SERIAL_ROUNDS = 300;
const POINTER_ROUNDS = 200;
const REGISTRY_ROUNDS = 100;
// How often a server looks at the pointer here, so "within its poll" is short.
const POLL_MS = 50;

// ── what is run ──────────────────────────────────────────────

// The `pg` driver is vex's (a devDependency of that package): this script
// adds no dependency of its own to the workspace.
const requireFromVex = createRequire(join(root, 'packages/vex/package.json'));
const pg: PgModule = requireFromVex('pg');

// WHAT IS USED OF EACH BUILT PACKAGE, described here: this script is no
// workspace's, so it has no package's types to import. A built file is read as
// what is written here once each name it is asked for is there.
type TideStore = {
  ready: Promise<void>;
  appendIfAbsent: (table: string, row: Record<string, unknown>) => Promise<unknown>;
  claim: (spec: Record<string, unknown>) => Promise<{ id: string }[]>;
  query: (spec: Record<string, unknown>) => Promise<unknown[]>;
  cas: (table: string, id: string, from: Record<string, unknown>, to: Record<string, unknown>) => Promise<unknown>;
};
type TideModule = { createTideStore: (pool: Pool) => TideStore; TIDE_TABLES: readonly string[] };
type TideTestingModule = { STORE_CONTRACT: readonly { name: string; run: (store: TideStore) => Promise<void> }[] };
type Server = {
  request: (path: string, init?: RequestInit) => Response | Promise<Response>;
  refresh: () => void;
  generation: () => number;
  actions: () => Record<string, unknown>;
  close: () => void;
};
type TablesReport = { applied: { ref: string }[]; removed: unknown[]; retyped: unknown[] };
type MossModule = {
  createServer: (app: unknown, runtime: Record<string, unknown>) => Promise<Server>;
  defineApp: (app: Record<string, unknown>) => unknown;
  migrateTables: (runtime: Record<string, unknown>, app: unknown) => Promise<TablesReport>;
};
type IntegrationsModule = { createIntegrations: (config: Record<string, unknown>) => unknown };

const built = async <Module,>(path: string, names: readonly (keyof Module & string)[]): Promise<Module> => {
  const loaded: Record<string, unknown> = await import(pathToFileURL(join(root, path)).href);
  for (const name of names) {
    if (loaded[name] === undefined) throw new Error(`${path} does not export \`${name}\`. Was the package built (\`pnpm build\`)?`);
  }
  // The one place a built file is taken for what the types above say of it.
  return Object.assign(Object.create(null), loaded);
};

type Rows = { rows: Record<string, unknown>[]; fields?: { name: string; dataTypeID: number }[] };
type PgClient = { query: (text: string | { text: string; values?: unknown[] }, values?: unknown[]) => Promise<Rows>; release: () => void };
type PgPool = { query: PgClient['query']; connect: () => Promise<PgClient>; end: () => Promise<void> };
type PgModule = { Pool: new (config: { connectionString: string; max: number }) => PgPool };
type Query = (text: string, values?: unknown[]) => Promise<Rows>;
type Pool = { query: Query; transaction: <T>(fn: (tx: { query: Query }) => Promise<T>) => Promise<T> };

// One connection, one transaction: BEGIN … COMMIT on a client checked out for it.
const transactionOn =
  (pool: PgPool, queryOf: (target: PgPool | PgClient) => Query): Pool['transaction'] =>
  async (fn) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn({ query: queryOf(client) });
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  };
// The pool tide's store takes.
const plainQuery = (target: PgPool | PgClient): Query => (text, values) => target.query(text, values);
const tidePool = (pool: PgPool): Pool => ({ query: plainQuery(pool), transaction: transactionOn(pool, plainQuery) });
// The pool vex and moss take: rows, and the type of each column.
const vexQuery =
  (target: PgPool | PgClient): Query =>
  async (text, values) => {
    const result = await target.query({ text, ...(values === undefined ? {} : { values }) });
    return { rows: result.rows, fields: (result.fields ?? []).map((field) => ({ name: field.name, dataTypeID: field.dataTypeID })) };
  };
const vexPool = (pool: PgPool): Pool => ({ query: vexQuery(pool), transaction: transactionOn(pool, vexQuery) });

// ── the server, and the databases this run makes on it ───────

const pools: PgPool[] = [];
const databases: string[] = [];
const admin = new pg.Pool({ connectionString: url, max: 2 });
const poolOn = (database: string, max = 10): PgPool => {
  const where = new URL(url);
  where.pathname = `/${database}`;
  const pool = new pg.Pool({ connectionString: where.href, max });
  pools.push(pool);
  return pool;
};
const createDatabase = async (): Promise<string> => {
  const name = `nisc_check_${process.pid}_${databases.length + 1}`;
  await admin.query(`CREATE DATABASE ${name}`);
  databases.push(name);
  return name;
};

const results: boolean[] = [];
const check = (label: string, passed: boolean, detail = ''): void => {
  results.push(passed);
  console.log(`[${passed ? 'pass' : 'fail'}] ${label}${detail === '' ? '' : ` (${detail})`}`);
};

// What moss and vex say while they boot is not this check's; what a part needs
// of it (a move that was said to have failed) it reads from what was kept.
const said: string[] = [];
const originals = { log: console.log, error: console.error, warn: console.warn, info: console.info };
const quietly = async <T,>(work: () => Promise<T>): Promise<T> => {
  const keep = (...args: unknown[]): void => void said.push(args.map(String).join(' '));
  Object.assign(console, { log: keep, error: keep, warn: keep, info: keep });
  try {
    return await work();
  } finally {
    Object.assign(console, originals);
  }
};
// Asked again until it holds; `ms` is how long a failure takes to say so.
const until = async (holds: () => boolean | Promise<boolean>, ms = 10_000): Promise<boolean> => {
  for (const started = Date.now(); Date.now() - started < ms; ) {
    if (await holds()) return true;
    await new Promise((again) => setTimeout(again, 2));
  }
  return false;
};

// ═══════════════════════════════════════════════════════════════
// 1. TIDE'S STORE
//
// With the advisory lock taken out of the claim (the transaction left in), two
// tasks of one group were held in 299 of 300 rounds of the first race here and
// in 150 of 150 of the second (run on a copy, 2026-10-11, PostgreSQL 18.4).
// ═══════════════════════════════════════════════════════════════

const tideStore = async (): Promise<void> => {
  const { createTideStore, TIDE_TABLES } = await built<TideModule>('packages/tide/dist/postgres.js', ['createTideStore', 'TIDE_TABLES']);
  const { STORE_CONTRACT } = await built<TideTestingModule>('packages/tide/dist/testing.js', ['STORE_CONTRACT']);

  const contract = poolOn(await createDatabase());
  await createTideStore(tidePool(contract)).ready;
  const failures: string[] = [];
  for (const one of STORE_CONTRACT) {
    await contract.query(`TRUNCATE ${TIDE_TABLES.join(', ')} RESTART IDENTITY CASCADE`);
    try {
      await one.run(createTideStore(tidePool(contract)));
    } catch (error) {
      failures.push(`${one.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  check(`tide's store contract on a pool of separate connections: ${STORE_CONTRACT.length} checks, each on empty tables`, failures.length === 0, failures.length === 0 ? `${STORE_CONTRACT.length} passed` : failures.join(' | '));

  // Two stores, each over a pool of its own: two processes.
  const serial = await createDatabase();
  const one = createTideStore(tidePool(poolOn(serial)));
  const other = createTideStore(tidePool(poolOn(serial)));
  await one.ready;
  await other.ready;

  const run = (id: string, reflexId: string) => ({ id, reflexId, version: 'v_0', cause: `occurrence:${id}`, state: 'fanned', depth: 0, total: 2, done: 0, failed: 0, dueAt: 0, createdAt: 0 });
  const task = (runId: string, reflexId: string, unit: string) => ({ runId, reflexId, unit, cause: `occurrence:${runId}`, env: {}, depth: 0, state: 'pending', attempt: 0, claimedUntil: 0, notBefore: 0, createdAt: 0 });
  const claimBy = (store: TideStore, group: string, token: string): Promise<{ id: string }[]> =>
    store.claim({
      table: 'task',
      where: { state: { in: ['pending', 'retrying'] }, notBefore: { lte: 100 } },
      order: [{ by: 'unit' }],
      limit: 10,
      set: { state: 'claimed', token, claimedUntil: 900 },
      onePer: { column: 'reflexId', held: { state: 'claimed', claimedUntil: { gt: 100 } }, only: [group] },
    });

  // `rounds` serial groups, each with two tasks due, each claimed by every
  // claimer at once.
  const contend = async (label: string, claimers: readonly TideStore[], rounds: number): Promise<void> => {
    const count = { twoHeld: 0, noneHeld: 0, stuck: 0, toldOtherwise: 0 };
    for (let round = 0; round < rounds; round += 1) {
      const group = `${label.replace(/\W+/g, '-')}-${round}`;
      await one.appendIfAbsent('run', run(`run-${group}`, group));
      for (const unit of ['u1', 'u2']) await one.appendIfAbsent('task', task(`run-${group}`, group, unit));
      const answers = await Promise.all(claimers.map((store, index) => claimBy(store, group, `claimer-${index}`)));
      const told = answers.reduce((sum, rows) => sum + rows.length, 0);
      const held = (await one.query({ table: 'task', where: { reflexId: group, state: 'claimed' } })).length;
      if (held > 1) count.twoHeld += 1;
      if (held === 0) count.noneHeld += 1;
      if (told !== held) count.toldOtherwise += 1;
      // The group is not stuck: once the held task is done, the next is claimable.
      const first = answers.flat()[0];
      if (held === 1 && first !== undefined) {
        await one.cas('task', first.id, { state: 'claimed' }, { state: 'done', claimedUntil: 0 });
        if ((await claimBy(other, group, 'next')).length !== 1) count.stuck += 1;
      }
    }
    check(
      `a serial group claimed by ${label}, ${rounds} rounds: exactly one task of it is held each time`,
      count.twoHeld === 0 && count.noneHeld === 0 && count.stuck === 0 && count.toldOtherwise === 0,
      `rounds with two held: ${count.twoHeld}, with none held: ${count.noneHeld}, told otherwise than held: ${count.toldOtherwise}, stuck afterwards: ${count.stuck}`,
    );
  };
  await contend('two pools at once', [one, other], SERIAL_ROUNDS);
  await contend('two pools, four claims from each at once', [one, other, one, other, one, other, one, other], SERIAL_ROUNDS / 2);
};

// ═══════════════════════════════════════════════════════════════
// 2. THE GENERATION POINTER
//
// Each server here is a process with a pool of its own, and `refresh()` moves
// the pointer: read where it is, then move it on from there, by the two
// entries of src/data/pointer.ts replayed through the own-entries seam. A
// move that finds the pointer already moved reads again and tries again, five
// times, and then says it could not.
// ═══════════════════════════════════════════════════════════════

const generationPointer = async (): Promise<void> => {
  const { createServer, defineApp } = await built<MossModule>('packages/moss/dist/index.js', ['createServer', 'defineApp']);
  const database = await createDatabase();
  const reader = poolOn(database, 2);
  const serverOn = (): Promise<Server> => {
    const pool = vexPool(poolOn(database));
    return quietly(() => createServer(defineApp({ charter: { public: [] }, actions: {} }), { pool, db: pool, session: 'dev-open', sessionRevalidateMs: POLL_MS }));
  };
  const servers = [await serverOn(), await serverOn()];
  const counter = async (): Promise<number> => Number((await reader.query('SELECT n FROM moss_generation WHERE id = 1')).rows[0]?.['n']);
  const failedMoves = (): number => said.filter((line) => line.includes('could not move the pointer')).length;

  // Two movers on each server, all four at once, `POINTER_ROUNDS` times.
  const movers = [...servers, ...servers];
  const start = await counter();
  const failedBefore = failedMoves();
  let roundsShort = 0;
  await quietly(async () => {
    for (let round = 0; round < POINTER_ROUNDS; round += 1) {
      const from = await counter();
      const failed = failedMoves();
      for (const server of movers) server.refresh();
      // Each move ends by landing or by saying it could not: wait for all four.
      const ended = await until(async () => (await counter()) - from + (failedMoves() - failed) >= movers.length);
      if (!ended) roundsShort += 1;
    }
  });
  const moved = (await counter()) - start;
  const failed = failedMoves() - failedBefore;
  const asked = POINTER_ROUNDS * movers.length;
  check(
    `the generation pointer moved by two processes, two moves each at once, ${POINTER_ROUNDS} rounds: every move that did not say it failed is one step of the counter`,
    moved + failed === asked && roundsShort === 0,
    `${asked} moves asked for; the counter went on by ${moved}; said to have failed: ${failed}; rounds that did not end: ${roundsShort}`,
  );
  check('…and none of them was said to have failed: four movers are fewer than a move tries', failed === 0, `${failed} said they could not move`);

  const end = await counter();
  const followed = await until(() => servers.every((server) => server.generation() === end), 5_000);
  check('each process follows the pointer to where it ended, within its poll', followed, `the counter is at ${end}; the processes are at ${servers.map((server) => server.generation()).join(' and ')}`);
  for (const server of servers) server.close();
};

// ═══════════════════════════════════════════════════════════════
// 3. THE INTEGRATIONS REGISTRY
//
// With the fix for defect 22 taken out (a key answered whether or not it was
// the one kept), both registrations were answered a key and one of the two was
// dead in 99 rounds of 100 (run on a copy, 2026-10-11, PostgreSQL 18.4).
// ═══════════════════════════════════════════════════════════════

const registry = async (): Promise<void> => {
  const { createServer, defineApp, migrateTables } = await built<MossModule>('packages/moss/dist/index.js', ['createServer', 'defineApp', 'migrateTables']);
  const { createIntegrations } = await built<IntegrationsModule>('packages/moss/dist/integrations.js', ['createIntegrations']);
  const OPERATOR = { 'x-operator-key': 'operator', 'content-type': 'application/json' };
  const appOf = (): unknown => defineApp({ charter: { public: [], desk: { actions: ['ext.desk.*'] } }, assignments: {}, actions: {}, features: [createIntegrations({})] });
  const runtimeOf = (pool: PgPool, more: Record<string, unknown> = {}): Record<string, unknown> => ({ pool: vexPool(pool), db: vexPool(pool), session: 'dev-open', operatorKey: 'operator', sessionRevalidateMs: POLL_MS, ...more });

  // A service that answers a bundle at `/<integration>/<version>/bundle`: each
  // version a title and a set of actions of its own.
  const VERSIONS: Record<string, string[]> = { one: ['a1', 'a2'], two: ['b1'] };
  const service = createHttp((req, res) => {
    const [, integration, version] = /^\/([a-z0-9-]+)\/(\w+)\/bundle$/.exec(req.url ?? '') ?? [];
    const names = version === undefined ? undefined : VERSIONS[version];
    if (integration === undefined || names === undefined) {
      res.statusCode = 404;
      res.end();
      return;
    }
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ integration, meta: { title: version }, actions: Object.fromEntries(names.map((name) => [`ext.desk.${integration}.${name}`, { id: `ext.desk.${integration}.${name}`, title: name }])) }));
  });
  await new Promise<void>((listening) => service.listen(0, '127.0.0.1', listening));
  const address = service.address();
  const bundleUrl = (integration: string, version: string): string => `http://127.0.0.1:${address !== null && typeof address === 'object' ? address.port : 0}/${integration}/${version}`;

  try {
    // ── the tables: on an empty database, and again on the migrated one ──
    const database = await createDatabase();
    const migrating = poolOn(database, 4);
    const first = await quietly(() => migrateTables(runtimeOf(migrating), appOf()));
    check('`migrateTables` on an empty database applies the tables', first.applied.length > 0, `${first.applied.length} migrations: ${first.applied.map((migration) => migration.ref).join(', ')}`);
    const second = await quietly(() => migrateTables(runtimeOf(migrating), appOf()));
    check('`migrateTables` again, on the migrated database, applies nothing', second.applied.length === 0 && second.removed.length === 0 && second.retyped.length === 0, `${second.applied.length} applied`);

    // ── two processes over the migrated database ──
    const dbA = vexPool(poolOn(database));
    // What process A sends inside each transaction, and what it writes to the
    // registry's tables outside one. (The pointer is moved outside it: that is
    // a write of its own, to a table of the core's.)
    const transactions: string[][] = [];
    const writesOutside: string[] = [];
    const headOf = (text: string): string => text.trim().split(/\s+/).slice(0, 3).join(' ');
    const watchedA: Pool = {
      query: (text, values) => {
        if (/^\s*(INSERT|UPDATE|DELETE)\b/i.test(text) && /\bintegration/.test(headOf(text))) writesOutside.push(headOf(text));
        return dbA.query(text, values);
      },
      transaction: (fn) =>
        dbA.transaction((tx) => {
          const sent: string[] = [];
          transactions.push(sent);
          return fn({ query: (text, values) => (sent.push(headOf(text)), tx.query(text, values)) });
        }),
    };
    const a = await quietly(() => createServer(appOf(), { ...runtimeOf(poolOn(database), { migrations: 'verify' }), db: watchedA }));
    const b = await quietly(() => createServer(appOf(), runtimeOf(poolOn(database), { migrations: 'verify' })));
    const reader = poolOn(database, 2);
    const held = async (id: string): Promise<{ title: unknown; status: unknown; keyHash: unknown; actions: string[] }> => {
      const row = (await reader.query('SELECT status, title, key_hash FROM integrations WHERE id = $1', [id])).rows[0];
      const actions = (await reader.query('SELECT action_id FROM integration_actions WHERE integration_id = $1 ORDER BY 1', [id])).rows.map((line) => String(line['action_id']));
      return { title: row?.['title'], status: row?.['status'], keyHash: row?.['key_hash'], actions };
    };
    const register = async (server: Server, id: string, version: string): Promise<{ status: number; key: unknown }> => {
      const response = await server.request('/operator/integrations', { method: 'POST', headers: OPERATOR, body: JSON.stringify({ id, url: bundleUrl(id, version) }) });
      const body: unknown = await response.json().catch(() => ({}));
      return { status: response.status, key: body !== null && typeof body === 'object' && 'key' in body ? body.key : undefined };
    };
    const hashOf = (key: unknown): string => createHash('sha256').update(String(key)).digest('hex');

    // ── a registration is one transaction ──
    transactions.length = 0;
    writesOutside.length = 0;
    const registered = await quietly(() => register(a, 'belts', 'one'));
    const afterFirst = await held('belts');
    check(
      'a registration lands the row, its actions and the hash of its key',
      registered.status === 200 && typeof registered.key === 'string' && afterFirst.title === 'one' && afterFirst.actions.length === 2 && afterFirst.keyHash === hashOf(registered.key),
      `answered ${registered.status}; the row is "${String(afterFirst.title)}" with ${afterFirst.actions.length} actions`,
    );
    const written = transactions.flat().filter((head) => /^(INSERT|UPDATE|DELETE)/i.test(head));
    check(
      '…in one transaction, on one connection, and writes no row of the registry outside it',
      transactions.length === 1 && written.some((head) => /integrations\b/.test(head)) && written.some((head) => /integration_actions/.test(head)) && writesOutside.length === 0,
      `${transactions.length} transaction(s): ${transactions.map((sent) => `[${sent.join(' | ')}]`).join(' ')}; written outside one: ${writesOutside.length}`,
    );

    // ── defect 22: two first registrations of one integration at once ──
    const count = { dead: 0, twoAnswered: 0, noneAnswered: 0, notBoth200: 0 };
    await quietly(async () => {
      for (let round = 0; round < REGISTRY_ROUNDS; round += 1) {
        const id = `fresh-${round}`;
        const answers = await Promise.all([register(a, id, 'one'), register(b, id, 'two')]);
        const keys = answers.map((answer) => answer.key).filter((key) => typeof key === 'string');
        if (answers.some((answer) => answer.status !== 200)) count.notBoth200 += 1;
        if (keys.length === 2) count.twoAnswered += 1;
        if (keys.length === 0) count.noneAnswered += 1;
        const stored = (await held(id)).keyHash;
        count.dead += keys.filter((key) => hashOf(key) !== stored).length;
      }
    });
    check(
      `two first registrations of one integration at once, by two processes, ${REGISTRY_ROUNDS} rounds: one key is answered, and it is the key the row holds`,
      count.dead === 0 && count.twoAnswered === 0 && count.noneAnswered === 0 && count.notBoth200 === 0,
      `keys answered that the row does not hold: ${count.dead}; rounds in which both were answered a key: ${count.twoAnswered}; in which neither was: ${count.noneAnswered}; in which a registration was not answered 200: ${count.notBoth200}`,
    );

    // ── an approval by one process is served by the other ──
    const approved = await quietly(() => a.request('/operator/integrations/belts/approve', { method: 'POST', headers: OPERATOR }));
    const served = (server: Server): string => Object.keys(server.actions()).join(', ');
    check('an approval is answered 200, and the process that took it serves the actions', approved.status === 200 && served(a) === 'ext.desk.belts.a1, ext.desk.belts.a2', `${approved.status}; it serves ${served(a) || 'nothing'}`);
    const followed = await quietly(() => until(() => served(b) === 'ext.desk.belts.a1, ext.desk.belts.a2', 5_000));
    check('the other process serves them too, within its poll', followed, `it serves ${served(b) || 'nothing'}`);

    a.close();
    b.close();
  } finally {
    service.close();
  }
};

// ── the run ──────────────────────────────────────────────────

const started = Date.now();
let threw: unknown;
try {
  const version = String((await admin.query('SELECT version() AS version')).rows[0]?.['version']).split(',')[0];
  console.log(`[check:postgres] ${version}, at ${new URL(url).host}`);
  await tideStore();
  await generationPointer();
  await registry();
} catch (error) {
  Object.assign(console, originals);
  threw = error;
} finally {
  for (const pool of pools) await pool.end().catch(() => undefined);
  for (const name of databases) await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`).catch(() => undefined);
  await admin.end().catch(() => undefined);
}
if (threw !== undefined) {
  console.log(`[fail] the check could not be run to its end: ${threw instanceof Error ? (threw.stack ?? threw.message) : String(threw)}`);
  process.exit(1);
}
const failed = results.filter((passed) => !passed).length;
console.log(failed === 0 ? `[check:postgres] ${results.length} checks passed in ${Math.round((Date.now() - started) / 100) / 10} s` : `[check:postgres] ${failed} of ${results.length} checks FAILED`);
process.exit(failed === 0 ? 0 : 1);
