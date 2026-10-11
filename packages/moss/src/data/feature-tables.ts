import type { Sequence } from '@niscorp/strata';
import type { NiscApp } from '../manifest';
import { CORE_TABLES } from './tables';

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

// The tables the app's features keep, in the order the app named the features.
// One function, for the server and for the step that migrates before it
// starts: the two must run the same sequences, or a boot that only verifies
// (`migrations: 'verify'`) finds one pending that the step never applied.
// Throws on a claim that cannot hold, before a table is made.
export const featureTablesOf = (app: Pick<NiscApp, 'features'>): readonly FeatureTables[] => {
  const ownerOf = new Map<string, string>();
  const features = new Set<string>();
  return (app.features ?? []).map((feature) => {
    if (features.has(feature.name)) {
      throw new Error(`moss: two features are named "${feature.name}". A feature's name says whose a table and a set of actions are, so no two features of an app share one.`);
    }
    features.add(feature.name);
    const names = feature.tables?.names ?? [];
    for (const table of names) {
      const holds = CORE_TABLES.get(table);
      if (holds !== undefined) throw coreTableRefusal(feature.name, table, holds);
      const other = ownerOf.get(table);
      if (other !== undefined) throw new Error(`moss: the features "${other}" and "${feature.name}" both name the table "${table}" as their own. A table has one owner.`);
      ownerOf.set(table, feature.name);
    }
    return { feature: feature.name, names, sequences: feature.tables?.sequences ?? [] };
  });
};
