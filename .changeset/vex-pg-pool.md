---
'@niscorp/vex': patch
---

`@niscorp/vex/pg` exports `createPgPool(pool, parsers?)`, which shapes a node-postgres `pg.Pool` as the `PgPool` the Postgres adapter and cache take, with a `transaction` that checks one client out of the pool and runs `BEGIN`/`COMMIT` (`ROLLBACK` when the callback throws) on it — what the cache's `init()`, batch mutations and per-read statement timeouts need. It also exports `RAW_DATE_PARSERS`, the same constant as `@niscorp/vex/pglite`'s. `pg` is now listed as an optional peer.
