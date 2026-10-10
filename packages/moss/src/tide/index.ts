// ═══════════════════════════════════════════════════════════════
// TIDE'S FACTS — a committed write, minted into tide.
//
// What is left in moss of hosting tide. Its Postgres store and its driver are
// tide's own (`@niscorp/tide/postgres`, `createTideDriver`); this is the glue
// only a host can be: vex reports a write, and each row it returned becomes a
// `{ kind: 'write' }` fact (./mint.ts).
// ═══════════════════════════════════════════════════════════════

export { mintWrites } from './mint';
