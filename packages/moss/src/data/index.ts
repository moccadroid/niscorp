// ═══════════════════════════════════════════════════════════════
// Data — what somebody may read and write.
//
// The third question moss asks of a request, once it knows who is calling and
// what exists for them. Every read and every write of an app goes through vex,
// under a policy compiled from the charter, and this is where that is set up.
//
// THE ENGINE (./engine.ts) stands up from what is present: the seeded entries
// are the whole surface, and what can be granted is the tables the database
// has.
//
// THE POLICY a set of roles reads and writes under (./policy.ts) is their
// `data` grants over that set, with the app's row behaviors.
//
// A READ THAT KEEPS ANSWERING (./follow.ts) is the seam between a reactive
// entry and the shell that asked for it over the in-process wire.
//
// THE TABLES go through one ledgered run (./migrate.ts), which refuses a run
// the app's entries would not fit; the documents stored in them are read in
// this code's grammars (./grammar.ts).
//
// This module imports `runtime`, `identity` and `manifest`, and nothing else
// of moss that is a module.
// ═══════════════════════════════════════════════════════════════

export { createDataLayer } from './engine';
export type { DataLayer } from './engine';
export { createWireFollower } from './follow';
export { createGrammarUpgrader } from './grammar';
export { migrateTables, tableSequencesOf } from './migrate';
export type { TablesReport } from './migrate';
export { memoKeyOf, resolvePolicy, resolvePolicyAtReachForRoles, resolvePolicyForRoles, resolveRoles } from './policy';
