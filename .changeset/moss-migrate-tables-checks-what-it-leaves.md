---
"@niscorp/moss": patch
---

`migrateTables`: the step that changes the tables, and checks the app's entries against what it leaves before it commits. `runtime.tables` hands it the app's own.

A deployment whose runtime says `migrations: 'verify'` refuses to start with anything pending, and moss had nothing to run first. An app's own tables were outside that run, so `'verify'` did not cover them.

`runtime.tables` takes the app's own table sequences (and another owner's the app keeps — tide's `TIDE_SEQUENCE`). They join moss's one ledgered run, after moss's own. A runtime that hands tables over does not also migrate them itself.

`migrateTables(runtime, app, { dryRun? })` applies everything pending in that run and, before it may commit, checks every entry of the manifest against the schema as it would stand: a read is resolved, a write is put to the gates it passes before it runs (vex's `mutationMisfits`). An entry that does not fit refuses the run — strata's `DOES_NOT_FIT`, each reason as `fingerprint: why` — and nothing is applied. It checks when nothing was pending too, so a release that changes an entry and no table is checked.

One kind of entry is listed and not refused: one that already did not fit before the run and that the database already holds seeded exactly as it is. A new or changed entry gets no such pass. The report also says which tables and columns a run removed and which column types it changed.

It sees entries and nothing else: not SQL written by hand, not a column a scope rule stamps, not what a value means.

**What to change:** nothing. A boot applies and verifies exactly what it did: a runtime without `tables` runs the same sequences in the same order.
