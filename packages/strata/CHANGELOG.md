# @niscorp/strata

## 0.2.0

### Minor Changes

- 5c52ef5: BREAKING — approved by moccadroid (owner), 2026-11-22: nothing unless an app stores documents whose stamp has an entry, for a grammar it upgrades, that is not a number (`{ "acme.kit": "v0" }`), or keeps stamps in a column that is not jsonb. `upgrader.upgrade` and `upgrader.behind` now throw `INVALID_SEQUENCE` for such an entry, where `upgrade` returned the document unmigrated and stamped current; `upgradeStore` leaves such rows as they are and names them in a new `unread` list on its report, where it skipped them silently (jsonb) or ran every migration over them again (a `text` column).

  A stamp entry is read with `Number`, as the comparisons always read it, so digits in a string and `null` read as before. An entry for a grammar the upgrader was given that reads as no number is refused with `INVALID_SEQUENCE`, naming the grammar and the entry.

  `upgradeStore` still locks every row in one transaction, but reads only the keys and stamps under the lock, and then each behind row's document by its key, one at a time: a store whose rows are all current loads no document. A row it cannot read — a stamp that is neither null nor a JSON object, an entry for a given grammar that is no number, or a key the driver does not hand back exactly as stored (a `timestamptz` with microseconds) — is left as it is and named in `StoreReport.unread` (`id="e"`), present only when there is one; the pass goes on. `total` is still every row of the table.

- 66eb934: BREAKING — approved by moccadroid (owner), 2026-11-22: nothing unless an app runs `strata upgrade` with a `workDir` in which it keeps a `REPORT.md` or `plan.json` of its own (upgrade now exits 1 and leaves it, where it replaced and later deleted it), or relied on `strata verify` accepting a `plan.json` whose `from` differs from the committed `strata.lock.json` (it now refuses: plan again).

  In a `workDir` the host names, strata treats a `REPORT.md` as its own only when it begins with `# strata upgrade` (a byte-order mark aside), and a `plan.json` only when it has a plan's shape. Given one that is not, `upgrade` leaves it as it is and exits 1 with "… is not one strata wrote — it is left as it is. Move it, or give strata a workDir of its own.", and `upgrade` and `verify` never remove it. In the default `.strata/upgrade`, which is strata's own, its files are replaced as before.

  `verify` refuses a plan made from a lock other than the committed one, and so checks the untouched artifacts from the lock: an edited `plan.json` can no longer move the lock with the source never migrated. It compares stamps grammar by grammar, so grammars given in another order no longer refuse a valid plan. Two artifact ids that clean to one file name (`a/b`, `a_b`) each get an expected file of their own (`a_b.json`, `a_b~2.json`), where the second overwrote the first.

### Patch Changes

- 61b15e4: `prepare` refuses a sequence that is `null` with `INVALID_SEQUENCE`, as it refuses any sequence that does not parse, instead of throwing a `TypeError`.

  The README says that a line beginning with `--` is left out of a migration's checksum even inside a string literal or a dollar-quoted body, so an edit to such a line is not caught.

  The README lists what `INVALID_SEQUENCE` is raised for, and where.

  The README says that a statement Postgres will not run inside a transaction, such as `CREATE INDEX CONCURRENTLY`, always fails its run with `STEP_FAILED`.

- 7e8f6d4: `strata verify` fails, and leaves the lock where it is, when an edited artifact matches its migrated JSON but does not pass its kind's current schema.

  `strata upgrade` and `strata verify` remove only the files a plan wrote (`plan.json`, `REPORT.md`, `expected/`), and a directory only once it is empty: a `workDir` that is the project itself, or lies outside it, no longer has its contents deleted, and `verify` keeps anything else in `.strata`.

  The README says what to do when a migration renames the key a kind is embedded under: keep the old path in `embeds` beside the new one.

  `strata.lock.json` is refused (`INVALID_SEQUENCE`, as for a lock that is not an object) when a grammar's entry is not a whole number of migrations, written as a number or as digits: `"x"`, `""`, `-1`, `null`, `true` and `1.5` no longer pass as current or re-run migrations.

## 0.1.9

### Patch Changes

- 2a44642: The docs say a run with nothing pending ends at its first read only without a `guard` or `dryRun`, that a pool without `transaction` is refused for those too, and that moss's boot now checks its sequences rather than running them.

  **What to change:** nothing. Documentation only.

## 0.1.8

### Patch Changes

- 2780c56: `migrate` reads the ledger before it locks or creates anything. On a database with nothing pending a run is that read and nothing else — no lock, no `CREATE TABLE IF NOT EXISTS strata_ledger`, no transaction — so a database role without the right to change tables can check them. `mode: 'verify'` is always that read: it needs `SELECT` on the ledger and no `transaction` on the pool.

  A run sets its own timeouts for its transaction: `statementTimeoutMs` (default 3 600 000) bounds every step and the wait for another run; `lockTimeoutMs` (default 10 000) makes a step queued behind a busy table give up instead of queueing every later query on that table behind it. The pool's own `statement_timeout` no longer cuts a migration step, and is as it was after the run. A step that times out fails the run (`STEP_FAILED`), which is rolled back.

  `complete: true` (on `migrate`, `status` and `planMigrations`) says the sequences given are every sequence the ledger may record: a ledger sequence nobody names is refused, `UNKNOWN_SEQUENCE`. Without it nothing changes.

  A `guard` is told what the run applied: `guard(tx, { applied })`.

  **What to change:** nothing. A migration step that waits longer than 10 s for a lock now fails instead of waiting; pass `lockTimeoutMs` to wait longer.

## 0.1.7

### Patch Changes

- 2e73b96: The README states what its API tables left to source comments.

  It now gives the grammar of a sequence id and of a kind name, what `planMigrations` and `migrate` return, the refusals that had no name in the docs (`PENDING`, `STEP_FAILED`, `WRONG_OWNER` from `migrate`, `UNKNOWN_KIND`, a duplicate sequence id), what `upgrader.upgrade`, `upgrader.locate` and `upgradeStore` take and return, and rows for `refuseProblems` and `diffJson`.

  No behaviour changed.

  **What to change:** nothing.

## 0.1.6

### Patch Changes

- de2a757: DESIGN.md no longer reads as if moss's `initIntegrations` and `initSessions` were still there to call. Moss stopped exporting both (see the moss changeset): its integration tables are part of `MOSS_SEQUENCE`, and the sessions table is made where a deployment keeps moss's stored sessions (`session: 'sessions'`); `createServer` and `migrateTables` run both. The paragraph that names it is the record of what moved when strata landed, and it now says what has changed since. No code changed.

  **What to change:** nothing.

## 0.1.5

### Patch Changes

- f834f3f: `evaluate` checks a config object once and only evaluates it after that; `prismTransform` is gone. **Breaking.**

  BREAKING — approved by moccadroid, 2026-10-09: replace `prismTransform` with `evaluate` (`transform: evaluate`), and pass limits as `{ limits: … }`.

  Prism had three ways to run a config, and the one a host was told to hand to its seam (`prismTransform`) was the one that reported worst, while the hosts on a hot path each wrapped `evaluate`, which checked the config on every call. There are two now, with one job each.

  **`evaluate(config, source, options?)`** — for a config a program holds.
  - The first time it is handed a config object it checks it and keeps its tree; the second time it prepares the tree as `compile` would; from then on a call only evaluates. Four fields picked and renamed, the same config object again: 3.5 µs before, 0.4 µs now. A nested choice on two fields: 18 µs before, 0.7 µs now. A config that is a new object on every call costs what it did.
  - It is kept **by the object**: a config changed in place after its first call is not read again. Hand over a new object.
  - Both arguments are `unknown`, so it is what a host's transform seam takes: `createTide({ transform: evaluate })`, `createUpgrader(grammars, { transform: evaluate })`.
  - The third argument is `{ limits?, check? }`. Limits were the third argument themselves: `evaluate(config, source, { maxSteps: 100 })` is now `evaluate(config, source, { limits: { maxSteps: 100 } })`.
  - `check: 'always'` is for writing a config, for tests and for tools: nothing is kept, the config is checked on every call, and the source must be plain JSON (a source holding `undefined`, a function, a `Date` or a non-finite number is refused with `E_TYPE`).
  - An invalid config is a `PrismError` (`E_SCHEMA`) naming the part that is wrong, however deep the config. `prismTransform` threw zod's own error, and a `RangeError` for a config nested far past the limit.

  `evaluateSafe` takes the same arguments.

  **`compile` and `execute`** — for a config that is stored. Unchanged.

  **`prismTransform` is removed**, from `@niscorp/prism` and from `@niscorp/prism/migrations`. What it added over `evaluate` was a check that the source is plain JSON; that check is now `check: 'always'`, and a seam's source is taken as it is.

  **moss, nova, vex, loom, nisc, create-nisc and the cli move with it.** Each has Prism as a peer or a dependency, or has one of those that do, and a Prism at 0.3 is outside the range their last versions accept: an app takes them together. Nothing in vex, loom or the cli changed beyond that range.

  moss's shell and nova's `$prism` binding called `evaluate` on every use and so paid the check each time: an endpoint's request and response under moss, and a `$prism` value on each draw and for each row of a list, are 8 to 45 times faster for the configs measured. tide's and strata's documentation name `evaluate` where they named `prismTransform`.

  **What to change**
  - `import { prismTransform } from '@niscorp/prism'` or `'@niscorp/prism/migrations'` → `import { evaluate } from '@niscorp/prism'`, and `transform: prismTransform` → `transform: evaluate`. Every app made by `create-nisc` has this in `src/dev/strata.ts`; the app's typecheck and `npm run strata` both stop on that line until it is changed.
  - A third argument of limits becomes `{ limits: … }`.
  - A wrapper that parsed the config before calling `evaluate` (`evaluate(ConfigSchema.parse(config), …)`) makes a new object on every call and so is checked on every call: hand `evaluate` the config itself.
  - Code that changes a config object in place and evaluates it again must hand over a new object, or pass `{ check: 'always' }`.
  - A host that relied on `prismTransform` refusing a source that is not plain JSON checks it itself, or passes `{ check: 'always' }`.

## 0.1.4

### Patch Changes

- 7f8d202: Under `require`, the entry points of nova, prism and strata share one copy of their code, as they always have under `import`.

  The CommonJS build was not split, so every entry point carried its own copy of each class and of each React context. The ESM build is byte for byte what it was. Under `require`:
  - an error from `@niscorp/strata/postgres`, `/check`, `/upgrade` or `/node` is an `instanceof` the `StrataError` that `@niscorp/strata` exports; one from `prismTransform` of `@niscorp/prism/migrations` is an `instanceof PrismError`; one from `<Nova.Layout>` is an `instanceof NovaError` and of its own class. None of them was.
  - `upgradeStore` names the row it refused — `integration_actions (integration_id="…", action_id="…"): …`, with the upgrader's error as its `cause` — and so does a moss boot that meets a stored row it cannot read. Both gave the upgrader's sentence alone.
  - a kit registered from `@niscorp/nova/adapters/react/components` renders under `<Nova.Shell>`. It threw `useShell must be used inside <NovaShellProvider>`.

  **What to change:** nothing in an ESM app. A CommonJS app that had built on any of the above — a branch that ran because `instanceof` failed, a match on the whole text of an `upgradeStore` refusal — now sees what an ESM app sees. An app that loads both builds of one package in one process still has two copies of it.

- 2b5fd83: `migrate` takes a `guard` and a `dryRun`.

  A host could run a table migration and could not ask anything of the result before it landed, or see what a run would do without doing it.

  `guard(tx)` is asked inside the run's transaction, after the last pending step — when nothing was pending too. Every sentence it returns refuses the run with `DOES_NOT_FIT`, and nothing was applied. `dryRun` does all of it, guard included, then rolls it back: the report says what would be applied, and it takes the locks a real run takes.

  **What to change:** nothing. A run given neither behaves exactly as before. `StrataErrorCode` gains one member, `DOES_NOT_FIT`.

## 0.1.3

### Patch Changes

- 18182d7: README corrections. `sqlSteps` cuts at each line that ends in `;`, full-line `--` comments excepted. It is not a SQL parser: a `;` that ends a line inside a string, a function body, a `/* */` comment or a trailing `--` comment cuts there too, and two statements on one line, or a `;` followed by a trailing comment, stay one step. The `compareSnapshot` example shows the lines it prints (`- required["id"]`, `+ required["key"]`). No code changed.

  **What to change:** nothing.

- bd3184d: An upgrade keeps a document's stamp entries for grammars the upgrader was not given.

  `upgrade` handed back the upgrader's own stamp, and `upgradeStore` wrote it over the row's. A row stamped `{ "acme.forms": 0, "acme.prices": 1 }`, upgraded by code that was given `acme.forms` only, was written back stamped `{ "acme.forms": 1 }`: its record of `acme.prices` was gone. Code that has that grammar then read the row as never migrated and ran `acme.prices/1` over it a second time — a price already in cents, multiplied again.

  The stamp now handed back, and written, is the upgrader's own plus the document's entries for any grammar it was not given, as they were. Nothing new is refused, and nothing else is written differently: for a document whose stamp names only the upgrader's grammars, `upgrade` returns `upgrader.stamp` itself, as before. `upgrader.stamp`, `behind`, the lock file and every ledger checksum are untouched.

  `TOO_NEW` is, as it always was, about the grammars the code was given — a stamp entry for one it was not given is neither ahead nor behind. The README, DESIGN and rule 19 of `@niscorp/nisc`'s `AGENTS.md` said "on any grammar"; they now say "on any grammar the code was given".

  **What to change:** nothing.

- bab7b2c: `compareSnapshot` reads a tuple by position: swapped positions are a change.

  Every array in a schema was compared as a set — right for a union's members, a `required` list, an `enum` — and that included a tuple's `prefixItems`, where position is the grammar. `z.tuple([z.string(), z.number()])` changed to `z.tuple([z.number(), z.string()])` read as `{ status: 'same' }` while a document valid before (`["a", 1]`) was no longer valid, so the gate asked for no migration.

  A tuple's positions are now compared place by place: the swap above is `changed`, with `~ …prefixItems[0].type: "string" → "number"`, and a position added or removed is named (`+ …prefixItems[1]`). What sits inside a position is compared as before, a union there still as a set. A recorded snapshot is read as it was and none needs re-recording: nisc's own grammars, Prism's with its ten tuples among them, answer `same` as before.

  **What to change:** nothing, unless a grammar of yours had a tuple's positions reordered at a version that was already recorded. That was a change the gate missed; it now says so, and the answer is the migration the change owed — append it, then record the new version.

- eef9cd9: The `WRONG_OWNER` refusal from `createUpgrader` says what to do when the sequence is a grammar: declare its `documents`.

  strata tells a grammar from a table sequence by what the sequence declares: `documents`, or a document step. A kit that declares neither and has no migrations yet — or only empty markers, the migration an addition to a grammar is recorded with — reads as owning tables, and `createUpgrader` refuses it. The refusal named one way out, `migrate`, which for a kit is the wrong one: it records the kit's markers in a database's ledger.

  Which sequences are refused has not changed, and neither has how a sequence is read. The message has a second sentence:
  - before: ``Documents are upgraded by grammar sequences; these own tables and belong to a database's ledger (`migrate`).``
  - now: ``Documents are upgraded by grammar sequences; these own tables and belong to a database's ledger (`migrate`). If one of them is a grammar, declare its `documents` — a sequence with no `documents` and no document step is read as owning tables.``

  The README states the rule, and its kit example declares `documents: {}`.

  **What to change:** nothing in an app. Code or a stored expectation that compares this error's full message text needs the new text; `code` (`WRONG_OWNER`) and `details` are as they were.

## 0.1.2

### Patch Changes

- fe30458: Every package exports its `package.json`, so an app can say which version of a package it runs by reading it from the package:

  ```ts
  import prism from '@niscorp/prism/package.json' with { type: 'json' };
  prism.version; // the version that is installed, not the range that asked for it
  ```

  Until now the `exports` map hid it, and the only way to the version was a path into `node_modules`. `check:packages` installs the tarballs and reads every package's version this way.

  **What to change:** nothing. An app that read a version by path can read it by name.

- 1e6d55d: A pool's `query` and `transaction` are called on the pool, and a transaction's `query` on the transaction — never taken off the object first. A driver's own object has them as methods that need their receiver, and taken off they failed inside the driver, on a property nothing in nisc names:
  - **strata** — `migrate` and `upgradeStore` over a `PGlite` threw `Cannot read properties of undefined (reading '_checkReady')`; `status` and `readLedger` did too, once a ledger existed. A pool whose `transaction` hands a checked-out `pg` client through as the transaction failed in `migrate` the same way.
  - **moss** — `createTideStore` took `query` off the transaction. Over a pool that hands its client through, every transaction of the store failed inside the driver, and tide recorded the run as deferred: nothing threw, and the effect never ran.
  - **vex** — `createPostgresAdapter` with a read limit set (`limitReads`) threw on a pool whose `transaction` is a method.

  A `PGlite` now works as a pool as it is, and so does a `pg` wrapper that passes its client through. A pool built from closures (`createPglitePool`, a wrapper that builds its own `query`) behaves as before.

  **What to change:** nothing.

## 0.1.1

### Patch Changes

- b67a125: Documentation only: each package's README, reference and design docs checked against its source and corrected — install lines and peers, signatures, defaults, status codes, licenses (loom, signal: Apache-2.0), and API that existed but was not documented.
