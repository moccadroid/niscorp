// ═══════════════════════════════════════════════════════════════
// Data — what somebody may read and write.
//
// The third question moss asks of a request, once it knows who is calling and
// what exists for them. Every read and every write of an app goes through vex,
// under a policy compiled from the charter, and this is where that is set up.
// `createData` (./data.ts) is the one object the server builds for all of it.
//
// THE ENGINE (./engine.ts) stands up from what is present: what a request may
// replay is what its cache holds, and what can be granted is the tables the
// database has. The app's entries this module does not read off an app: their
// source is the running manifest, which hands its list over once to be
// copied into that cache (`Data.seed`). From then on a replay, and the list
// of fingerprints, resolve in the cache and ask the manifest nothing; and the
// cache also holds a query written for an intent while the app runs
// (./routes.ts) and any row it held before this boot.
//
// THE POLICY a set of roles reads and writes under (./policy.ts) is their
// `data` grants over that set, with the app's row behaviors: compiled once for
// each set of roles and kept until the manifest changes.
//
// THE ROUTES (./routes.ts) are the locked vex surfaces a request reads and
// writes through, with who the request is said by the caller. A WRITE they
// serve is offered to whoever subscribes (./writes.ts).
//
// A SEEDED ENTRY RUN AS A CHARTER ROLE (./policy.ts) is how machinery
// with no principal reads and writes: in process, replay only, under that
// role's policy. Every execution is reported as a span (./engine.ts).
//
// A FEATURE'S OWN ENTRIES (./own-entries.ts) are the reads and writes a
// feature makes on the tables it keeps: seeded into a cache no route serves,
// and replayed in process under a policy that admits those tables alone.
// WHICH TABLES ARE A FEATURE'S (./migrate.ts) is read off the app's
// features before any of them runs.
//
// AN INTENT ANSWERED BY A QUERY WRITTEN FOR IT (./routes.ts) is the one
// place a query is written while the app runs: with the app's writers, under
// the policy of whoever it is asked for, and kept where the routes replay.
//
// A READ THAT KEEPS ANSWERING (./writes.ts) is the seam between a reactive
// entry and the shell that asked for it over the in-process wire.
//
// THE TABLES go through one ledgered run (./migrate.ts), which refuses a run
// the app's entries would not fit. Moss's own tables are one sequence in that
// run (./tables.ts), and the documents stored in them are read in this code's
// grammars (./engine.ts).
//
// THE GENERATION POINTER'S ROW (./own-entries.ts) is one of those tables' rows:
// the counter every process polls. It is read and moved here, by two entries
// replayed as a feature's own are, and the manifest module, which holds the
// clock, is handed those two functions.
//
// This module imports `runtime`, `identity` and `manifest`, and nothing else
// of moss.
// ═══════════════════════════════════════════════════════════════

export { createData } from './data';
export type { Data } from './data';
export { featureTablesOf, migrateTables } from './migrate';
export type { ExecuteAs } from './policy';
export type { Intent, QueryWriters } from './routes';
export { MOSS_SEQUENCE } from './tables';
export { createWireFollower } from './writes';
