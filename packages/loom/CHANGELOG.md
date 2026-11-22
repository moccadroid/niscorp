# @niscorp/loom

## 0.6.0

### Minor Changes

- 17614f1: BREAKING — approved by moccadroid (owner), 2026-11-22: nothing unless a host relied on an emptied number box writing `null` for a number whose schema does not take `null`; the key is now absent (a host that saves on change stores it as missing).

  Emptying a number box leaves the number absent, so `z.number().optional()` accepts the document; it wrote `{"qty": null}`, which the schema refused. A number whose schema takes `null` (`.nullable()`) still gets `null`. `parse` marks such a field `nullable: true` (a new optional key on `FieldMeta`), `toNova` passes `nullable` and `integer` to `loom:number`, and the kit's number box steps by 1 for an integer and by any amount otherwise.

- 16ed5d1: BREAKING — approved by moccadroid (owner), 2026-11-22: nothing unless a host relied on the form of an object with a key that has a dot in it (`{ "a.b": string }`); its controls showed nothing and wrote `{ a: { b: … } }`.

  An object with a key that has a dot in it is edited as JSON. It compiles to the raw JSON box (`loom:raw`) bound where the object stands, so an edit writes the right keys; `createLoomEditor` wraps such a root document as it wraps a non-object root. `toNova` used directly at the root without `rootKey` keeps the old form, as there is nothing to bind the box to: pass `rootKey`.

- 92e5048: BREAKING — approved by moccadroid (owner), 2026-11-22: nothing unless a host relied on the built-in select displaying its first option for an enum with no value (a test that reads the select's value, say); documents do not change.

  A select whose value is none of its options shows a disabled "—" row, where it displayed the first option although the document had no value; choosing that first option then wrote nothing, as it was no change. Every real option is now a change and is written. The README note "A select has no row for "none"" is gone.

- 5ba5973: BREAKING — approved by moccadroid (owner), 2026-11-22: nothing unless a host relied on a `z.literal` field compiling to a raw JSON box that starts at `null`, or reads the `Field` model `parse` exports (a literal is now `{ kind: "enum", options, default }`, where it was `{ kind: "unknown" }`).

  A `z.literal` field is a select of its value (or values) and starts at the first. A plain `z.union` of literal-tagged objects used to start with `{ kind: null, radius: 0 }`, which no branch accepts; it now starts with `{ kind: "circle", radius: 0 }`.

- 4b55797: BREAKING — approved by moccadroid (owner), 2026-11-22: nothing unless a host relied on a newly chosen Prism op in the editor getting its optional arguments filled in, on `includeOptional: false` or `empty` being ignored inside union branches, or on the exact `loom:field` node of an optional field (it now has a `model` and an `optional: true` prop; a host kit that registers its own `loom:field` gets them and can ignore them).

  An optional field can be removed. Its `loom:field` wrapper is bound to the field's value and carries `optional: true`, and the kit's `LoomField` shows a Remove link beside the label while the field has a value; Remove writes the field back to absent, so `.optional()` accepts the document. The controls show as before, and typing into them adds the field again. `toNova`'s `includeOptional` and `empty` now apply inside union branches as well (`{ shape: { kind: "a" } }` with `includeOptional: false`, where it was `{ kind: "a", note: "" }`). In the Prism plugin a newly chosen op starts with its required arguments only — `$localeMoney`, `$localeDate` and `$round` start as `{}`, `$sortBy` as `{ as: "" }` — where it got `minorUnits: false, digits: 0`, `hour12: false, timeZone: ""` and the like, which changed what the op did; an optional argument that has a value shows a Remove link.

- 7692665: BREAKING — approved by moccadroid (owner), 2026-11-22: nothing unless a host relied on a union showing its first branch for a stored value no branch recognises, or reads the `Field` model `parse` exports and relied on a branch's `key` pattern naming an optional key where the branch also has a required unique one.

  A union shows the branch the value is, or shows the value as JSON. A stored value whose tag no branch has (`kind: "triangle"`) was labelled with the first branch, and editing wrote that branch's fields into it; with no fallback branch it now chooses none — the chooser shows "—" and the value is shown in the JSON editor until a branch is chosen. A structural union tells its branches apart by a key each requires, before an optional one, so `{ a: "x", t: "y" }` shows the second branch of `z.union([{ a: number, b?: number }, { a: string, note?: string, t: string }])`, not the first. A union of `z.lazy` branches is a union with a chooser, not a raw JSON box.

### Patch Changes

- 8d3d2c6: Compiling a schema no longer crashes on a field whose own code throws on a missing value (a `z.preprocess` that trims its input): such a field is required.

  A field named `toString` or `constructor` shows its validation message; the error tree read and wrote inherited names, so the message never appeared.

  `onChange` and the editor's `change` event fire once for an edit the validation answers, where they fired twice with the same values (once for the edit, once for the validation it wrote back). Every other write is one call, as before.

  The README says how to use `toNova` and `attachValidation` directly with a schema that has a top-level `_errors` field: compile it with `rootKey`, as the editor does.

  The kit and the reference plugins draw their colours from CSS variables (`--loom-border`, `--loom-danger` and 23 more, listed in the README), each falling back to the colour used today, so nothing looks different until a host sets one.

- e11c912: Renaming a key to a name another entry has (a prism template field, a vex aggregate or compute alias) no longer deletes the other entry: what was typed stays on screen with "… is already a key" under it, and the rename is written once the name no longer clashes; "Add" in the vex aggregate and compute widgets picks a free alias; a vex compute operand can be typed as a decimal ("1." stays on screen).

  The prism node chooser lists every prism op under a category, taken from prism's own example groups, so `$fill`, `$has`, `$walk`, the locale ops and others are no longer missing from it.

  Two recursive documents in one plugin each render their own nested levels: a recursive template is named after its action (`loom:tree:<action id>:<n>`) instead of `loom:tree:<n>`.

  A document with a top-level field named `_errors` keeps that field in the editor: it is no longer stripped, overwritten by the error tree and reported missing.

  A stored document whose root is not an object (a list, a scalar, a tuple, a union) opens as it was stored even when its schema refuses it, as an object document already did; validation flags it. It used to open the schema's defaults, which a host saving on change wrote over the stored document.

  `<LoomEditor>` calls the `onChange` of its latest render, not the one it mounted with.

  A field with two defaults starts at the one zod applies (`.default('a').default('b')` starts at `'b'`), and a discriminated union branch whose discriminator is an enum is tagged with the first value of that enum instead of `undefined`.

  `LoomEditorPlugin` is now written as `LoomPlugin` plus `components`, the same shape it had.

  A stored document opens on the branch of a discriminated union whose discriminator allows its value, when that discriminator is an enum (`kind: 'box'` for `z.enum(['square', 'box'])`); a tag `Pattern` lists every allowed value in a new optional `values`. The README says a key with a dot in it is not edited correctly, which needs a change in Nova.

- Updated dependencies [4b7d4a4]
- Updated dependencies [bf72478]
- Updated dependencies [e1db181]
- Updated dependencies [241bd4d]
- Updated dependencies [9f8e4b5]
- Updated dependencies [1b615d6]
- Updated dependencies [e7edd95]
- Updated dependencies [0a46ff6]
- Updated dependencies [59f314a]
- Updated dependencies [281108e]
- Updated dependencies [b233463]
- Updated dependencies [e2b9595]
- Updated dependencies [7aef6a7]
- Updated dependencies [79cf65c]
- Updated dependencies [e828562]
- Updated dependencies [6b01a50]
- Updated dependencies [6eef458]
- Updated dependencies [a41edf9]
- Updated dependencies [eb4ffb9]
- Updated dependencies [ae647e8]
- Updated dependencies [2effb54]
- Updated dependencies [bd996ea]
- Updated dependencies [180787b]
- Updated dependencies [d53910e]
- Updated dependencies [276f457]
- Updated dependencies [413afbd]
- Updated dependencies [1f6d37d]
- Updated dependencies [d77baf9]
- Updated dependencies [3f92c52]
- Updated dependencies [841c010]
- Updated dependencies [d93170b]
- Updated dependencies [8b4d6cd]
- Updated dependencies [4c6300e]
- Updated dependencies [be6e7af]
- Updated dependencies [b1e314e]
- Updated dependencies [d8dc7d9]
- Updated dependencies [b2b2d8d]
- Updated dependencies [f995714]
- Updated dependencies [df44b8e]
- Updated dependencies [a002748]
- Updated dependencies [2233113]
- Updated dependencies [04f5821]
  - @niscorp/nova@0.6.0
  - @niscorp/prism@0.4.0
  - @niscorp/vex@0.5.0

## 0.5.0

### Minor Changes

- 6a62604: `createDevtoolsFunctions` answers a list of `{ id, description, execute }`, and `FunctionDefinition` names that shape. **Breaking.**

  BREAKING — approved by moccadroid, 2026-10-18: `createDevtoolsFunctions(config)` returned a map of handlers by name; it returns `FunctionDefinition[]`, each with a description of what it does and what to send. An app that spread the map into its functions spreads the list into the list its `functions(session)` answers: `functions: (session) => [...createDevtoolsFunctions({ shell: () => session.shell, definitions }), ...]`.

### Patch Changes

- Updated dependencies [63b9ab5]
- Updated dependencies [6a62604]
  - @niscorp/nova@0.5.0

## 0.4.0

### Minor Changes

- c7c4f9b: A nova shell keeps actions and fragments in one registry. **Breaking.**

  BREAKING — approved by moccadroid, 2026-10-13: `shell.registerFragment` is gone, and an action and a fragment no longer share an id.
  - **`shell.registerAction(definition)` takes an action or a fragment**, told apart by the fragment's `kind: 'fragment'`, and **`shell.removeAction(id)` takes either out**. There was no call to take a fragment out. Taken out, a fragment is unknown to a later `with: [...]`; an instance that was opened with it keeps the definition it was composed into, and `back` skips a position that was opened with it, as it skips one it cannot put back.
  - **A fragment handed to `createShell` is validated**, as an action is: one that does not parse throws `DefinitionValidationError` at construction. Only `registerFragment` validated one before.
  - **An id names an action or a fragment, never both.** `createShell` and `registerAction` throw `DefinitionValidationError` for an id that is already the other kind's.
  - Opening a fragment by itself still throws `UnknownActionError`, and a `with: [...]` that names an action still throws `UnknownFragmentError`. `ShellConfig` keeps `actions` and `fragments`.
  - **Moss:** a fragment that is no longer answered for a principal is taken out of their open shell, as an action is. A boot, and a set of actions handed over, refuse an action under the id of a fragment a shell ships. On a session's own shell, `registerAction` (refused there as before) is the one call that would take a fragment.

  **What to change:** `shell.registerFragment(fragment)` becomes `shell.registerAction(fragment)`. Give an action and a fragment that share an id two ids.

- 4068f98: Vex keeps what an entry it writes was written from, and says who asks when it looks one up. **Breaking.**

  BREAKING — approved by moccadroid, 2026-10-14: a `mapToShape` an app writes answers `config`, the Prism config its `ir` was compiled from, beside `ir` and `transformed`. `createShapeMapper` does.
  - **A query vex writes keeps its mapping's Prism config** (`mapping`, on the entry), beside the compiled form. A compiled form can neither be read back as a config nor upgraded when Prism changes.
  - **The Postgres cache's table gets a `mapping` column**, in a new migration, `nisc.vex.cache/2`. A deployment that runs its migrations before it boots runs that one first.
  - **`CacheBackend.get(key, scope?)`**: the two lookups that replay an entry hand the cache the scope of whoever asks, so a cache can answer an entry to some callers and not to others. A backend that takes no scope works as before.
  - **`@niscorp/vex/migrations`** exports `VEX_SEQUENCE`, one stored kind, `nisc.vex/entry` (an entry as written, its `mapping` a `nisc.prism/config`), and `VEX_SCHEMAS`.

### Patch Changes

- Updated dependencies [c7c4f9b]
- Updated dependencies [4068f98]
  - @niscorp/nova@0.4.0
  - @niscorp/vex@0.4.0

## 0.3.1

### Patch Changes

- c8cbc05: The README and DESIGN.md state twenty-nine facts about the API that were written only in source comments.

  README: the compiler options `value`, `id`, `widgets`, `rootKey` and what an `empty` entry is; that `<LoomEditor>` reads `plugins` and `artifact` once; the `schema` option and the artifact shape of the prism, vex and nova plugins, and `layoutSchema`. DESIGN.md: how the array roles nest, the `recursive` mark, the `*` path segment of an array item, what a custom widget receives and `useModelWrite`, `mountView`, `editor.plugin`, `loom:column`, and the `PREVIEW` and `NODE` ids a plugin core exports.

  No behaviour changed.

  **What to change:** nothing.

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
