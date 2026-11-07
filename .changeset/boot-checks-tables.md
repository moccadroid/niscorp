---
"@niscorp/moss": minor
"@niscorp/cli": minor
"@niscorp/nisc": minor
---

A real database's tables change only through `nisc migrate`. `migrations` on the runtime defaults to `'verify'`: `createServer` — and so `nisc dev`, `nisc build` and `nisc start` — checks the tables and refuses to start while a migration is pending, naming each one and the two commands that apply it (`npx nisc migrate --check`, then `npx nisc migrate`). On a database that is up to date the check only reads the ledger, so the app's database role needs `SELECT` on `strata_ledger` and no right to change tables. A runtime whose database starts empty every time (PGlite in memory) writes `migrations: 'apply'` and is migrated at boot as before.

The boot and `migrateTables` refuse a database whose ledger records a sequence they do not name (`UNKNOWN_SEQUENCE`): a sequence that has run stays in `runtime.tables`.

`migrateTables` and `nisc migrate` refuse a run that removes a table or a column, or changes a column's type, unless `allowRemoval` / `--allow-removal` is given; the refusal names each. A run that applied nothing, because another run had already applied it, is not refused.

`tableStatus(runtime, app)` and `nisc migrate --status`: what is applied and what is pending, read and nothing else.

BREAKING — approved by moccadroid, 2026-11-07: a runtime on a real database runs `nisc migrate` before the app starts (on Railway, the service's pre-deploy command `pnpm exec nisc migrate`); a runtime on in-memory PGlite writes `migrations: 'apply'`; every sequence that has run on the database is in `runtime.tables` (`TIDE_SEQUENCE` with the store made `migrate: false`), and the runtime migrates nothing itself and calls no `cache.init()`; a database that has not yet run `nisc.moss/4` is migrated once with `--allow-removal`.
