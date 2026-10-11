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
- What a `where` compares a field with (`{ lte: 5 }`, `{ in: [...] }`) is read by a schema too. One that does not fit (`in` that is not a list, `isNull` that is not a boolean) throws, naming the field. The types of `Where` already refuse such a call, so nothing written against them changes.

**New in the main entry: the driver.**

- `createTideDriver({ tide, now?, janitorMs?, retention? })` answers a `TideDriver`: `ingest` and `fire` that wake the engine, `wake()`, and `stop()`. It advances to quiescence on every ingest, sleeps until the instant `nextDue` names, and sweeps on a slow beat. The types `TideDriver` and `TideDriverConfig` come with it.
- The engine still reads no clock and sets no timer. The driver is what does, for a host that does not want to write those twenty lines.
- **What the driver logs begins `[tide:driver]`.** It began `[moss:tide-driver]` while the driver was moss's. There are four such lines, all to `console.error`: a drain that exceeded its 10,000 steps, a next-due read that failed, a wake that threw, and a sweep that failed. A deployment that searches its logs for the old prefix, or alerts on it, searches for the new one.

**Two instances cannot both claim in one serial group.**

- A reflex with `order: 'serial'` runs one task at a time: the store claims in its group only when no task of it is held. The Postgres store asked whether the group was held and then claimed, as two statements. With two processes on one database, both could ask before either claimed, and each took a task: two tasks of a serial reflex ran at once.
- The two statements now run in one transaction, behind an advisory lock on the group (`pg_try_advisory_xact_lock`) that ends with the transaction. An instance that does not get the lock leaves the group to the one that has it; nothing waits.
- Proved on PGlite, where two stores over one database interleave their statements: the test claims twice at once and was red (two held) before the change. PGlite has one connection, so two real connections under `READ COMMITTED` were not run.
- `createTideStore` over a pool with no `transaction` now refuses a serial claim with the sentence `transact` already refused with. Such a pool could not run tide before: fan-out is a transaction.

**A wait longer than a timer can hold no longer makes the driver a loop.**

- The driver sleeps until the instant `nextDue` names, with one timer. Node keeps a timer's delay in 32 bits: one over 2^31 − 1 ms (24.8 days) is not refused, it is set to 1 ms, with a `TimeoutOverflowWarning`. A reflex whose next occurrence was further off than that had the driver wake every millisecond, advance, find nothing and ask again. Every wait is cut to 2^31 − 1 ms now: the driver wakes then, finds nothing, and waits out the rest.
- The same for a `janitorMs` set that long, which beat every millisecond.

**What to change:** nothing, for an app that did not take these from moss. One that did imports them from here: see the moss changeset.
