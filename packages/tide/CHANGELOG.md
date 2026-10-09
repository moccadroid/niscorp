# @niscorp/tide

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
