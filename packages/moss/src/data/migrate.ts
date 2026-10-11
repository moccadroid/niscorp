import { createPostgresAdapter, createPostgresCache, mutationMisfits, pruneOptional, resolve } from '@niscorp/vex';
import type { CacheBackend, DatabaseSchema, PgPool, SeedEntry, SeedMutation } from '@niscorp/vex';
import { migrate } from '@niscorp/strata/postgres';
import type { MigrateReport } from '@niscorp/strata/postgres';
import type { Sequence } from '@niscorp/strata';
import { entriesOf } from '../manifest';
import type { NiscApp } from '../manifest';
import type { NiscRuntime } from '../runtime';
import { SESSIONS_SEQUENCE } from '../identity';
import { MOSS_SEQUENCE } from './tables';

// ═══════════════════════════════════════════════════════════════
// THE STEP THAT CHANGES TABLES — one strata run over every owner's sequence,
// and a question asked of what it leaves before it may commit: does the code
// being deployed still fit?
//
// What an app reads and writes is data (its entries), and the schema is there
// to be read, so the question has an answer. A read is resolved against the
// schema as the transaction sees it; a write is put to the gate vex puts it
// to before it runs. An entry that does not fit refuses the run, and nothing
// was applied — so the migration is corrected where it is written, because
// it never ran.
//
// ONE EXCEPTION, or the check would hold a deploy hostage to an old bug: an
// entry that already did not fit BEFORE this run, and that the database
// already holds seeded exactly as it is now, is not this run's doing. It is
// said, not refused. A new or changed entry gets no such pass — "the code
// needs something no migration provides" is the mistake this exists to catch.
//
// What it cannot see: SQL written by hand, columns a scope rule stamps, what
// a value means. A run that passes says the entries fit, and nothing more.
// ═══════════════════════════════════════════════════════════════

type Entry = SeedEntry | SeedMutation;

// Whose tables a run covers, beside moss's own.
export type TableOwners = {
  pool: PgPool;
  // The cache the deployment chose. Absent: vex's Postgres cache on the pool.
  cache?: CacheBackend;
  // The deployment keeps moss's own credential (`session: 'sessions'`).
  storesSessions: boolean;
  // The tables the app's features keep (`featureTablesOf`).
  featureTables?: readonly Sequence[];
  // The app's own tables (`runtime.tables`).
  tables?: readonly Sequence[];
};

// The tables an app's features keep, in the order the app named the features.
// One function, for the server and for the step that migrates before it
// starts: the two must run the same sequences, or a boot that only verifies
// (`migrations: 'verify'`) finds one pending that the step never applied.
export const featureTablesOf = (app: Pick<NiscApp, 'features'>): readonly Sequence[] => (app.features ?? []).flatMap((feature) => feature.tables ?? []);

// Every table sequence a boot runs, in the order it runs them: moss's own, the
// sessions table when the deployment chose moss's credential, the vex cache's,
// the features' (a feature's table may point at one of moss's), then the
// app's own.
export const tableSequencesOf = (owners: TableOwners): readonly Sequence[] => {
  const cacheSequence = (owners.cache ?? createPostgresCache({ pool: owners.pool })).sequence;
  return [
    MOSS_SEQUENCE,
    ...(owners.storesSessions ? [SESSIONS_SEQUENCE] : []),
    ...(cacheSequence === undefined ? [] : [cacheSequence]),
    ...(owners.featureTables ?? []),
    ...(owners.tables ?? []),
  ];
};

// Why an entry does not fit a schema — undefined when it does.
const misfitOf = (entry: Entry, schema: DatabaseSchema): string | undefined => {
  if (!('mutation' in entry)) {
    try {
      // every optional condition kept, as the engine itself compiles an entry
      resolve(pruneOptional(entry.dsl, 'all'), schema);
      return undefined;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }
  // the gate every write goes through before it runs, asked without running
  return mutationMisfits(entry.mutation, schema)[0];
};

const misfitsOf = (entries: readonly Entry[], schema: DatabaseSchema): Map<string, string> => {
  const misfits = new Map<string, string>();
  for (const entry of entries) {
    const why = misfitOf(entry, schema);
    if (why !== undefined) misfits.set(entry.fingerprint, why);
  }
  return misfits;
};

// A stored definition has been through jsonb, which reorders keys: equality is
// by value, keys sorted.
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  const keys = Object.keys(value).filter((key) => Reflect.get(value, key) !== undefined).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(Reflect.get(value, key))}`).join(',')}}`;
};

// Does the database already hold this entry, seeded, exactly as the code has it?
const isSeededAs = async (cache: CacheBackend, entry: Entry): Promise<boolean> => {
  const held = await cache.get(entry.fingerprint);
  if (held === undefined || held.protected !== true) return false;
  if ('mutation' in entry) return held.kind === 'mutation' && canonical(held.mutation) === canonical(entry.mutation);
  return held.kind === 'ok' && canonical(held.dsl) === canonical(entry.dsl);
};

// What a run takes away: tables and columns that were there and are not, and
// columns whose type is no longer what it was.
const changesBetween = (before: DatabaseSchema, after: DatabaseSchema): { removed: string[]; retyped: string[] } => {
  const removed: string[] = [];
  const retyped: string[] = [];
  for (const was of before.entities) {
    const now = after.entities.find((entity) => entity.table === was.table);
    if (now === undefined) {
      removed.push(was.table);
      continue;
    }
    for (const field of was.fields) {
      const kept = now.fields.find((f) => f.name === field.name);
      if (kept === undefined) removed.push(`${was.table}.${field.name}`);
      else if (kept.type !== field.type) retyped.push(`${was.table}.${field.name} (${field.type} → ${kept.type})`);
    }
  }
  return { removed, retyped };
};

// vex's introspection sends its queries at once; a transaction is ONE
// connection, and a driver that is asked a second question while it is
// answering the first either queues it or refuses. So they go one at a time.
const oneAtATime = (query: PgPool['query']): PgPool['query'] => {
  let last: Promise<unknown> = Promise.resolve();
  return (text, values) => {
    const next = last.then(() => query(text, values));
    last = next.catch(() => undefined);
    return next;
  };
};

export type TablesReport = MigrateReport & {
  // Tables and columns the run removes.
  removed: readonly string[];
  // Columns whose type the run changes, as "table.column (was → now)".
  retyped: readonly string[];
  // Entries that did not fit before this run and still do not, already seeded
  // as they are — each as "fingerprint: why". Said, never refused.
  alreadyBroken: readonly string[];
};

// Apply every pending table migration — or, with `dryRun`, do all of it and roll
// it back. Refuses (strata's DOES_NOT_FIT, naming each entry and why) when an
// entry of `app` would not fit what the run leaves.
//
// The step a deployment runs before it starts, so it is handed what a server
// is handed: the runtime and the app. It reads the four fields of the one, and
// of the other the entries and the tables its features keep.
export const migrateTables = async (
  runtime: Pick<NiscRuntime, 'pool' | 'cache' | 'session' | 'tables'>,
  app: Pick<NiscApp, 'entries' | 'features'>,
  options: { dryRun?: boolean } = {},
): Promise<TablesReport> => {
  // Asked of the manifest module, which is the one place that says what an
  // app's entries are: no server stands here, so no running manifest holds
  // them.
  const entries = entriesOf(app);
  const cache = runtime.cache ?? createPostgresCache({ pool: runtime.pool });

  // As the database stands now — read before the run, on the pool: a single-
  // connection database (PGlite) cannot answer the pool while a transaction is
  // open.
  const before = await createPostgresAdapter({ pool: runtime.pool }).introspect();
  const misfitsBefore = misfitsOf(entries, before);
  const excused = new Set<string>();
  for (const entry of entries) {
    // a database never started on has no cache table to ask: nothing is seeded
    if (misfitsBefore.has(entry.fingerprint) && (await isSeededAs(cache, entry).catch(() => false))) excused.add(entry.fingerprint);
  }

  let found: Pick<TablesReport, 'removed' | 'retyped' | 'alreadyBroken'> = { removed: [], retyped: [], alreadyBroken: [] };
  const owners: TableOwners = { pool: runtime.pool, cache: runtime.cache, storesSessions: runtime.session === 'sessions', featureTables: featureTablesOf(app), tables: runtime.tables };
  const report = await migrate(runtime.pool, tableSequencesOf(owners), {
    ...(options.dryRun === true ? { dryRun: true } : {}),
    guard: async (tx) => {
      const after = await createPostgresAdapter({ pool: { query: oneAtATime((text, values) => tx.query(text, values)) } }).introspect();
      const refused: string[] = [];
      const alreadyBroken: string[] = [];
      for (const [fingerprint, why] of misfitsOf(entries, after)) {
        if (excused.has(fingerprint)) alreadyBroken.push(`${fingerprint}: ${why}`);
        else refused.push(`${fingerprint}: ${why}`);
      }
      found = { ...changesBetween(before, after), alreadyBroken };
      return refused;
    },
  });
  // A run that applied nothing took nothing away: what differs from `before`
  // then landed from another run, while this one waited for the lock.
  return { ...report, ...found, ...(report.applied.length === 0 ? { removed: [], retyped: [] } : {}) };
};
