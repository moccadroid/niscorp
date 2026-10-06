---
"@niscorp/cli": patch
---

`nisc migrate`: apply the tables' pending migrations, if the app's entries fit the result. `--check` is the dry run.

It is the step a deployment runs before the new version starts, when its runtime says `migrations: 'verify'`. It calls moss's `migrateTables`: one transaction, every pending table migration, then every entry of the manifest checked against the schema as it would stand. If one does not fit, nothing is applied, the command names the entry and why, and exits 1. A run that lands says what it applied and what it took away. `--check` does all of it and rolls it back.

`nisc.config.ts` hands it two new optional fields: `app`, the manifest, and `runtime`, a function that opens the environment (`NiscRuntime`, plus `close` if there is something to let go of). That function migrates nothing and seeds nothing itself — tables it changes are changed before the step can check them. The app's sequences go in `runtime.tables`.

**What to change:** nothing. A config without `app` and `runtime` runs every other command as before, and `nisc migrate` says what it is missing.
