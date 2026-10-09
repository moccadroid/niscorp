# @niscorp/loom

## 0.3.0

### Minor Changes

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

### Patch Changes

- 6512d91: Four additions to Prism, and its grammar is at version 3.
  - **`$toNumber`** — a number from a number or from numeric text, as a form, a CSV or an API often sends it: `{ "$toNumber": { "value": { "$ref": "$.price" } } }`. Text is read when it is a number written in digits (`"42"`, `"-3.5"`, `".5"`, `" 1e3 "`). Anything else — `""`, `"12 kg"`, `"1,234"`, `true`, `null` — throws `E_TYPE`, or answers `fallback` where one is given. No other op converts: `$add` on `"4"` is still an error.
  - **`$mod`** — the remainder of a division: `{ "$mod": [{ "$ref": "$.row" }, 2] }`. It takes the sign of the divisor, so with a positive divisor it is never negative (`[-1, 5]` is `4`, where JavaScript's `%` gives `-1`). Throws `E_DIVISION_BY_ZERO` for a zero divisor.
  - **`$round` takes `mode`** — `"floor"` rounds down and `"ceil"` up, at the same `digits`. Without it, it rounds to the nearest, as before.
  - **`$replace` takes `all`** — `all: true` replaces every occurrence. Without it, the first, as before. `search` is text, not a pattern.

  `MAPPING_OPS` includes `$mod` and `$toNumber`, and loom's Prism editor lists both under Math.

  **The grammar.** `nisc.prism` goes from 2 to 3 with one migration that rewrites nothing: these are additions, and a reader at 2 must refuse a config that uses them. The same entry records the narrowing made earlier in this release — a `$ref` path that is not keys and indexes is refused — which the JSON Schema does not show.

  **What to change:** an app that keeps Prism configs in its source moves its stamp: `npm run strata upgrade`, then `npm run strata verify`. There is nothing to edit; `strata.lock.json` goes to `nisc.prism 3`. A config written before parses to exactly what it did, so a compiled IR's fingerprint does not move.

- Updated dependencies [023bcf9]
- Updated dependencies [1db6df4]
- Updated dependencies [6d098e4]
- Updated dependencies [8b4d97e]
- Updated dependencies [f834f3f]
- Updated dependencies [b084e30]
- Updated dependencies [663d724]
- Updated dependencies [6512d91]
- Updated dependencies [7d682b9]
- Updated dependencies [d2e9d22]
- Updated dependencies [e0e8abc]
- Updated dependencies [7fe1135]
  - @niscorp/prism@0.3.0
  - @niscorp/nova@0.3.0
  - @niscorp/vex@0.3.0

## 0.2.2

### Patch Changes

- d5c9d58: README and DESIGN say what `_errors` and `validations` hold, and what the built-in select displays. They hold the messages a form shows, not the verdict on a document:
  - They are written after a change. A new document, or a stored one just opened, has an empty `validations` until its first edit.
  - A problem with no path is written nowhere: a `.refine()` on the whole object leaves `_errors` empty while the schema refuses the document. Given a `path`, its message lands at that field.
  - A message on a container is dropped when a field inside it has one too.
  - A field inside a list item or a recursive template binds no error slot: its message is in the tree and is not drawn at the field.

  To decide whether a document may be kept, parse it: `schema.safeParse(editor.documents.<name>)`.

  An enum with no `.default()` starts with no value in the document, and the built-in select displays its first option all the same; a `.default()` starts the two agreeing. The doc comment on `validations` says what it is, and tests hold each of these. No code changed.

  **What to change:** nothing. A host that enables Save when `validations` is empty is not asking whether the document is valid.

- fa3f038: README and DESIGN say what a form guarantees. It gives every field the schema describes a control; it does not validate, so a new document and a document mid-edit can fail the schema: parse it before you keep it. Edits go to the Nova runtime's data, not to the `action.data` that `toNova` returned. A new document starts from each field's empty value (`''`, `0`, `false`, `[]`, the schema's default where it has one, `null` for a kind Loom does not model; a required enum with no default is left out), and `toNova`'s `empty` and `includeOptional` options change that. A self-reference that is not inside an array, and every kind Loom does not model, gets a raw JSON box. No code changed.

  **What to change:** nothing.

- 659b81e: A document whose root is a list, a string, a number, a boolean or a tuple opens with its seed.

  `createLoomEditor.open` passed a document's seed on only when it was an object. A seed its schema accepts but that is not one — `['stalls', 'circle']` for `z.array(z.string())`, `42` for `z.number()`, a string for a union with a string branch — was dropped, and the default opened in its place. `<LoomEditor>` reports its documents on mount, so a host that saves on change wrote that default over the stored document before any edit. The Prism plugin reached it too: a config that is a literal or a list of nodes (`7`, `[{ $ref: '$.a' }, …]`) opened as `{ "$ref": "" }`.

  Such a seed is now what the editor opens with, reports, and draws.

  Nothing else moves. A seed the schema refuses for one of these documents still opens the default, as before; an object document, and what it does with a seed that is or is not an object, is untouched; and no exported type changed — `CompileOptions.value` is as it was.

  **What to change:** nothing.

- 3029c34: The kit's select writes the chosen option's own value, so an enum whose values are numbers can be set.

  `LoomSelect` wrote the `<select>`'s text. For `z.enum({ stalls: 1, circle: 2 })` the options are offered as `"1"` and `"2"`, and choosing one wrote the string `"2"` — which the schema refuses (`Invalid option: expected one of 1|2`), so a document that was valid became invalid by picking a listed option, and no choice in the list could make it valid again.

  It now writes the value of the option that was chosen: `2`. An enum of strings is written exactly as before, an enum of digit strings (`z.enum(['1', '2'])`) stays strings, and a mixed one (`{ a: 'x', b: 2 }`) writes each as it is.

  **What to change:** nothing.

## 0.2.1

### Patch Changes

- fe30458: Every package exports its `package.json`, so an app can say which version of a package it runs by reading it from the package:

  ```ts
  import prism from '@niscorp/prism/package.json' with { type: 'json' };
  prism.version; // the version that is installed, not the range that asked for it
  ```

  Until now the `exports` map hid it, and the only way to the version was a path into `node_modules`. `check:packages` installs the tarballs and reads every package's version this way.

  **What to change:** nothing. An app that read a version by path can read it by name.

## 0.2.0

### Minor Changes

- f1cec45: A Prism config that validates no longer names an op Prism does not have. `validate` accepted `{ card: { $fetch: … } }` and `{ $eval: "…" }`: the plain-object branch refused only the names of ops that exist, so any other `$` key passed as a template key. Such a config could be stored — an endpoint request, a vex mapping, a strata migration — and then failed every time it was evaluated (`E_NODE_SHAPE`, "Unsupported node shape").

  A key that starts with `$` is now an op's name and nothing else. The template branch refuses every `$` key — the rule the evaluator already held — so `validate` reports it with the key and where it is (`card.$fetch: Not a Prism op. A key that starts with "$" names an op; data with such a key goes in $const.`), and `evaluate` and `compile` fail with `E_SCHEMA` before anything runs. An op's name used as a template key keeps its own message. `E_NODE_SHAPE` is left for a tree that never went through the schema: an IR handed to `execute`. Adding an op no longer takes a key away from templates.
  - **prism** — the change, and a grammar narrowing: `nisc.prism` 2, a marker with no document step (a key that never evaluated has nothing to be rewritten to). `$` keys that are data are untouched: a `$const` payload, `$with` names, `$renameKeys` and `$fromEntries` keys. The JSON Schema's template key pattern is `^(?!\$)` instead of a list of every op.
  - **nova, vex, moss, loom, cli, nisc** — no change of their own. They depend on prism and are released with it, so the set installs together; the configs they hand to prism (endpoint `request` and `response`, `$prism` bindings, vex mappings) are held to the same rule.
  - **create-nisc** — the templates' sources are recorded at `nisc.prism` 2.

  **What to change:** in a config with a `$`-prefixed key that is not a Prism op, remove the key — or put the object in `$const` if it is literal data. An app that keeps a `strata.lock.json` runs `pnpm strata upgrade`, then `pnpm strata verify`; there is nothing to edit unless it has such a config. Everything else: nothing.

  BREAKING — approved by moccadroid, 2026-10-04: a config with a `$`-prefixed key that is not a Prism op no longer validates, compiles or evaluates — also where evaluation never reached the key (an untaken `$case` branch, a short-circuited `$or`, a `$map` body over an empty array), which used to work. A vex seed mapping with one fails when it is seeded, at boot, instead of on each replay. Code that matched `E_NODE_SHAPE` from `evaluate` gets `E_SCHEMA`. The `@niscorp` packages that depend on prism move with it, so an app moves them together (`@niscorp/nisc` 0.3.0).

### Patch Changes

- Updated dependencies [de6d980]
- Updated dependencies [f1cec45]
  - @niscorp/nova@0.2.0
  - @niscorp/prism@0.2.0
  - @niscorp/vex@0.2.0

## 0.1.1

### Patch Changes

- b67a125: Documentation only: each package's README, reference and design docs checked against its source and corrected — install lines and peers, signatures, defaults, status codes, licenses (loom, signal: Apache-2.0), and API that existed but was not documented.
