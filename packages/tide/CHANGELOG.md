# @niscorp/tide

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
