# Table migrations: only `nisc migrate` changes a real database

Status: proposed, 2026-11-07. Nothing built. One independent review round; its findings are folded in below.

Started from Mira's report: `nisc dev` / `build` / `start` boot the app, and boot applied pending migrations to the
owner's Postgres (Mira `docs/lessons.md` #24). Widened to: strata's table migrations should meet what current tools
(Flyway, Atlas, Prisma `migrate deploy`, Rails + strong_migrations) treat as standard.

## The rule

A real database's tables change only through `nisc migrate`. Booting checks the ledger and refuses to start when
something is pending; it applies only when the runtime writes `migrations: 'apply'`, which only in-memory runtimes do.

On Railway the app's service gets a pre-deploy command, `pnpm exec nisc migrate`. Railway runs it after the build,
before the new version starts, in the same image with the same environment; a failure stops the deploy and the running
version keeps serving. That last part holds because a run is one transaction: a failed run leaves nothing behind.

## strata (`@niscorp/strata`, minor)

### S1. A run reads before it writes

`migrate` reads the ledger first, outside any transaction, the way `status` does (`to_regclass`, then the rows):

- any problem (`EDITED`, `TOO_NEW`, `UNKNOWN_SEQUENCE`, …) → refused, as today;
- `mode: 'verify'` → `PENDING` if anything is pending, else done. No lock, no DDL, no `transaction` needed;
- `mode: 'apply'`, nothing pending, no `guard`, no `dryRun` → done, nothing run;
- otherwise the locked run, which reads the ledger again under the lock (another process may have applied it).

Why: today verify takes the lock and runs `CREATE SCHEMA/TABLE IF NOT EXISTS`, so a role without DDL rights cannot
even check (proven on PGlite: `status` passes, `verify` fails "permission denied for schema public"). After S1, every
call on a migrated database is a read — moss's boot, vex's `cache.init()`, tide's `createTideStore`.

That also makes a locked-down setup possible, though nothing here sets it up: the app connects as a role without DDL
rights, and `nisc migrate` connects as one with them. It needs a second URL for the pre-deploy command
(`DATABASE_URL=$MIGRATION_DATABASE_URL pnpm exec nisc migrate`), `SELECT` on `strata_ledger` for the app role, and
default privileges so the app role can use the tables the migration role creates. The README says so; no package
reads a second URL.

Safe without the lock: the ledger read is one statement; a concurrent run commits its DDL and its ledger rows in one
transaction, so the read sees all of it or none, and anything it decides to run is read again under the lock.

### S2. The run sets its own timeouts

New options `lockTimeoutMs` (default 10 000) and `statementTimeoutMs` (default 3 600 000) — the values
strong_migrations' README recommends. Inside the run's transaction, set with `set_config(name, $1, true)`, in this
order:

1. `statement_timeout` — bounds every step, and the wait for another migrator;
2. the advisory lock — waiting for another `nisc migrate` is bounded by the statement timeout (a lock timeout set
   first would cut that wait to 10 s);
3. `lock_timeout` — a step that waits on a table lock (an `ALTER TABLE` queued behind a long app query, with every
   later app query queued behind it) gives up after 10 s.

A step that times out is `STEP_FAILED` and the run is rolled back, as any failing step. No retries: the deploy fails,
the old version keeps serving, the operator runs it again.

Today Mira's migrations run under its pool's 10 s statement timeout: a long backfill fails, and the wait behind a lock
is bounded only by accident.

### S3. Sequences the code no longer names

New option `complete: true`: the sequences given are every sequence this ledger may record. With it, a ledger sequence
that is not given is a problem, `UNKNOWN_SEQUENCE`, refused like `TOO_NEW`:

> acme.app.notes: the database records 3 of its migrations and no code names it. A sequence that has run stays in the
> code — to remove its tables, append a migration that drops them. One app per database schema: two apps sharing a
> schema share one ledger.

Without `complete` nothing changes — vex's cache and tide's store migrate only their own sequence and cannot know the
others. Catches a renamed sequence id, which today runs its migration 1 again under the new name. Grammar sequences
never reach the ledger (refused at `postgres/index.ts:80-93`), so they are unaffected.

Retiring a sequence means keeping it: a feature removed from an app leaves its sequence in `runtime.tables`; an app
that stops storing sessions or stops using a Postgres cache keeps `SESSIONS_SEQUENCE` / the cache's sequence there.
Turning the feature back on means taking it out of `runtime.tables` again (strata already refuses two sequences with
one id, `INVALID_SEQUENCE`, so the mistake is named).

## moss (`@niscorp/moss`, minor — breaking)

1. `migrations` defaults to `'verify'`. One default, one opt-in; no sniffing for PGlite.
2. Boot and `migrateTables` pass `complete: true` (S3).
3. A `PENDING` refusal at boot keeps strata's list of pending migrations and adds: run `npx nisc migrate --check`, then
   `npx nisc migrate`.
4. `migrateTables` takes `allowRemoval`. Without it, its guard refuses a run that removes a table or column or changes
   a column's type, listing them. Limits: it sees what vex introspects — not `DELETE FROM`, not rewritten jsonb keys;
   the "before" picture is read outside the lock, so a concurrent run's removal can be blamed on this one (a refusal,
   on the safe side; running again passes). moss's own sequence drops columns (`moss/src/data/tables.ts:131-152`): a
   database that has not run those yet needs `--allow-removal` once, and the refusal lists exactly those columns.
5. Keeps calling `cache.init()` in `createDataLayer`: for a tiered cache it also fills memory from Postgres.

## cli (`@niscorp/cli`, minor)

- `nisc migrate --allow-removal`.
- `nisc migrate --status`: what is applied and what is pending, from strata's `status` — reads only, takes no lock
  (Flyway `info`, Prisma `migrate status`, Rails `db:migrate:status`). `--check` stays the full rehearsal.
- Usage text names both.

## create-nisc templates (patch)

- Every moss template's `nisc.config.ts` hands over `app` and `runtime`, so `nisc migrate` works the day an app moves
  to Postgres (today it fails "needs `app` and `runtime`").
- `boot` is built from `runtime()`, so the tables `nisc migrate` applies are the tables boot checks (model-first passes
  `tables` only in `boot` today).
- The in-memory runtimes write `migrations: 'apply'`.
- No runtime calls `cache.init()` itself (moss does, after its check; in `nisc migrate`, a runtime that calls it applies
  the cache's migrations before the guard).
- A tide store under moss is created with `migrate: false`.

## nisc (`packages/nisc/AGENTS.md`, rule 17)

Rewritten: a real database's tables change only through `nisc migrate`; the runtime hands every sequence to moss
(`runtime.tables`, `TIDE_SEQUENCE` with `migrate: false`) and calls no `cache.init()`; boot verifies; only an in-memory
runtime writes `migrations: 'apply'`; a sequence that has run stays in the code; one app per database schema. The
"migrated by its runtime" deployment goes.

vex's `cache.init()` and tide's `createTideStore` keep applying their own sequence by default: they are usable without
moss. Under moss the rule above is what keeps them from applying at boot.

## Apps

- **Mira** (Railway, Postgres; after the release, its own session): pre-deploy command `pnpm exec nisc migrate`; the
  PGlite runtime writes `migrations: 'apply'`; the Postgres runtime stops calling `cache.init()`;
  `createTideStore(pool, { migrate: false })` in `src/server/automation/engine.ts`. Its Docker build already boots on
  PGlite.
- nisc-website and moccadroid-website serve static files: no change.
- The in-memory lab apps (atrium, lyra, lyra-admin, encore, relay): `migrations: 'apply'`, no `cache.init()`. Done in
  this branch: CI builds atrium and lyra by booting them.
- **lyceum**, in this branch: it uses the workspace packages, so it breaks the moment moss changes. Below.

### lyceum

Today both runtimes (`src/server/runtime.ts` on PGlite, `src/server/postgres-runtime.ts` on Postgres) open the
database, migrate `LYCEUM_SEQUENCES` (`lyceum.app` and tide's) themselves, run the seed, call `cache.init()`, and only
then hand the runtime to `bootOn`. `startTiming` makes a tide store that migrates tide's tables again. moss is told about
none of these sequences, so with `complete: true` its boot refuses (`UNKNOWN_SEQUENCE: lyceum.app`, `nisc.moss.tide`).

**The seed is not demo data and is not a migration.** `buildSeedSql()` syncs what the code says the talk is — the
talks, their slides, each slide's tools and notes, the deck pointer (put back on a slide that still exists), and the
staff grants (speaker, stage, kit, moderator, clock) — idempotently, every start, in dev and on Railway. It has to
follow every edit of `src/db/talks`: a migration cannot, because an applied migration is history and editing it is
refused (`EDITED`). It writes rows and never tables, so the new rule (only `nisc migrate` changes tables) does not
touch it. It stays a start-time sync; what changes is when it runs: after moss has checked the tables (Postgres) or
applied them (PGlite), instead of before moss sees them. Rule 17 says rows an app needs to start come from a migration
step; the staff grants are such rows, and stay in the seed — lyceum is a talk, and the seed is its content.

The change:

1. `LyceumRuntime` gains `seed()`. The PGlite runtime: `db.exec(buildSeedSql())`; the Postgres runtime:
   `pool.query(buildSeedSql())` on the raw `pg` pool (several statements, no parameters — as today).
2. Both runtimes only open: no `migrate`, no seed, no `cache.init()` (moss calls it after its check; for the tiered
   cache it also loads memory). Both hand `tables: [...LYCEUM_SEQUENCES]`. The PGlite one writes `migrations: 'apply'`.
3. `bootOn`: `createServer` → `runtime.seed()` → `startTiming`. Every boot path (`pnpm dev`, `pnpm serve`, every
   check through `boot()`) seeds, after the tables. Nothing between `createServer` and the seed reads a seeded row
   (moderation, census, mirror and screens are lazy; identity resolves per request). If the seed or the timers
   throw, the server is closed before the error goes on — vite boots again on every edit.
4. `startTiming`: `createTideStore(runtime.pool, { migrate: false })`.
5. `nisc.config.ts` (and `@niscorp/cli` as a dependency; the config in `tsconfig.json`'s `include`): it loads `.env`
   as `serve.ts` does; `runtime` opens the Postgres runtime from `DATABASE_URL` (refuses when it is unset — there is
   nothing to migrate in memory); `app` is `buildLyceum` with the real features
   (`createIntegrations({ extension: seatsExtension })`) and identity and empty functions, reactions, inputs and
   seeds — what `nisc migrate` checks is the entries and the features; `boot` is the real `bootOn` on that runtime;
   `draw` throws: lyceum serves its own built terminal (`pnpm serve`), so `nisc build` / `nisc start` are not for it.
6. `docker-compose.yml`: the app's command becomes `sh -c "pnpm exec nisc migrate && pnpm serve"` — compose is
   lyceum's whole deployment on a server, so migrating is its deploy step; a restart finds nothing pending.
7. Railway: the service's pre-deploy command `pnpm exec nisc migrate` (a setting, by the owner), set **before** this
   change is deployed; TALK.md's "Deployment" records it.
8. `model-check` (already listed in TALK.md as not runnable) opens `devRuntime()` and seeds without a server: it
   migrates its in-memory database with strata first, so it is no worse than today.
9. **Before merging, one read on Railway's Postgres** (its console): `SELECT DISTINCT sequence FROM strata_ledger`.
   `nisc.moss.integrations` was on main from 2026-10-10 to 10-12 (bcec37f9, deleted by 0d94f432), and Railway
   deploys main, so the live ledger may record it. If it does, lyceum keeps that sequence in `runtime.tables` — its
   migration restored unchanged from that commit, so its checksum matches — and appends one that drops
   `integration_frame_grants`: the rule this change makes (a sequence that has run stays in the code). If it does not,
   nothing to do. Either way the pre-deploy command makes a refusal fail the deploy while the old version keeps
   serving, instead of taking the talk down.

Walked through:

- **`pnpm dev`, first load.** `openDevDatabase()` → `boot(db)` → the PGlite runtime opens → `createServer` applies
  `nisc.moss` 1–6, `nisc.moss.sessions/1`, `nisc.vex.cache` 1–2, `lyceum.app` 1–24, `nisc.moss.tide` 1–3 in one run →
  seed → timers (the tide store finds its tables). **Reload** (vite keeps the PGlite): `createServer` reads the ledger,
  nothing pending → seed re-syncs edited slides → timers.
- **Railway, the first deploy after this lands** (step 9 found only these five). The database already records all
  five sequences. Pre-deploy `nisc migrate`: opens the pool, no seed → nothing pending, entries fit, nothing removed →
  "nothing to migrate". `pnpm serve` → boot reads the ledger: every recorded sequence is named (moss's three,
  `lyceum.app`, tide's) → seed → timers.
- **Railway, a later deploy that appends `lyceum.app/25`.** Pre-deploy applies it, checks the entries, refuses a
  removal unless `--allow-removal` → `serve` → seed. Without the pre-deploy command: the boot refuses, naming
  `lyceum.app/25` and the two commands. So the command is set before the first deploy that adds a migration.
- **`docker compose up` on an empty volume.** `db` healthy → the app's command runs `nisc migrate`, which applies
  everything → `serve` → boot reads → seed. `pnpm mint speaker` finds the grant row once the app has started, as today.
- **`nisc migrate` on Railway** never seeds and never boots: `runtime` only opens the pool.

## Tests (behaviour only)

strata, on PGlite:
- verify as a role without CREATE rights (granted `SELECT` on the ledger): passes on a migrated database, refuses
  `PENDING` on an unmigrated one, creates nothing;
- apply with nothing pending sends only reads;
- `complete: true` refuses a ledger sequence not given; without it the same ledger passes;
- after a run the connection has no timeout left set.

moss: `migrateTables` refuses a removal without `allowRemoval` and applies it with; boot with nothing set refuses
`PENDING` with the two commands. Existing PGlite boots that rely on apply (about 12) write `migrations: 'apply'` — no
new boots. cli: `--status` on a fixture reads and changes nothing.

Not provable on PGlite (one connection; `statement_timeout`'s timer cannot fire there): that a step waiting on another
connection's lock gives up after the lock timeout, and that a second migrator waits for the first. Proven once by hand
on a real Postgres (embedded-postgres, outside the repo), and the run shown before release.

## Not in this release: steps outside a transaction

`CREATE INDEX CONCURRENTLY` and its kin cannot run inside a transaction, so strata cannot build an index on a large
table without blocking writes. Flyway, Atlas and Rails all allow it. The first design (a `transaction: false`
migration, run in pieces under a session lock) failed review on four counts, which a separate plan has to solve:

1. A run that fails partway keeps what landed. The old version's next restart then sees a ledger ahead of its code
   and refuses (`TOO_NEW`), so "a failed deploy keeps the old version serving" breaks. Flyway ignores applied
   migrations newer than the code by default, which is what makes rolling deploys and rollbacks work; strata refuses.
   Whether boot should accept a database ahead of its code (when the part it knows matches) is an owner decision,
   and it bears on every deploy, not only this feature.
2. A second migrator waiting for the advisory lock inside a transaction holds a snapshot; the concurrent index build
   waits for that snapshot while holding the lock the second migrator waits for. Postgres aborts one side, possibly
   leaving an invalid index. Waiting would have to poll `pg_try_advisory_lock` outside a transaction.
3. The concurrent build's waits for older transactions are lock waits, so a 10 s lock timeout fails it whenever an app
   transaction runs longer; these steps would need `lock_timeout = 0`.
4. Pieces on separate connections hang a `max: 1` pool and split across PgBouncer, and an error returns a connection
   still holding the lock and settings to the app's pool. Everything would have to run on one dedicated connection
   that is destroyed on error.

## Not doing

- A build-only mechanism: the CLI never sees the runtime (`boot` is the app's); with the flip a build changes no
  tables. Boot still writes rows (stored integration actions upgraded to the current grammar).
- `nisc dev --migrate`: a throwaway database is PGlite with `'apply'`.
- A committed checksum lock for app sequences: the ledger already refuses an edited migration; a lock cannot tell an
  unfinished migration from a finished one, and would refuse edits to ones never shipped.
- Retries on lock timeout, per-migration timeouts, down migrations, schema-drift detection.

## Cost

- Breaking for every app on a real Postgres: one pre-deploy command (Mira), a config and a deploy step (lyceum).
- `TOO_NEW` unchanged: an old instance that restarts after `nisc migrate` (mid-deploy), or a rollback to older code,
  refuses to boot — now every deploy meets it in the same place.
- Upgrading an old database past moss's own column drops needs `--allow-removal` once.
