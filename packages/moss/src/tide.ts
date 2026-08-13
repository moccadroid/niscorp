import { PRIMARY_KEY, UNIQUE_BY } from '@niscorp/tide';
import type { ClaimSpec, Comparison, Mutation, Order, QuerySpec, RemoveSpec, TableName, Tide, TideStore, TideTables, Where } from '@niscorp/tide';
import type { PgPool, WriteEvent } from '@niscorp/vex';

// ═══════════════════════════════════════════════════════════════
// TIDE, MADE DURABLE — and it lives HERE, not in tide.
//
// Tide has no dependencies and that is deliberate: it must not be
// able to import a host. Storage was the one seam moss did not
// fill, so a tide under moss kept its ledger in memory and lost a
// half-finished run to every deploy.
//
// The engine's own writes go through the POOL, not through vex's
// mutation pipeline, and the reason is worth stating because the
// opposite looks tidier. A vex mutation is an AUTHORED, scope-
// compiled statement replayed on behalf of a principal — the right
// shape for an application write, and the wrong shape for an
// engine claiming its own task: there is no principal, no tenant
// to scope to, and no user input to police. Routing bookkeeping
// through a policy compiler would add a scope rule that permits
// everything, which is a way of saying the rule is not doing
// anything.
//
// The LEDGER READS are the other half and they DO go through vex —
// in the app, as ordinary entries over these tables, scoped on
// `as`. That is why a run carries the identity it ran under.
// ═══════════════════════════════════════════════════════════════

// One table per guarantee. `tide_run` and `tide_work` are the two that grow
// with events; `tide_fact` is the intake, swept on its own horizon; and
// `tide_reflex_state` holds one row per reflex, forever.
//
// The CHECK constraints are not decoration. The last hand-written store read
// state back through a blind cast, so a run whose state was `'sttled'` was
// constructible — and its work was never claimed and it hung there.
export const TIDE_TABLES = ['tide_fact', 'tide_run', 'tide_work', 'tide_reflex_state'] as const;

export const TIDE_DDL = `
CREATE TABLE IF NOT EXISTS tide_fact (
  id           text PRIMARY KEY,
  kind         text NOT NULL CHECK (kind IN ('write','signal','manual','run')),
  entity       text,
  op           text CHECK (op IN ('insert','update','delete')),
  row          jsonb,
  name         text,
  payload      jsonb,
  reflex       text,
  run_id       text,
  occurrence   text,
  stats        jsonb,
  target       text,
  by           text,
  at           bigint NOT NULL,
  not_before   bigint,
  dedupe_key   text,
  cause        text,
  depth        integer NOT NULL DEFAULT 0,
  delivered_at bigint,
  parked       text,
  released     boolean,
  -- WHOSE FACT THIS IS. The identity of the reflex that minted it, absent on
  -- anything the host ingested. The matcher refuses to hand a fact minted
  -- under one identity to a reflex running under another, which is the only
  -- thing standing between a carried row and somebody else's effect — tide is
  -- the one place a row travels without being read, so no scope policy is
  -- consulted on the way.
  as_who       text
);

-- A PARTIAL index, because a fact with no dedupeKey is not claiming to be
-- unique: it is a distinct occurrence of something, not a repeat of it.
-- entity is in the key: without it, two producers over different tables
-- that agreed on a key value silently ate each other's rows.
CREATE UNIQUE INDEX IF NOT EXISTS tide_fact_dedupe
  ON tide_fact (kind, coalesce(entity,''), coalesce(name,''), dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- The matcher's query, every advance.
CREATE INDEX IF NOT EXISTS tide_fact_due
  ON tide_fact (at) WHERE delivered_at IS NULL AND parked IS NULL;
CREATE INDEX IF NOT EXISTS tide_fact_swept ON tide_fact (delivered_at);

CREATE TABLE IF NOT EXISTS tide_run (
  id         text PRIMARY KEY,
  reflex_id  text NOT NULL,
  version    text NOT NULL,
  as_who     text,
  cause      text NOT NULL,
  occurrence text,
  fact_ids   jsonb,
  state      text NOT NULL CHECK (state IN ('pending','fanned','settled','skipped')),
  depth      integer NOT NULL DEFAULT 0,
  selected   integer,
  total      integer NOT NULL DEFAULT 0,
  done       integer NOT NULL DEFAULT 0,
  failed     integer NOT NULL DEFAULT 0,
  due_at     bigint NOT NULL,
  created_at bigint NOT NULL,
  settled_at bigint,
  drained    boolean,
  note       text,
  -- THE IDEMPOTENCY. One constraint, every trigger kind: an occurrence
  -- cannot open twice, a replayed fact cannot open twice, and two instances
  -- ticking at the same moment contend instead of duplicating.
  UNIQUE (reflex_id, cause)
);

CREATE INDEX IF NOT EXISTS tide_run_pending ON tide_run (state, due_at);
CREATE INDEX IF NOT EXISTS tide_run_ledger ON tide_run (reflex_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tide_run_swept ON tide_run (settled_at);

CREATE TABLE IF NOT EXISTS tide_work (
  id            text PRIMARY KEY,
  -- ON DELETE CASCADE, because a run and its work are one fact about the
  -- world. Sweeping runs and leaving work destroys the UNIQUE(run_id, unit)
  -- row that IS the "this unit already ran" record — and a restore then
  -- re-charges the invoice.
  run_id        text NOT NULL REFERENCES tide_run(id) ON DELETE CASCADE,
  reflex_id     text NOT NULL,
  unit          text NOT NULL,
  cause         text NOT NULL,
  env           jsonb NOT NULL,
  depth         integer NOT NULL DEFAULT 0,
  state         text NOT NULL CHECK (state IN ('pending','claimed','retrying','done','failed')),
  attempt       integer NOT NULL DEFAULT 0,
  token         text,
  -- Zero, never null, when unclaimed: "never claimed or lapsed" is then one
  -- comparison rather than a disjunction.
  claimed_until bigint NOT NULL DEFAULT 0,
  not_before    bigint NOT NULL,
  input         jsonb,
  output        jsonb,
  error         text,
  created_at    bigint NOT NULL,
  settled_at    bigint,
  UNIQUE (run_id, unit)
);

CREATE INDEX IF NOT EXISTS tide_work_claimable ON tide_work (state, not_before, claimed_until);
CREATE INDEX IF NOT EXISTS tide_work_run ON tide_work (run_id);
CREATE INDEX IF NOT EXISTS tide_work_swept ON tide_work (settled_at);

CREATE TABLE IF NOT EXISTS tide_reflex_state (
  reflex_id             text PRIMARY KEY,
  armed_at              bigint NOT NULL DEFAULT 0,
  materialized_through  bigint
);

-- Polls are gone (the vex bridge pushes writes — a poll could only
-- re-discover them late), and their cursor state goes with them. IF EXISTS,
-- so a store created after the removal is not asked to drop what it never had.
ALTER TABLE tide_reflex_state DROP COLUMN IF EXISTS poll_cursor;
ALTER TABLE tide_reflex_state DROP COLUMN IF EXISTS poll_seen;
ALTER TABLE tide_reflex_state DROP COLUMN IF EXISTS polled_at;
`;

// ── the mapping ─────────────────────────────────────────────────
//
// One place, both directions. Hand-written per-table row builders are how
// the last store ended up reading `started_at` off the wrong column in one
// direction and not at all in the other.

const SQL_TABLE: Record<TableName, string> = {
  fact: 'tide_fact',
  run: 'tide_run',
  task: 'tide_work',
  state: 'tide_reflex_state',
};

// `as` and `row` are SQL keywords; everything else is the ordinary
// camel → snake rule.
const COLUMN_OVERRIDES: Record<string, string> = { as: 'as_who' };

const snake = (field: string): string => COLUMN_OVERRIDES[field] ?? field.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

const camel = (column: string): string => {
  for (const [field, mapped] of Object.entries(COLUMN_OVERRIDES)) if (mapped === column) return field;
  return column.replace(/_([a-z])/g, (_all, c: string) => c.toUpperCase());
};

// Which columns hold JSON. Anything else round-trips as a scalar.
const JSON_COLUMNS = new Set(['row', 'payload', 'stats', 'fact_ids', 'env', 'input', 'output']);
const BIGINT_COLUMNS = new Set([
  'at',
  'not_before',
  'delivered_at',
  'depth',
  'due_at',
  'created_at',
  'settled_at',
  'claimed_until',
  'armed_at',
  'materialized_through',
  'attempt',
  'selected',
  'total',
  'done',
  'failed',
]);

const toColumn = (column: string, value: unknown): unknown => {
  if (value === undefined) return null;
  if (JSON_COLUMNS.has(column)) return JSON.stringify(value);
  return value;
};

const fromColumn = (column: string, value: unknown): unknown => {
  if (value === null) return undefined;
  if (JSON_COLUMNS.has(column)) return typeof value === 'string' ? JSON.parse(value) : value;
  // `bigint` comes back as a string on some drivers and a number on others.
  // Tide compares these with `<`, so the difference is not cosmetic.
  if (BIGINT_COLUMNS.has(column)) return Number(value);
  return value;
};

const rowToEntity = <T extends TableName>(table: T, row: Record<string, unknown>): TideTables[T] => {
  const entity: Record<string, unknown> = {};
  for (const [column, value] of Object.entries(row)) {
    const mapped = fromColumn(column, value);
    if (mapped !== undefined) entity[camel(column)] = mapped;
  }
  return entity as TideTables[T];
};

// ── the WHERE compiler ──────────────────────────────────────────

const COMPARATORS: Record<string, string> = { eq: '=', ne: '<>', lt: '<', lte: '<=', gt: '>', gte: '>=' };

type Bind = { sql: string; params: unknown[] };

const compileWhere = (where: Where<Record<string, unknown>> | undefined, start: number, alias = ''): Bind => {
  const clauses: string[] = [];
  const params: unknown[] = [];
  const prefix = alias === '' ? '' : `${alias}.`;
  const slot = (value: unknown): string => {
    params.push(value);
    return `$${start + params.length - 1}`;
  };

  for (const [field, test] of Object.entries(where ?? {})) {
    const column = `${prefix}${snake(field)}`;
    const bare = snake(field);
    if (test === null || typeof test !== 'object' || Array.isArray(test)) {
      // An equality on `undefined` means IS NULL, which is what the engine
      // means when it filters on a column it just cleared.
      clauses.push(test === undefined ? `${column} IS NULL` : `${column} = ${slot(toColumn(bare, test))}`);
      continue;
    }

    const comparison = test as Comparison<unknown>;
    for (const [op, symbol] of Object.entries(COMPARATORS)) {
      const operand = comparison[op as keyof Comparison<unknown>];
      if (operand === undefined) continue;
      // `ne` must be true for a NULL column: a run that has never been
      // drained is not drained, and plain SQL `<>` answers NULL there.
      clauses.push(op === 'ne' ? `(${column} IS NULL OR ${column} <> ${slot(toColumn(bare, operand))})` : `${column} ${symbol} ${slot(toColumn(bare, operand))}`);
    }
    if (comparison.in !== undefined) clauses.push(`${column} = ANY(${slot(comparison.in.map((value) => toColumn(bare, value)))})`);
    if (comparison.notIn !== undefined) clauses.push(`NOT (${column} = ANY(${slot(comparison.notIn.map((value) => toColumn(bare, value)))}))`);
    if (comparison.isNull !== undefined) clauses.push(comparison.isNull ? `${column} IS NULL` : `${column} IS NOT NULL`);
  }

  return { sql: clauses.length === 0 ? 'TRUE' : clauses.join(' AND '), params };
};

const compileOrder = (order: Order<Record<string, unknown>> | undefined, alias = ''): string => {
  if (order === undefined || order.length === 0) return '';
  const prefix = alias === '' ? '' : `${alias}.`;
  return ` ORDER BY ${order.map((key) => `${prefix}${snake(String(key.by))} ${key.dir === 'desc' ? 'DESC' : 'ASC'}`).join(', ')}`;
};

// The same comparison SQL made, applied to what came back. Kept beside the
// compiler so the two cannot drift.
const sortRows = <R>(rows: readonly R[], order: Order<Record<string, unknown>> | undefined): R[] => {
  if (order === undefined || order.length === 0) return [...rows];
  return [...rows].sort((left, right) => {
    for (const key of order) {
      const a = (left as Record<string, unknown>)[String(key.by)];
      const b = (right as Record<string, unknown>)[String(key.by)];
      const compared = typeof a === 'number' && typeof b === 'number' ? a - b : String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
      if (compared !== 0) return compared * (key.dir === 'desc' ? -1 : 1);
    }
    return 0;
  });
};

const compileSet = (set: Mutation<Record<string, unknown>>, start: number): Bind => {
  const assignments: string[] = [];
  const params: unknown[] = [];
  for (const [field, value] of Object.entries(set)) {
    const column = snake(field);
    if (value !== null && typeof value === 'object' && 'inc' in value) {
      // Column arithmetic, so two settling tasks cannot lose an increment
      // between a read and a write.
      assignments.push(`${column} = coalesce(${column}, 0) + ${Number((value as { inc: number }).inc)}`);
      continue;
    }
    params.push(toColumn(column, value));
    assignments.push(`${column} = $${start + params.length - 1}`);
  }
  return { sql: assignments.join(', '), params };
};

// ── the store ───────────────────────────────────────────────────

// A counter, in the closure that owns it rather than at module scope. Same
// value, same monotonicity; what changes is that it is no longer process-global
// state a second store would silently share.
const mintId = ((): ((table: TableName) => string) => {
  let sequence = 0;
  return (table) => {
    sequence += 1;
    return `${table}_${Date.now().toString(36)}_${sequence.toString(36)}`;
  };
})();

export type TideStoreOptions = {
  // Run the DDL on construction. On by default because a store that cannot
  // create its own tables makes the host responsible for a schema it does
  // not author.
  migrate?: boolean;
};

export const createTideStore = (pool: PgPool, options: TideStoreOptions = {}): TideStore & { ready: Promise<void> } => {
  // EVERY method awaits this. The last store had three transactional methods
  // that did not, so on a real pool they raced the DDL and threw
  // `42P01 undefined_table` INSIDE a transaction — which the fan-out then
  // turned into a permanently skipped run.
  // ONE STATEMENT AT A TIME. A prepared statement carries exactly one
  // command — PGlite says so outright, and a `pg` pool disallows it under
  // parameters too — so the DDL is split rather than handed over whole.
  // Every statement is `IF NOT EXISTS`, so a boot that has already run is a
  // boot that does nothing rather than one that fails.
  const migrate = async (): Promise<void> => {
    for (const statement of TIDE_DDL.split(';')) {
      const trimmed = statement.trim();
      if (trimmed !== '') await pool.query(trimmed);
    }
  };

  const ready: Promise<void> = options.migrate === false ? Promise.resolve() : migrate();
  // An unhandled rejection here is process-fatal on Node ≥ 15, and the
  // failure it reports would be a database that is not up yet.
  ready.catch(() => undefined);

  const build = (client: PgPool): TideStore => {
    const store: TideStore = {
      query: async <T extends TableName>(spec: QuerySpec<T>) => {
        await ready;
        const where = compileWhere(spec.where as Where<Record<string, unknown>>, 1);
        const limit = spec.limit === undefined ? '' : ` LIMIT ${Math.max(0, Math.floor(spec.limit))}`;
        const result = await client.query(
          `SELECT * FROM ${SQL_TABLE[spec.table]} WHERE ${where.sql}${compileOrder(spec.order as Order<Record<string, unknown>>)}${limit}`,
          where.params,
        );
        return result.rows.map((row) => rowToEntity(spec.table, row));
      },

      // ON CONFLICT DO NOTHING, which is the whole point: the refusal is the
      // DATABASE's, decided under the constraint, not a read the caller races.
      appendIfAbsent: async <T extends TableName>(table: T, input: Omit<TideTables[T], 'id'> & { id?: string }) => {
        await ready;
        const withId = PRIMARY_KEY[table] === 'id' ? { ...(input as Record<string, unknown>), id: input.id ?? mintId(table) } : { ...(input as Record<string, unknown>) };
        const entries = Object.entries(withId).filter(([, value]) => value !== undefined);
        const columns = entries.map(([field]) => snake(field));
        const params = entries.map(([field, value]) => toColumn(snake(field), value));

        // The conflict target is the table's declared unique key — the same
        // constant the memory store reads, so the two cannot drift.
        const unique = UNIQUE_BY[table];
        const target =
          unique.when === undefined
            ? `(${unique.by.map((column) => snake(String(column))).join(', ')})`
            : `(${unique.by.map((column) => (column === 'entity' || column === 'name' ? `coalesce(${snake(String(column))},'')` : snake(String(column)))).join(', ')}) WHERE ${snake(String(unique.when))} IS NOT NULL`;

        const result = await client.query(
          `INSERT INTO ${SQL_TABLE[table]} (${columns.join(', ')}) VALUES (${params.map((_value, index) => `$${index + 1}`).join(', ')})
           ON CONFLICT ${target} DO NOTHING RETURNING *`,
          params,
        );
        const row = result.rows[0];
        return row === undefined ? undefined : rowToEntity(table, row);
      },

      // Selection and mutation in ONE statement. `FOR UPDATE SKIP LOCKED`
      // makes N instances ticking at once ordinary contention rather than a
      // lock service — it is a throughput choice; the exactly-once promise is
      // the single statement.
      claim: async <T extends TableName>(spec: ClaimSpec<T>) => {
        await ready;
        const table = SQL_TABLE[spec.table];
        const order = compileOrder(spec.order as Order<Record<string, unknown>>, 'c');

        // Selection and mutation in ONE statement, which is the promise.
        // `FOR UPDATE SKIP LOCKED` makes N instances ticking at once ordinary
        // contention rather than a lock service — a throughput choice; the
        // exactly-once part is that it is one statement.
        const take = async (extra: Where<Record<string, unknown>>, limit: number) => {
          if (limit <= 0) return [];
          const where = compileWhere({ ...(spec.where as Where<Record<string, unknown>>), ...extra }, 1, 'c');
          const set = compileSet(spec.set as Mutation<Record<string, unknown>>, where.params.length + 1);
          const result = await client.query(
            `UPDATE ${table} SET ${set.sql}
             WHERE ctid IN (
               SELECT c.ctid FROM ${table} c WHERE ${where.sql}${order}
               LIMIT ${Math.floor(limit)} FOR UPDATE SKIP LOCKED
             )
             RETURNING *`,
            [...where.params, ...set.params],
          );
          // RE-SORTED, and this is not belt-and-braces. `ORDER BY` inside the
          // subquery decides WHICH rows are taken; it says nothing about the
          // order `RETURNING` hands them back, which is the order the UPDATE
          // happened to scan in. The engine executes tasks in the order a claim
          // returns them, so without this a fan-out ran in heap order here and
          // insertion order in memory — two stores, two answers, and a headless
          // check that cannot assert on either.
          return sortRows(result.rows.map((row) => rowToEntity(spec.table, row)), spec.order as Order<Record<string, unknown>> | undefined);
        };

        if (spec.onePer === undefined) return take({}, spec.limit);

        // `order: 'serial'` — at most one held row per group, counting what
        // an earlier claim already holds.
        //
        // A window function would say this in one statement, and Postgres
        // refuses to combine one with `FOR UPDATE`. So the restricted groups
        // are claimed one at a time — there are as many of those as there are
        // serial reflexes, which is a handful — and everything else is taken
        // in the single bulk statement above.
        const { column, held, only } = spec.onePer;
        const restricted = [...only];
        // Room is RESERVED for the serial groups before the bulk claim runs.
        // Taking the full limit first and topping up afterwards is how a busy
        // parallel reflex starves every serial one — the mirror of the defect
        // where a serial reflex with five thousand due tasks starved
        // everybody else because LIMIT was applied before the serial filter.
        const claimed = await take({ [String(column)]: { notIn: restricted } }, spec.limit - restricted.length);

        for (const group of restricted) {
          if (claimed.length >= spec.limit) break;
          const busy = compileWhere({ ...(held as Where<Record<string, unknown>>), [String(column)]: group }, 1, 'c');
          const taken = await client.query(`SELECT c.id FROM ${table} c WHERE ${busy.sql} LIMIT 1`, busy.params);
          if (taken.rows.length > 0) continue;
          claimed.push(...(await take({ [String(column)]: group }, 1)));
        }

        return claimed;
      },

      cas: async <T extends TableName>(table: T, id: string, expect: Where<TideTables[T]>, set: Mutation<TideTables[T]>) => {
        await ready;
        const key = snake(String(PRIMARY_KEY[table]));
        const where = compileWhere(expect as Where<Record<string, unknown>>, 2);
        const patch = compileSet(set as Mutation<Record<string, unknown>>, where.params.length + 2);
        const result = await client.query(
          `UPDATE ${SQL_TABLE[table]} SET ${patch.sql} WHERE ${key} = $1 AND ${where.sql} RETURNING ${key}`,
          [id, ...where.params, ...patch.params],
        );
        return result.rows.length > 0;
      },

      remove: async <T extends TableName>(spec: RemoveSpec<T>) => {
        await ready;
        const where = compileWhere(spec.where as Where<Record<string, unknown>>, 1);
        // Work goes with its run through the foreign key, not through a
        // second statement somebody can forget.
        const result = await client.query(`DELETE FROM ${SQL_TABLE[spec.table]} WHERE ${where.sql} RETURNING ${snake(String(PRIMARY_KEY[spec.table]))}`, where.params);
        return result.rows.length;
      },

      transact: async <T>(fn: (tx: TideStore) => Promise<T>): Promise<T> => {
        await ready;
        if (client.transaction === undefined)
          throw new Error('tide store: this pool cannot transact — fan-out and attempt recording are transactions, not conventions');
        return client.transaction((tx) => fn(build({ ...client, query: tx.query })));
      },
    };
    return store;
  };

  return { ...build(pool), ready };
};

// ═══════════════════════════════════════════════════════════════
// The write-fact bridge — vex's write observer, minted into tide.
//
// One fact per (statement × returned row): a two-statement mutation
// is two stimuli, and an UPDATE the scope narrowed to nothing is
// none — zero rows mint zero facts, so "a write landed" is never
// said about a write that changed nothing.
//
// `as` is the fact's identity fence. Tide offers a fact only to
// reflexes running AS the same identity, and consults no scope
// policy on the way (the row travels unread) — so the stamp here,
// derived from the WRITE's own scope by the app's naming rule, is
// what keeps one tenant's row out of another tenant's automation.
// Stamping by anything else (a listener's interest, a default)
// would walk data across that fence.
// ═══════════════════════════════════════════════════════════════
// `chain` is the causality thread: when the write came from a tide effect
// (the handler forwarded its task and depth, the app's gate vouched for the
// caller), the minted facts carry `cause: task:<id>` and `depth + 1` — the
// same stamps an in-engine emit gets — so the chain ceiling holds across a
// trip through the database instead of resetting at every hop.
export const mintWrites = async (
  intake: Pick<Tide, 'ingest'>,
  event: WriteEvent,
  as: string,
  at: number,
  chain?: { cause: string; depth: number },
): Promise<void> => {
  for (const write of event.writes) {
    for (const row of write.rows) {
      await intake.ingest(
        { kind: 'write', entity: write.table, op: write.op, row, at },
        { as, ...(chain !== undefined ? { cause: chain.cause, depth: chain.depth + 1 } : {}) },
      );
    }
  }
};
