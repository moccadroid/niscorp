---
"@niscorp/strata": patch
---

`migrate` reads the ledger before it locks or creates anything. On a database with nothing pending a run is that read and nothing else — no lock, no `CREATE TABLE IF NOT EXISTS strata_ledger`, no transaction — so a database role without the right to change tables can check them. `mode: 'verify'` is always that read: it needs `SELECT` on the ledger and no `transaction` on the pool.

A run sets its own timeouts for its transaction: `statementTimeoutMs` (default 3 600 000) bounds every step and the wait for another run; `lockTimeoutMs` (default 10 000) makes a step queued behind a busy table give up instead of queueing every later query on that table behind it. The pool's own `statement_timeout` no longer cuts a migration step, and is as it was after the run. A step that times out fails the run (`STEP_FAILED`), which is rolled back.

`complete: true` (on `migrate`, `status` and `planMigrations`) says the sequences given are every sequence the ledger may record: a ledger sequence nobody names is refused, `UNKNOWN_SEQUENCE`. Without it nothing changes.

A `guard` is told what the run applied: `guard(tx, { applied })`.

**What to change:** nothing. A migration step that waits longer than 10 s for a lock now fails instead of waiting; pass `lockTimeoutMs` to wait longer.
