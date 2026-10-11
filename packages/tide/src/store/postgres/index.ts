// ═══════════════════════════════════════════════════════════════
// TIDE, MADE DURABLE — the Postgres store, on an entry point of its
// own: `@niscorp/tide/postgres`.
//
// The engine imports nothing but zod, and must not be able to
// import a host. This file is not the engine. Nothing the main
// entry reaches imports it; the pool it runs on is a type written
// out below; and the one package it imports is strata, for the
// ledger its tables are migrated through. Strata is an optional
// peer: whoever keeps tide's tables in Postgres installs it.
//
// It was in moss, written against vex's pool type, and every moss
// app installed tide for it. It is tide's storage, held to tide's
// store contract (test/postgres-store.test.ts), so it is here.
//
// The engine's own writes go through the POOL, not through a host's
// write path (under moss: vex's mutation pipeline), and the reason
// is worth stating because the opposite looks tidier. A vex mutation
// is an AUTHORED, scope-compiled statement replayed on behalf of a
// principal — the right shape for an application write, and the
// wrong shape for an engine claiming its own task: there is no
// principal, no tenant to scope to, and no user input to police.
// Routing bookkeeping through a policy compiler would add a scope
// rule that permits everything, which is a way of saying the rule
// is not doing anything.
//
// The LEDGER READS are the other half and they are the host's —
// under moss, ordinary vex entries over these tables, scoped on
// `as`. That is why a run carries the identity it ran under.
// ═══════════════════════════════════════════════════════════════


// THE DOOR of the store, and the `@niscorp/tide/postgres` entry. Behind it:
//
//   pool.ts     — the pool the store runs on, as much of one as it uses
//   tables.ts   — the four tables, and the strata sequence that makes them
//   rows.ts     — a row and an entity, both directions, read by a schema
//   compile.ts  — a `where`, an `order` and a `set`, compiled to SQL
//   claim.ts    — the claim: selection and mutation in one statement, and one
//                 instance at a time in a serial group
//   store.ts    — createTideStore: the six capabilities over a pool
export { createTideStore } from './store';
export type { TideStoreOptions } from './store';
export { TIDE_DDL, TIDE_SEQUENCE, TIDE_TABLES } from './tables';
export type { TidePool, TidePoolQuery } from './pool';
