// ═══════════════════════════════════════════════════════════════
// Data — what somebody may read and write.
//
// The third question moss asks of a request, once it knows who is calling and
// what exists for them. Every read and every write of an app goes through vex,
// under a policy compiled from the charter, and this is where that is set up.
// `createData` (./data.ts) is the one object the server builds for all of it.
//
// THE ENGINE (./engine.ts) stands up from what is present: the seeded entries
// are the whole surface, and what can be granted is the tables the database
// has.
//
// THE POLICY a set of roles reads and writes under (./policy.ts) is their
// `data` grants over that set, with the app's row behaviors: compiled once for
// each set of roles and kept until the manifest changes.
//
// THE ROUTES (./routes.ts) are the locked vex surfaces a request reads and
// writes through, with who the request is said by the caller. A WRITE they
// serve is offered to whoever subscribes (./writes.ts).
//
// A SEEDED ENTRY RUN AS A CHARTER ROLE (./execute-as.ts) is how machinery
// with no principal reads and writes: in process, replay only, under that
// role's policy. Every execution is reported as a span (./span.ts).
//
// A FEATURE'S OWN ENTRIES (./own-entries.ts) are the reads and writes a
// feature makes on the tables it keeps: seeded into a cache no route serves,
// and replayed in process under a policy that admits those tables alone.
//
// AN INTENT ANSWERED BY A QUERY WRITTEN FOR IT (./intents.ts) is the one
// place a query is written while the app runs: with the app's writers, under
// the policy of whoever it is asked for, and kept where the routes replay.
//
// A READ THAT KEEPS ANSWERING (./follow.ts) is the seam between a reactive
// entry and the shell that asked for it over the in-process wire.
//
// THE TABLES go through one ledgered run (./migrate.ts), which refuses a run
// the app's entries would not fit. Moss's own tables are one sequence in that
// run (./tables.ts), and the documents stored in them are read in this code's
// grammars (./grammar.ts).
//
// THE GENERATION POINTER'S ROW (./pointer.ts) is one of those tables' rows:
// the counter every process polls. It is read and moved here, by two entries
// replayed as a feature's own are, and the manifest module, which holds the
// clock, is handed those two functions.
//
// This module imports `runtime`, `identity` and `manifest`, and nothing else
// of moss.
// ═══════════════════════════════════════════════════════════════

export { createData } from './data';
export type { Data, DataConfig, DataRoutesConfig } from './data';
export type { ExecuteAs } from './execute-as';
export { createWireFollower } from './follow';
export type { Intent, QueryWriters } from './intents';
export { featureTablesOf, migrateTables } from './migrate';
export type { TablesReport } from './migrate';
export { resolvePolicy } from './policy';
export { MOSS_SEQUENCE } from './tables';
export type { ChainHints, WriteListener } from './writes';
