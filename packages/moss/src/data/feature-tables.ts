import type { Sequence } from '@niscorp/strata';
import type { CacheBackend } from '@niscorp/vex';
import type { NiscApp } from '../manifest';
import { CACHE_HOLDS, CORE_TABLES } from './tables';

// ═══════════════════════════════════════════════════════════════
// WHICH TABLES ARE A FEATURE'S OWN — read off the app's features before any
// of them runs, and refused here when two owners would hold one table.
//
// A feature's own entries (./own-entries.ts) run under no charter: the policy
// they are replayed under admits the tables the feature keeps, open, and that
// is all that bounds them. So which tables those are is not something a
// feature says when it asks: it says it on itself (`Feature.tables.names`),
// where whoever puts it in a manifest can read it, and the data module holds
// it to that from then on.
//
// ONE OWNER PER TABLE. A table of the core's is no feature's (./tables.ts,
// `CORE_TABLES`), and a table one feature names is not another's.
//
// THE CORE'S TABLES, BY THE NAMES THIS DEPLOYMENT GAVE THEM. Three of the four
// have one name everywhere. The fourth is vex's cache, which is `vex_cache`
// unless the deployment handed the runtime a cache of its own, and a Postgres
// cache may keep its table under any name. So the cache in force is asked
// which table it keeps (`CacheBackend.table`), and that one is refused too:
// what is in it is every entry the engine replays.
// ═══════════════════════════════════════════════════════════════

export type FeatureTables = {
  // The feature's name: what its tables are asked for by, and what a refusal
  // says.
  feature: string;
  // The tables that are its own: every one its own entries may read and write.
  names: readonly string[];
  // The strata sequences that make them, for the tables' one ledgered run.
  sequences: readonly Sequence[];
};

const coreTableRefusal = (feature: string, table: string, holds: string): Error =>
  new Error(
    `moss: the feature "${feature}" names the table "${table}" as its own, and it is the core's: ${holds}. ` +
      `A feature's own entries run outside the app's policy, so they reach the tables that are the feature's and no other. ` +
      `Keep what the feature needs in a table of its own (\`tables.sequences\`).`,
  );

// The schema whose tables the engine serves (./engine.ts makes its adapter
// with no other). A cache kept in another schema keeps a table no entry
// reaches, so its name is free here.
const SERVED_SCHEMA = 'public';

// The core's tables on a deployment whose cache is `cache`: the ones every
// deployment has, and the one this cache keeps vex's entries in. No cache
// handed over is the default one, which `CORE_TABLES` already names.
const coreTablesWith = (cache: Pick<CacheBackend, 'table'> | undefined): ReadonlyMap<string, string> => {
  const kept = cache?.table;
  if (kept === undefined || kept.schema !== SERVED_SCHEMA) return CORE_TABLES;
  return new Map([...CORE_TABLES, [kept.name, CACHE_HOLDS]]);
};

// The tables the app's features keep, in the order the app named the features.
// One function, for the server and for the step that migrates before it
// starts: the two must run the same sequences, or a boot that only verifies
// (`migrations: 'verify'`) finds one pending that the step never applied.
// Throws on a claim that cannot hold, before a table is made. `cache` is the
// one the deployment handed its runtime, when it handed one.
export const featureTablesOf = (app: Pick<NiscApp, 'features'>, cache?: Pick<CacheBackend, 'table'>): readonly FeatureTables[] => {
  const core = coreTablesWith(cache);
  const ownerOf = new Map<string, string>();
  const features = new Set<string>();
  return (app.features ?? []).map((feature) => {
    if (features.has(feature.name)) {
      throw new Error(`moss: two features are named "${feature.name}". A feature's name says whose a table and a set of actions are, so no two features of an app share one.`);
    }
    features.add(feature.name);
    const names = feature.tables?.names ?? [];
    for (const table of names) {
      const holds = core.get(table);
      if (holds !== undefined) throw coreTableRefusal(feature.name, table, holds);
      const other = ownerOf.get(table);
      if (other !== undefined) throw new Error(`moss: the features "${other}" and "${feature.name}" both name the table "${table}" as their own. A table has one owner.`);
      ownerOf.set(table, feature.name);
    }
    return { feature: feature.name, names, sequences: feature.tables?.sequences ?? [] };
  });
};
