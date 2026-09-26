import { prepare, planMigrations, refuseProblems, type LedgerRow, type Plan, type PreparedMigration } from '../plan';
import type { Sequence } from '../schema';
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

export type MigrateOptions = LedgerOptions & {
  // `apply` (default): run what is pending. `verify`: refuse if anything is —
  // a production boot that expects a deploy step to have migrated already.
  mode?: 'apply' | 'verify';
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

const readRows = async (query: StrataQuery, qualified: string): Promise<LedgerRow[]> => {
  const { rows } = await query(`SELECT sequence, n, checksum, description, applied_at FROM ${qualified} ORDER BY sequence, n`);
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
  return readRows(pool.query, qualified);
};

// What `migrate` would do, without doing it — for a boot report, a CI check, a
// page that shows the ledger.
export const status = async (pool: StrataPool, sequences: readonly Sequence[], options: LedgerOptions = {}): Promise<Plan> =>
  planMigrations(await prepare(sequences), await readLedger(pool, options));

export const migrate = async (pool: StrataPool, sequences: readonly Sequence[], options: MigrateOptions = {}): Promise<MigrateReport> => {
  const prepared = await prepare(sequences);
  const { transaction } = pool;
  if (transaction === undefined) {
    throw new StrataError(
      'NO_TRANSACTION',
      'This pool cannot run a transaction, and a migration run must land whole or not at all. ' +
        'Pass a pool with `transaction` (vex\'s PGlite pool has one; wrap a `pg` Pool so it checks a client out per transaction).',
    );
  }
  const { qualified, schema } = ledgerNameOf(options);

  return transaction(async (tx) => {
    // The lock first: two processes creating the ledger at once would race in
    // the catalog before either reached a row.
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`strata:${qualified}`]);
    if (schema !== undefined) await tx.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
    await tx.query(ledgerDdl(options));

    const plan = planMigrations(prepared, await readRows(tx.query, qualified));
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
    return { applied, plan };
  });
};
