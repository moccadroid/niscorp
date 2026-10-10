---
'@niscorp/tide': patch
---

Tide's Postgres store and its driver ship from tide. They were in `@niscorp/moss`.

**A new entry point, `@niscorp/tide/postgres`: the store.**

- `createTideStore(pool, options?)` answers a `TideStore` plus `ready: Promise<void>`, over four tables it migrates itself through a strata ledger. With it come `TIDE_SEQUENCE` (the tables, as a strata sequence, for an app that migrates them in its own run), `TIDE_TABLES`, `TIDE_DDL`, and the types `TideStoreOptions`, `TidePool` and `TidePoolQuery`.
- The pool is a type of the store's own, `TidePool`: `query(text, values?)`, and `transaction(fn)`. Vex's `PgPool`, a PGlite behind a shim and a `pg` pool that checks a client out for each transaction are each one. Tide imports no driver and no host.
- `@niscorp/strata` is a new peer, and it is OPTIONAL: only this entry point imports it. An app that uses `@niscorp/tide/postgres` installs strata; an app on the memory store or a store of its own does not.
- The sequence is the one every database that kept tide's tables under moss has run: its id is still `nisc.moss.tide`, and its migrations, their order and their steps are unchanged. A database migrated by an earlier release finds nothing pending.
- A row the store reads back is read by a schema, one for each table. A row that does not fit (a state the engine has no name for, a number where text belongs) throws where it is read, naming the table and the field. It used to be handed to the engine as it was.

**New in the main entry: the driver.**

- `createTideDriver({ tide, now?, janitorMs?, retention? })` answers a `TideDriver`: `ingest` and `fire` that wake the engine, `wake()`, and `stop()`. It advances to quiescence on every ingest, sleeps until the instant `nextDue` names, and sweeps on a slow beat. The types `TideDriver` and `TideDriverConfig` come with it.
- The engine still reads no clock and sets no timer. The driver is what does, for a host that does not want to write those twenty lines.

**What to change:** nothing, for an app that did not take these from moss. One that did imports them from here: see the moss changeset.
