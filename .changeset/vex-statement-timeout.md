---
'@niscorp/vex': minor
---

Every read is bounded: `config.statementTimeoutMs` (default 10s, `0` unbounded), enforced by the database. At introspect the engine asks the adapter (`limitReads`), which asks Postgres what its connections already enforce: at or under the limit, reads run plain (free); otherwise each read runs as `SET LOCAL statement_timeout` in a transaction (measured 3.4× a plain read). A pool that cannot enforce it says so — `PgPool.statementTimeouts: false`, which the PGlite pool sets — and the engine warns once. Mutations are unchanged.
