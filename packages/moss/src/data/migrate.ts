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

type Entry = SeedEntry | SeedMutation;

export type TableOwners = {
  pool: PgPool;
  cache?: CacheBackend;
  storesSessions: boolean;
  featureTables?: readonly FeatureTables[];
  tables?: readonly Sequence[];
};

export const tableSequencesOf = (owners: TableOwners): readonly Sequence[] => {
  const cacheSequence = (owners.cache ?? createPostgresCache({ pool: owners.pool })).sequence;
  // The order matters: a feature's table may reference one of moss's.
  return [
    MOSS_SEQUENCE,
    ...(owners.storesSessions ? [SESSIONS_SEQUENCE] : []),
    ...(cacheSequence === undefined ? [] : [cacheSequence]),
    ...(owners.featureTables ?? []).flatMap((kept) => kept.sequences),
    ...(owners.tables ?? []),
  ];
};

const misfitOf = (entry: Entry, schema: DatabaseSchema): string | undefined => {
  if (!('mutation' in entry)) {
    try {
      resolve(pruneOptional(entry.dsl, 'all'), schema);
      return undefined;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }
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

// Jsonb reorders keys, so a stored definition is compared with its keys sorted.
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  const keys = Object.keys(value).filter((key) => Reflect.get(value, key) !== undefined).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(Reflect.get(value, key))}`).join(',')}}`;
};

const isSeededAs = async (cache: CacheBackend, entry: Entry): Promise<boolean> => {
  const held = await cache.get(entry.fingerprint);
  if (held === undefined || held.protected !== true) return false;
  if ('mutation' in entry) return held.kind === 'mutation' && canonical(held.mutation) === canonical(entry.mutation);
  return held.kind === 'ok' && canonical(held.dsl) === canonical(entry.dsl);
};

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

// Vex's introspection sends its queries at once, and a transaction is one
// connection: a driver asked a second question mid-answer may refuse it.
const oneAtATime = (query: PgPool['query']): PgPool['query'] => {
  let last: Promise<unknown> = Promise.resolve();
  return (text, values) => {
    const next = last.then(() => query(text, values));
    last = next.catch(() => undefined);
    return next;
  };
};

export type TablesReport = MigrateReport & {
  removed: readonly string[];
  retyped: readonly string[];
  alreadyBroken: readonly string[];
};

export const migrateTables = async (
  runtime: Pick<NiscRuntime, 'pool' | 'cache' | 'session' | 'tables'>,
  app: Pick<NiscApp, 'entries' | 'features'>,
  options: { dryRun?: boolean } = {},
): Promise<TablesReport> => {
  const entries = entriesOf(app);
  const cache = runtime.cache ?? createPostgresCache({ pool: runtime.pool });

  // Read before the run, on the pool: a single-connection database (PGlite)
  // cannot answer the pool while the run's transaction is open.
  const before = await createPostgresAdapter({ pool: runtime.pool }).introspect();
  const misfitsBefore = misfitsOf(entries, before);
  const excused = new Set<string>();
  for (const entry of entries) {
    // A database never started on has no cache table to ask: nothing is seeded.
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
  // landed from another run while this one waited for the lock.
  return { ...report, ...found, ...(report.applied.length === 0 ? { removed: [], retyped: [] } : {}) };
};

export type FeatureTables = {
  feature: string;
  names: readonly string[];
  sequences: readonly Sequence[];
};

export const featureTablesOf = (app: Pick<NiscApp, 'features'>): readonly FeatureTables[] => {
  const features = new Set<string>();
  return (app.features ?? []).map((feature) => {
    if (features.has(feature.name)) {
      throw new Error(`moss: two features are named "${feature.name}". A feature's name says whose a table and a set of actions are, so no two features of an app share one.`);
    }
    features.add(feature.name);
    const names = feature.tables?.names ?? [];
    return { feature: feature.name, names, sequences: feature.tables?.sequences ?? [] };
  });
};
