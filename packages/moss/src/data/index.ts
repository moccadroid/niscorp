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
// A READ THAT KEEPS ANSWERING (./follow.ts) is the seam between a reactive
// entry and the shell that asked for it over the in-process wire.
//
// THE TABLES go through one ledgered run (./migrate.ts), which refuses a run
// the app's entries would not fit. Moss's own tables are one sequence in that
// run (./tables.ts), and the documents stored in them are read in this code's
// grammars (./grammar.ts).
//
// This module imports `runtime`, `identity` and `manifest`, and nothing else
// of moss.
// ═══════════════════════════════════════════════════════════════

export { createData } from './data';
export type { Data, DataConfig, DataRoutesConfig } from './data';
export type { ExecuteAs } from './execute-as';
export type { OwnEntries, Replay } from './own-entries';
export { createWireFollower } from './follow';
export { migrateTables } from './migrate';
export type { TablesReport } from './migrate';
export { resolvePolicy } from './policy';
export { MOSS_SEQUENCE } from './tables';
export type { ChainHints, WriteListener } from './writes';
