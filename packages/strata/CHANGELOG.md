# @niscorp/strata

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
