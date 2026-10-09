---
'@niscorp/prism': minor
'@niscorp/moss': minor
'@niscorp/nova': minor
'@niscorp/vex': minor
'@niscorp/loom': minor
'@niscorp/nisc': minor
'@niscorp/cli': minor
'@niscorp/tide': patch
'@niscorp/strata': patch
---

`evaluate` checks a config object once and only evaluates it after that; `prismTransform` is gone. **Breaking.**

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
