import { prepare, planMigrations, refuseProblems, type LedgerRow, type Plan, type PreparedMigration, type PreparedSequence } from '../plan';
import type { Sequence } from '../schema';
import type { UpgradeResult, Upgrader } from '../documents';
import { StrataError } from '../errors';

// ═══════════════════════════════════════════════════════════════
// @niscorp/strata/postgres — the ledger, and the one path DDL takes.
//
// A run is ONE TRANSACTION under an advisory lock: take the lock, make sure the
// ledger exists, read it, plan against it, apply every pending step and record
// each migration as it lands. Anything throws, nothing happened — Postgres DDL
// is transactional, so a half-migrated database is not a state this can leave.
// Two processes booting at once serialize on the lock; the second finds the
// work done.
//
// The ledger's own table is the only statement strata runs outside a ledger —
// the base case, the way every migration system has one.
// ═══════════════════════════════════════════════════════════════

// The pool shape nisc passes everywhere (vex's PgPool, a PGlite shim, a `pg`
// pool wrapped to check a client out per transaction). Structural — strata
// depends on no driver.
//
// `query` and `transaction` are called ON the object that has them, never
// taken off it first. A driver's own object (a PGlite, a `pg` client handed
// through as the transaction) has them as methods that reach for `this`; taken
// off, they fail inside the driver on a property nobody here has heard of.
export type StrataQuery = (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
export type StrataPool = {
  query: StrataQuery;
  transaction?: <T>(fn: (tx: { query: StrataQuery }) => Promise<T>) => Promise<T>;
};

export type LedgerOptions = {
  // Default `strata_ledger`, in the connection's current schema — beside the
  // app's own tables.
  table?: string;
  schema?: string;
};

// What a host asks of a run before it may land: called inside the run's
// transaction, after the last pending step — when nothing was pending too.
// Every sentence it returns refuses the run (DOES_NOT_FIT) — and since
// nothing has been committed, nothing happened. strata does not know what is
// being asked; the host does.
export type MigrateGuard = (tx: { query: StrataQuery }) => Promise<readonly string[]>;

export type MigrateOptions = LedgerOptions & {
  // `apply` (default): run what is pending. `verify`: refuse if anything is —
  // a production boot that expects a deploy step to have migrated already.
  mode?: 'apply' | 'verify';
  guard?: MigrateGuard;
  // The whole run, guard included, then rolled back: the report says what
  // WOULD be applied. It takes the locks a real run takes, for as long.
  dryRun?: boolean;
};

export type MigrateReport = {
  // What this run applied, in order.
  applied: readonly PreparedMigration[];
  // The plan it acted on (per-sequence positions before the run).
  plan: Plan;
};

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const quote = (name: string, label: string): string => {
  if (!IDENT.test(name)) throw new StrataError('INVALID_SEQUENCE', `The ledger ${label} "${name}" is not a plain identifier.`);
  return `"${name}"`;
};

const ledgerNameOf = (options: LedgerOptions): { qualified: string; schema: string | undefined } => {
  const table = quote(options.table ?? 'strata_ledger', 'table');
  const schema = options.schema === undefined ? undefined : quote(options.schema, 'schema');
  return { qualified: schema === undefined ? table : `${schema}.${table}`, schema };
};

export const ledgerDdl = (options: LedgerOptions = {}): string => {
  const { qualified } = ledgerNameOf(options);
  return `CREATE TABLE IF NOT EXISTS ${qualified} (
  sequence    text NOT NULL,
  n           integer NOT NULL,
  description text NOT NULL,
  checksum    text NOT NULL,
  applied_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sequence, n)
)`;
};

const text = (value: unknown): string => (value instanceof Date ? value.toISOString() : String(value));

const readRows = async (on: { query: StrataQuery }, qualified: string): Promise<LedgerRow[]> => {
  const { rows } = await on.query(`SELECT sequence, n, checksum, description, applied_at FROM ${qualified} ORDER BY sequence, n`);
  return rows.map((row) => ({
    sequence: text(row['sequence']),
    n: Number(row['n']),
    checksum: text(row['checksum']),
    description: text(row['description']),
    appliedAt: text(row['applied_at']),
  }));
};

// The ledger as it stands — read-only, no lock, no table created. A database
// that has never been migrated has an empty ledger.
export const readLedger = async (pool: StrataPool, options: LedgerOptions = {}): Promise<LedgerRow[]> => {
  const { qualified } = ledgerNameOf(options);
  const { rows } = await pool.query('SELECT to_regclass($1) IS NOT NULL AS present', [qualified]);
  if (rows[0]?.['present'] !== true) return [];
  return readRows(pool, qualified);
};

// What `migrate` would do, without doing it — for a boot report, a CI check, a
// page that shows the ledger.
export const status = async (pool: StrataPool, sequences: readonly Sequence[], options: LedgerOptions = {}): Promise<Plan> =>
  planMigrations(await prepare(sequences), await readLedger(pool, options));

const refuseGrammars = (prepared: readonly PreparedSequence[]): void => {
  const grammars = prepared.filter((s) => s.grammar);
  if (grammars.length > 0) {
    throw new StrataError(
      'WRONG_OWNER',
      'These sequences own documents, not tables: a document carries its own stamp and is upgraded where it is read (`createUpgrader`, `upgradeStore`) — never recorded in a database\'s ledger.',
      grammars.map((s) => s.id),
    );
  }
};

export const migrate = async (pool: StrataPool, sequences: readonly Sequence[], options: MigrateOptions = {}): Promise<MigrateReport> => {
  const prepared = await prepare(sequences);
  refuseGrammars(prepared);
  if (pool.transaction === undefined) {
    throw new StrataError(
      'NO_TRANSACTION',
      'This pool cannot run a transaction, and a migration run must land whole or not at all. ' +
        'Pass a pool with `transaction` (vex\'s PGlite pool has one; wrap a `pg` Pool so it checks a client out per transaction).',
    );
  }
  const { qualified, schema } = ledgerNameOf(options);
  // A dry run leaves by throwing: that is what rolls a transaction back in
  // every pool there is. This is the throw, told apart by being this object.
  const dryRunEnd = new Error('strata: dry run');
  let dryRunReport: MigrateReport | undefined;

  const run = pool.transaction(async (tx) => {
    // The lock first: two processes creating the ledger at once would race in
    // the catalog before either reached a row.
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`strata:${qualified}`]);
    if (schema !== undefined) await tx.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
    await tx.query(ledgerDdl(options));

    const plan = planMigrations(prepared, await readRows(tx, qualified));
    refuseProblems(plan);
    if (options.mode === 'verify' && plan.pending.length > 0) {
      throw new StrataError(
        'PENDING',
        `${plan.pending.length} migration${plan.pending.length === 1 ? ' is' : 's are'} not applied, and this boot only verifies. Run the migrations first.`,
        plan.pending.map((m) => `${m.ref}  ${m.description}`),
      );
    }

    const applied: PreparedMigration[] = [];
    for (const migration of plan.pending) {
      for (const [index, step] of migration.steps.entries()) {
        // Only table sequences reach the ledger (refuseGrammars above).
        if (step.kind !== 'sql') continue;
        try {
          await tx.query(step.sql);
        } catch (cause) {
          throw new StrataError(
            'STEP_FAILED',
            `${migration.ref} ("${migration.description}") failed at step ${index + 1} of ${migration.steps.length}. Nothing from this run was applied.`,
            [cause instanceof Error ? cause.message : String(cause), step.sql.length > 300 ? `${step.sql.slice(0, 300)}…` : step.sql],
            { cause },
          );
        }
      }
      await tx.query(`INSERT INTO ${qualified} (sequence, n, description, checksum) VALUES ($1, $2, $3, $4)`, [
        migration.sequence,
        migration.n,
        migration.description,
        migration.checksum,
      ]);
      applied.push(migration);
    }

    const reasons = options.guard === undefined ? [] : await options.guard(tx);
    if (reasons.length > 0) {
      throw new StrataError('DOES_NOT_FIT', 'What this run leaves does not fit what has to run on it. Nothing from this run was applied.', reasons);
    }
    if (options.dryRun === true) {
      dryRunReport = { applied, plan };
      throw dryRunEnd;
    }
    return { applied, plan };
  });

  return run.catch((error: unknown) => {
    if (error === dryRunEnd && dryRunReport !== undefined) return dryRunReport;
    throw error;
  });
};

// ═══════════════════════════════════════════════════════════════
// Stores — tables whose rows hold documents.
//
// A store names where the documents live: the table, the jsonb column holding
// each document, the jsonb column holding its stamp, the kind every document
// in it is, and the key that identifies a row. The table itself (and its stamp
// column) is its owner's, created by the owner's TABLE sequence; strata only
// reads and rewrites rows.
//
// `upgradeStore` brings every row that is behind up to the code, in one
// transaction, and writes each back with a current stamp. A row written by
// newer code refuses the whole run (TOO_NEW) — the same answer the ledger
// gives, one row at a time. Read paths that cannot wait for a boot upgrade the
// row they read with the same upgrader; this is the pass that makes that rare.
// ═══════════════════════════════════════════════════════════════

export type DocumentStore = {
  table: string;
  schema?: string;
  // The jsonb column holding the document.
  column: string;
  // The jsonb column holding the document's stamp (`{}` means "before stamps").
  stamp: string;
  // Every document in this store is of this kind, e.g. "nisc.nova/action".
  kind: string;
  // The columns that identify a row.
  key: readonly string[];
};

export type StoreReport = {
  // Rows read, and rows that were behind and rewritten.
  total: number;
  upgraded: number;
  // Per migration ref, how many rows it rewrote.
  applied: Readonly<Record<string, number>>;
};

export const upgradeStore = async (pool: StrataPool, store: DocumentStore, upgrader: Upgrader): Promise<StoreReport> => {
  if (pool.transaction === undefined) {
    throw new StrataError('NO_TRANSACTION', 'Rewriting a store must land whole or not at all; this pool cannot run a transaction.');
  }
  const table = store.schema === undefined ? quote(store.table, 'table') : `${quote(store.schema, 'schema')}.${quote(store.table, 'table')}`;
  const column = quote(store.column, 'column');
  const stamp = quote(store.stamp, 'column');
  const keys = store.key.map((k) => quote(k, 'column'));
  if (keys.length === 0) throw new StrataError('INVALID_SEQUENCE', `The store ${store.table} names no key columns.`);

  return pool.transaction(async (tx) => {
    const { rows } = await tx.query(`SELECT ${[...keys, column, stamp].join(', ')} FROM ${table} FOR UPDATE`);
    const applied: Record<string, number> = {};
    let upgraded = 0;
    for (const row of rows) {
      const given = row[store.stamp];
      const rowStamp = typeof given === 'object' && given !== null && !Array.isArray(given) ? Object.fromEntries(Object.entries(given).map(([k, v]) => [k, Number(v)])) : {};
      const where = store.key.map((k) => `${k}=${JSON.stringify(row[k])}`).join(', ');
      let result: UpgradeResult;
      try {
        if (!upgrader.behind(rowStamp)) continue;
        result = upgrader.upgrade(row[store.column], { kind: store.kind, stamp: rowStamp });
      } catch (cause) {
        if (cause instanceof StrataError) {
          throw new StrataError(cause.code, `${store.table} (${where}): ${cause.message.split('\n')[0] ?? ''}`, cause.details, { cause });
        }
        throw cause;
      }
      await tx.query(
        `UPDATE ${table} SET ${column} = $1::jsonb, ${stamp} = $2::jsonb WHERE ${keys.map((k, i) => `${k} = $${i + 3}`).join(' AND ')}`,
        [JSON.stringify(result.document), JSON.stringify(result.stamp), ...store.key.map((k) => row[k])],
      );
      upgraded += 1;
      for (const ref of result.applied) applied[ref] = (applied[ref] ?? 0) + 1;
    }
    return { total: rows.length, upgraded, applied };
  });
};
