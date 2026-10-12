import { prepare, planMigrations, refuseProblems, type LedgerRow, type Plan, type PreparedMigration, type PreparedSequence } from '../plan';
import type { Sequence } from '../schema';
import type { UpgradeResult, Upgrader } from '../documents';
import { StrataError } from '../errors';

// `query` and `transaction` are called on the object that has them, never taken
// off it first: a driver's own object (a PGlite, a `pg` client) has them as
// methods that reach for `this`.
export type StrataQuery = (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
export type StrataPool = {
  query: StrataQuery;
  transaction?: <T>(fn: (tx: { query: StrataQuery }) => Promise<T>) => Promise<T>;
};

export type LedgerOptions = {
  table?: string;
  schema?: string;
};

export type MigrateGuard = (tx: { query: StrataQuery }) => Promise<readonly string[]>;

export type MigrateOptions = LedgerOptions & {
  mode?: 'apply' | 'verify';
  guard?: MigrateGuard;
  dryRun?: boolean;
};

export type MigrateReport = {
  applied: readonly PreparedMigration[];
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

export const readLedger = async (pool: StrataPool, options: LedgerOptions = {}): Promise<LedgerRow[]> => {
  const { qualified } = ledgerNameOf(options);
  const { rows } = await pool.query('SELECT to_regclass($1) IS NOT NULL AS present', [qualified]);
  if (rows[0]?.['present'] !== true) return [];
  return readRows(pool, qualified);
};

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
  // A dry run leaves by throwing, which is what rolls a transaction back in
  // every pool. This is the throw, told apart by being this object.
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

export type DocumentStore = {
  table: string;
  schema?: string;
  column: string;
  stamp: string;
  kind: string;
  key: readonly string[];
};

export type StoreReport = {
  total: number;
  upgraded: number;
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
