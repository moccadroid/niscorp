import type { Sequence } from '@niscorp/strata';
import type { NiscApp } from '../manifest';

// Which tables are a feature's own, read off the app's features before any
// of them runs. A feature's own entries (./own-entries.ts) run under a policy
// that admits the tables the feature names on itself (`Feature.tables.names`)
// and no other.

export type FeatureTables = {
  // The feature's name: what its tables are asked for by, and what a refusal
  // says.
  feature: string;
  // The tables that are its own: every one its own entries may read and write.
  names: readonly string[];
  // The strata sequences that make them, for the tables' one ledgered run.
  sequences: readonly Sequence[];
};

// The tables the app's features keep, in the order the app named the features.
// One function, for the server and for the step that migrates before it
// starts: the two must run the same sequences, or a boot that only verifies
// (`migrations: 'verify'`) finds one pending that the step never applied.
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
