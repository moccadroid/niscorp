# @niscorp/tide

## 0.1.11

### Patch Changes

- 5b2538d: A load can leave out each bad reflex alone (`isolate`), a clock's zone is checked, and a timer in the hour a clock turns back fires when it was set to.
  - **`load(reflexes, { isolate: true })`** leaves out each reflex that would refuse the load — one that does not parse, a duplicate id, an unregistered effect, every reflex on an unguarded cycle, and one left watching the run of a reflex left out — and loads the rest. The report's new `refused` lists each, as `{ reflexId, code, message }`. Without `isolate` a load refuses whole, as before. It is for a host whose reflexes are its people's rows: in an app that keeps them that way, a member who wrote a reflex waking on every write to a table its own effect writes stopped every person's automations until the next boot, and the boot with it.
  - **A clock's `tz` is a zone `Intl` knows** (`TimeZoneSchema`), refused where the reflex is parsed. One it did not know was accepted, and then every `advance` and `nextDue` threw, for everybody: DOCS promised an advance does not crash because one reflex is broken. No document changes: a reflex with such a zone could never fire.
  - **`reflexSchemaOf({ triggers })`** parses a stored reflex with only the trigger kinds a host offers (`REFLEX_TRIGGERS`), as `draftSchemaOf` does for a draft. `reflexSchemaOf()` is `ReflexSchema`.
  - **`anchorDraft` keeps a timer in `UTC` where the host's local time would name another instant.** In the hour a clock turns back, the local time is shown twice and was read as its first pass: a ten-minute timer saved at 02:55 CEST in Vienna on the last Sunday of October fired an hour early — before it was saved, so in fact never. Everywhere else it is kept in the host's zone, as before.
  - `GraphReport`'s refusals name the `reflexIds` each is about (`GraphRefusal`).
  - `isolate` keeps one tenant's bad reflex from stopping another's only where the host owns the ids (a duplicate leaves out every reflex after the first) and one tenant's triggers never wake on another's writes (every reflex on an unguarded cycle is left out, whoever's it is).

  **What to change:** nothing. A host whose reflexes are its people's rows passes `isolate: true` and logs `refused`.

## 0.1.10

### Patch Changes

- 2fc1bf0: The docs name the identity seam `actor`, say a fact kind refuses only the other kinds' key fields, list everything load refuses and `graph()`'s `refusals`, and show `migrations/` in the file layout.

  **What to change:** nothing. Documentation only.

## 0.1.9

### Patch Changes

- 4e1a905: The reflex agent is shown the dates to look up instead of counting them, and a date it writes beside the wrong weekday is sent back.
  - **What it is told:** from the `now` it is handed (which must begin `YYYY-MM-DDTHH:MM`; otherwise it is told today is not known), today with its weekday, the coming days — today, the rest of this week, and the two weeks after it, a week running Monday to Sunday — and this month and the next.
  - **What a weekday means, as it is told:** a weekday on its own is the coming one (0.1.8 told it to ask about a weekday whose week is not said: it guessed a wrong day instead). Today's own weekday, and "next" before a weekday that could be this week's or next week's, are to be asked about, naming the dates as looked up. Nothing checks this: the check sees the agent's answer, not the request.
  - **What is checked:** it is told to write every date it drafts or asks about with its weekday ("Fri 2026-11-06"). A date its reasoning writes beside the wrong weekday is sent back in the same run, with the weekday it is and the two dates of the named weekday around it; so is a date that does not exist, as not a date. How the reasoning words a date is its own: a draft is never sent back for that (asking for the weekday beside every drafted date, measured, refused correct edits worded "Wed 4 Nov" until the run failed), so a date written some other way is not checked.
  - **Measured** with gpt-oss-120b at low reasoning, 8 runs each, today a Tuesday: "Friday at 14:30" was drafted on the coming Friday 8 of 8 times (before: once, besides a Wednesday and questions); "tomorrow at 9" 8 of 8, as before; "the last Friday of November" 6 of 8 (before: 2), once on Sunday the 29th, written as a Sunday, so nothing sent it back, and once answered `{ refused }`, which is a failure. "next Wednesday" was asked about 7 of 8 times and drafted next week's once (before: a Sunday or a Monday, never asked). "Tuesday at 17:00", said on a Tuesday, was drafted for today 7 of 8 times and next week's once, never asked: the line about today's weekday is kept as the decision it records, and is a known gap. A run took 1.05 model calls. In an app's set of automations asked by chat, 8 runs each: new ones 109 of 112 right ("Friday at 14:30" 8 of 8, from 0; "next Wednesday" asked 8 of 8, from wrong 8 of 8), and changes to one 61 of 64, run one at a time as before the change (60 of 64), none ended by the date check.

  **What to change:** nothing. The answer's shape is as before.

## 0.1.8

### Patch Changes

- 718cb95: Tide has a grammar, a weekly clock may name several weekdays, and the reflex agent asks about any date or time that could mean more than one moment and never asks what to call an automation.
  - **`@niscorp/tide/migrations`, a new entry point:** `TIDE_GRAMMAR`, the strata sequence `nisc.tide` with the documents `reflex` and `draft`, and `TIDE_SCHEMAS`. A host that keeps reflexes or drafts as documents keeps each with the grammar it was written at and upgrades it where it reads it. Version 1 is the weekday list below: it rewrites no stored document, and a reader at 0 refuses one that uses it.
  - **A weekly clock on several weekdays:** `on` takes a list of different weekdays — `{ every: 'week', on: ['mon','tue','wed','thu','fri'], at: '07:30', tz }` is every weekday. Each named day is its own occurrence, keyed by its local date, as every weekly occurrence is. A list on any other clock, an empty list and a day named twice are refused.
  - **Any date or time that could mean more than one moment is asked about, never guessed:** a day without its year, a time of day without morning or evening, a weekday whose week is not said. It was asked only about morning or evening.
  - **A draft's `id` is a name the agent makes up and never asks for,** its description now says: it asked the person "what short name should I use" in 2 of about 56 runs. A host may store the reflex under an id of its own, as before.
  - **31 is the last day of every month,** the `on` description now says; the agent refused "the last day of every month" as impossible.

  **What to change:** nothing.

- 718cb95: The Postgres store indexes `tide_run.as_who`. A host scopes its reads of the run ledger on that column, so every one of those reads filters on it; vex flagged the filter as unindexed. It is a new migration, the third of `TIDE_SEQUENCE` (`CREATE INDEX IF NOT EXISTS tide_run_as_who ON tide_run (as_who)`), applied where the store migrates its tables.

## 0.1.7

### Patch Changes

- 9b7ccbe: DOCS.md states nine facts about the API that were written only in source comments.

  They are: what `maxFanOut` counts and that a run over it is skipped; what a fact's `depth`, `deliveredAt` and `root` hold; what a task's `unit` and `claimedUntil` hold; what `appendIfAbsent` returns, that the store mints a missing `id`, and when a `UNIQUE_BY` key with `when` applies; and what `onePer` limits in a claim.

  One statement is corrected. DESIGN.md said a run's cause can be a run id or `manual:<who>`. A run's `cause` is `occurrence:<key>` or `fact:<id>`; who fired a reflex by hand is the manual fact's `by`. DOCS.md now lists the forms of a run's and a fact's `cause`.

  No behaviour changed.

  **What to change:** nothing.

## 0.1.6

### Patch Changes

- 7fb8322: Tide's Postgres store and its driver ship from tide. They were in `@niscorp/moss`.

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
  - Shown on PostgreSQL 18.4 with two pools claiming at once (300 rounds, and 150 rounds of four claims each): exactly one held every round, and two held in 299 of 300 with the lock taken out. No test in the repository holds this: PGlite has one connection, so two claimers never meet there.
  - `createTideStore` over a pool with no `transaction` now refuses a serial claim with the sentence `transact` already refused with. Such a pool could not run tide before: fan-out is a transaction.

  **A wait longer than a timer can hold no longer makes the driver a loop.**
  - The driver sleeps until the instant `nextDue` names, with one timer. Node keeps a timer's delay in 32 bits: one over 2^31 − 1 ms (24.8 days) is not refused, it is set to 1 ms, with a `TimeoutOverflowWarning`. A reflex whose next occurrence was further off than that had the driver wake every millisecond, advance, find nothing and ask again. Every wait is cut to 2^31 − 1 ms now: the driver wakes then, finds nothing, and waits out the rest.
  - The same for a `janitorMs` set that long, which beat every millisecond.

  **What to change:** nothing, for an app that did not take these from moss. One that did imports them from here: see the moss changeset.

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

- e9ad028: DOCS and DESIGN say what `catchUp: 'run'` does under `overlap: 'skip'`. Both are the defaults, and DOCS said `'run'` "fires every missed occurrence". It opens a run for each, and `overlap` is then asked of every one of them: occurrences missed together come due in one `advance` and are repeats of one another, so the oldest runs and each later one, the one that is on time included, is recorded `skipped` with an overlap note and a `run.skipped` event. The report's `skippedOccurrences` counts catch-up decisions and does not count those. `overlap: 'allow'` runs each missed occurrence (with `order: 'serial'`, one task at a time); `catchUp: 'latest'` runs only the newest. A test now holds this, and a source comment says it. No code changed.

  **What to change:** nothing. A clock reflex on the default policy that should run every occurrence it missed says `overlap: 'allow'`.

- 1dfab19: DOCS.md says which occurrence `preview()` shows and what `fired` means. For a clock reflex it is the most recent occurrence at or before `now` (a one-shot's own date, even when that is still ahead), whether or not the reflex was armed then or is enabled now, so an `advance` at the same `now` may create no run. `fired: false` means `when` did not match the fact passed in or the fan-out failed; `fired: true` does not say a run is due. No code changed.

  **What to change:** nothing.

## 0.1.3

### Patch Changes

- fe30458: Every package exports its `package.json`, so an app can say which version of a package it runs by reading it from the package:

  ```ts
  import prism from '@niscorp/prism/package.json' with { type: 'json' };
  prism.version; // the version that is installed, not the range that asked for it
  ```

  Until now the `exports` map hid it, and the only way to the version was a path into `node_modules`. `check:packages` installs the tarballs and reads every package's version this way.

  **What to change:** nothing. An app that read a version by path can read it by name.

- fc31d1d: The memory store keeps no key for a value that was never given. A row appended with `as: undefined` — every fact a host ingests — kept the key in `createMemoryStore()` and has none when it is read back from a database (moss's store). So a transform that looks at which keys a fact has saw two different facts: Prism's `$has`, `$keys` and `$entriesOf` answered differently over the two. And a transform that takes plain JSON (`prismTransform`) refused every fact-triggered reflex under the memory store, where a refused `when` is recorded as `fact.unmatched` and the reflex does not fire. A `cas` that sets `undefined` already removed the key; an append now does the same. `STORE_CONTRACT` is unchanged.

  The README's quick example type-checks under `strict`, and its install block covers what it imports. It passes `prismTransform` from `@niscorp/prism` as the transform (`evaluate(config, source)` did not compile: a `Row` is not a `JsonValue`), its preview no longer reads a field off an `unknown` input, and the install block adds `@niscorp/prism` and `@niscorp/strata`. DESIGN.md's plain-Node example follows.

  **What to change:** nothing in an app. A check that compares a memory-store row key for key against an object that spells out `undefined` values (`toStrictEqual`) leaves those keys out.

- 18626f8: `retry()` takes its task off the run's `failed` count whatever state the run is in.

  The count used to come down only together with the rewind from `settled` to `fanned`. So the second of two tasks retried before either ran again, or a task retried while its run was still going, was reopened with `failed` left one too high. Two things followed: a run of six that ended with every task `done` said `done 6, failed 1`; and a run counting a failure it no longer had reached its total one task early, settled, and minted its run fact with false counts while a task was still pending — a reflex on `{ fact: { run } }` fired on it.

  The count now comes down unconditionally, in the same transaction as the reopen; only the rewind waits for a settled run.

  **What to change:** nothing. A host that retried failed tasks one at a time, with an `advance` between, to keep the counts right can retry them together.

- d2f0357: A run settles when its last tasks land at the same moment.

  Recording an attempt read the run, decided whether it was complete, and then wrote the count. Two landings at once — two instances on one store, or two overlapping `advance` calls — each read the run before the other's count was in; neither settled it, and it stayed `fanned` with every task `done`. No run fact was minted, and a reflex with `overlap: 'skip'` recorded every later firing as skipped.

  The count is now written first and the run read after it, and the run is settled by a `cas` from `fanned`, so it settles once. Nothing in the store contract changes: it uses `cas` and `query` as they are.

  **What to change:** nothing.

## 0.1.2

### Patch Changes

- 80e1ee8: Documentation: the packages are live, and releases are compatible. `STYLE_GUIDE.md` gains "The packages are live" — a release does not break an app that works on the one before it; what should go is deprecated and stays; a breaking change is a last resort that needs the maintainer's approval before it is written — and `AGENTS.md` points every agent changing nisc itself to it. The status lines that said "pre-1.0, breaking changes expected" (nova), "API is pre-1.0 and moves" (moss) and "everything else may move" (tide) now say the same. moss's deprecated `installedIntegrations` is no longer described as scheduled for removal: it stays on the type. The style guide's Node floor is corrected to 22.12, what every package's `engines` already says. No code changes.

## 0.1.1

### Patch Changes

- 45d6731: `load` refuses under the code of what it found: `unknown_effect` for a reflex naming an unregistered effect, `unknown_reflex` for one watching the run of a reflex that is not there, `unguarded_cycle` for an unguarded cycle. Every refusal was reported as `unguarded_cycle`. `details.refusals` lists each reason with its code (`details.errors` is unchanged), and `GraphReport` carries the same list.
