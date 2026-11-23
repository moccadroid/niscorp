import { createPostgresAdapter, createPostgresCache, createQueryEngine, scopeGrants } from '@niscorp/vex';
import type { CacheBackend, CacheEntry, ColumnUpgrader, DatabaseAdapter, DatabaseSchema, ExecuteRecord, PgPool, QueryEngine, QueryEngineConfig } from '@niscorp/vex';
import { createUpgrader, type Sequence, type Upgrader } from '@niscorp/strata';
import { NOVA_SEQUENCE } from '@niscorp/nova/migrations';
import { evaluate } from '@niscorp/prism';
import { PRISM_SEQUENCE } from '@niscorp/prism/migrations';
import { VEX_SEQUENCE } from '@niscorp/vex/migrations';
import type { TelemetrySpan } from '../runtime';
import type { ViewReads } from '../manifest';

export type EntriesAskedFirst = {
  get: (fingerprint: string, scope?: Record<string, unknown>) => Promise<CacheEntry | undefined>;
  entries: () => Promise<{ key: string; entry: CacheEntry }[]>;
};

export type EntryCache = {
  cache: CacheBackend;
  askFirst: (first: EntriesAskedFirst) => void;
};

// The table answers for what a request wrote and for nothing else in it: vex
// gives a query it generates the hash of the request, and a negative result its kind.
const isWrittenForRequest = (entry: CacheEntry): boolean => entry.kind === 'unsatisfiable' || entry.requestHash !== undefined;

export const createEntryCache = (table: CacheBackend): EntryCache => {
  let askedFirst: EntriesAskedFirst | undefined;
  const fromTable = (entry: CacheEntry | undefined): CacheEntry | undefined => (entry !== undefined && isWrittenForRequest(entry) ? entry : undefined);

  const tableEntries = async (): Promise<{ key: string; entry: CacheEntry }[]> => {
    const rows = table.entries !== undefined ? await table.entries() : await Promise.all((await table.keys()).map(async (key) => ({ key, entry: await table.get(key) })));
    return rows.flatMap(({ key, entry }) => {
      const kept = fromTable(entry);
      return kept === undefined ? [] : [{ key, entry: kept }];
    });
  };

  const entries = async (): Promise<{ key: string; entry: CacheEntry }[]> => {
    const first = (await askedFirst?.entries()) ?? [];
    const answered = new Set(first.map((row) => row.key));
    return [...first, ...(await tableEntries()).filter((row) => !answered.has(row.key))];
  };

  return {
    askFirst: (first) => {
      askedFirst = first;
    },
    cache: {
      get: async (key, scope) => (await askedFirst?.get(key, scope)) ?? fromTable(await table.get(key)),
      // Vex stamps an entry it replays by writing it back: one that was not written for a request is not the table's to keep.
      set: async (key, entry) => {
        if (isWrittenForRequest(entry)) await table.set(key, entry);
      },
      delete: (key) => table.delete(key),
      clear: () => table.clear(),
      keys: async () => (await entries()).map((row) => row.key),
      entries,
    },
  };
};

export type DataLayer = {
  engine: QueryEngine;
  adapter: DatabaseAdapter;
  schema: DatabaseSchema;
  grants: string[];
  views: ViewReads[];
  askFirst: EntryCache['askFirst'];
};

export type DataLayerDeps = {
  pool: PgPool;
  cache?: CacheBackend;
  vexConfig?: QueryEngineConfig['config'];
  views?: readonly string[];
  viewExtensions?: readonly string[];
  upgradedColumns?: QueryEngineConfig['upgradedColumns'];
  upgrader?: ColumnUpgrader;
};

// The app's `views` are the one list of them, and `nisc migrate` reads the same one.
const configWithViews = (deps: Pick<DataLayerDeps, 'vexConfig' | 'views' | 'viewExtensions'>): DataLayerDeps['vexConfig'] => {
  if (deps.vexConfig?.views !== undefined || deps.vexConfig?.viewExtensions !== undefined) {
    throw new Error('moss: views are listed in `defineApp({ views, viewExtensions })`, where `nisc migrate` reads them too, not in `runtime.vexConfig`.');
  }
  const views = deps.views ?? [];
  return views.length === 0 ? deps.vexConfig : { ...deps.vexConfig, views: [...views], viewExtensions: [...(deps.viewExtensions ?? [])] };
};

// A view is only ever read: no write to it is a grant anybody can hold.
const dataGrants = (entities: DatabaseSchema['entities']): string[] =>
  entities.flatMap((e) => (e.view !== undefined ? [`${e.name}.read`] : scopeGrants([e.name])));

export const createDataLayer = async (deps: DataLayerDeps): Promise<DataLayer> => {
  const adapter = createPostgresAdapter({ pool: deps.pool });
  const table = deps.cache ?? createPostgresCache({ pool: deps.pool });
  await table.init?.();
  const { cache, askFirst } = createEntryCache(table);
  const config = configWithViews(deps);
  const engine = createQueryEngine({
    adapter,
    cache,
    ...(config !== undefined ? { config } : {}),
    ...(deps.upgradedColumns !== undefined && deps.upgrader !== undefined ? { upgradedColumns: deps.upgradedColumns, upgrader: deps.upgrader } : {}),
  });
  const schema = await engine.introspect();
  const views = schema.entities.flatMap((e) => (e.view !== undefined ? [{ name: e.name, reads: e.view.reads }] : []));

  return { engine, adapter, schema, grants: dataGrants(schema.entities), views, askFirst };
};

export const grammarsOf = (app: { grammars?: readonly Sequence[] }): readonly Sequence[] => [
  NOVA_SEQUENCE,
  PRISM_SEQUENCE,
  VEX_SEQUENCE,
  ...(app.grammars ?? []),
];

export const createGrammarUpgrader = (app: { grammars?: readonly Sequence[] }): Promise<Upgrader> =>
  createUpgrader(grammarsOf(app), { transform: evaluate });

export const vexRecordToSpan = (rec: ExecuteRecord): TelemetrySpan => ({
  name: 'vex.execute',
  startUnixNano: rec.startUnixNano,
  endUnixNano: rec.endUnixNano,
  status: rec.status,
  attributes: {
    op: rec.kind,
    hasPrincipal: (rec.scope['userId'] ?? 'anonymous') !== 'anonymous',
    ...(rec.fingerprint !== undefined ? { fingerprint: rec.fingerprint } : {}),
    ...(rec.reach !== undefined ? { reach: rec.reach } : {}),
    ...(rec.cacheHit !== undefined ? { cache: rec.cacheHit ? 'hit' : 'miss' } : {}),
    ...(rec.rows !== undefined ? { rows: rec.rows } : {}),
  },
});
