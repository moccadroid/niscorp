# @niscorp/prism

## 0.4.0

### Minor Changes

- a41edf9: BREAKING — approved by moccadroid (owner), 2026-11-22: nothing unless an app compares stored fingerprints or `constantsFolded` of a config whose date or locale op has only written inputs, or relies on an IR compiled on one machine answering in that machine's zone when executed on another.

  `$date`, `$dateAdd`, `$dateDiff`, `$localeDate`, `$localeMoney` and `$localeNumber` are never worked out ahead of time, by `compile` or by a kept `evaluate`, even when every input is written in the config: they read the machine's clock zone or its `Intl` data. `{"$date":{"value":"2026-01-01T09:00:00Z","format":"HH:mm"}}` compiled in Vienna was stored as `{"$const":"10:00"}` and answered `10:00` from `execute` in Los Angeles, where `evaluate` answered `01:00`; the IR now keeps the op and answers `01:00` there. A `$localeDate` with a written `timeZone` is kept as an op too (main folded it); so are `$dateDiff` between bare dates, `$localeMoney` and `$localeNumber`, which do not read the zone but do read Intl data. They answer the same text, and each call spends one more step and one Intl format for each such op. On the machine that compiles, every answer is the same. The IR's `fingerprint` and `meta.stats.optimizations.constantsFolded` change for such configs; an IR stored before keeps its folded constant until it is compiled again. The exported `EvalContext` type gains an optional `folding?: boolean`, set while the optimizer works a subtree out ahead of time (additive).

- eb4ffb9: BREAKING — approved by moccadroid (owner), 2026-11-22: nothing unless a config near its `maxSteps` limit relied on passing from the second call; it is now refused on every call, as its first call already was.

  A part of a config that `evaluate` works out ahead of time from the second call (when the config object is kept and its tree prepared) spends the steps working it out took, each time it is evaluated. A `$join` of 600 written parts under `maxSteps: 500` was refused on the first call and passed from the second; it is now refused on every call. `compile` and `execute` are unchanged: a compiled IR counts such a part as one step.

- ae647e8: BREAKING — approved by moccadroid (owner), 2026-11-22: nothing unless a template contains `{{…}}` with a name in a script other than ASCII and relied on the braces staying in the text.

  `$interpolate` fills a placeholder whose name is letters, marks, digits and `_` in any script. `"Hallo {{straße}}"` with `{ straße: "A" }` gives `"Hallo A"`, and `""` in its place when `values` lacks the key, as an ASCII name always did; the braces used to stay in the text. A name with other characters (`{{first-name}}`, `{{ name }}`) is still left as written.

- 2effb54: BREAKING — approved by moccadroid (owner), 2026-11-22: nothing unless an app caught a `RangeError` or `TypeError` by its class from `$localeDate` or `$localeNumber`; such a config always failed, and now fails with a `PrismError`.

  `$localeDate` and `$localeNumber` options that pass the schema but that `Intl` refuses — `dateStyle` beside `weekday`, `minDigits` above `digits` — are a `PrismError` with code `E_SCHEMA`, the op and its place in the config ("$localeDate: Intl refused its options: …"), instead of a bare `TypeError` or `RangeError`. A zone or a locale `Intl` cannot read is still `E_TYPE`, as before.

- bd996ea: BREAKING — approved by moccadroid (owner), 2026-11-22: nothing unless a config handed `$localeMoney` or `$localeNumber` a list, a boolean, hex text or blank text as the amount (now `E_TYPE`), or relied on `$localeMoney` dividing by 100 for a locale `Intl` cannot read.

  `$localeMoney` takes the minor-unit divisor from the currency alone, so a locale tag `Intl` cannot read no longer changes the amount: 1500 JPY with locale `en_US` prints `JPY 1500` (was `JPY 15.00`). `$localeMoney` and `$localeNumber` read `value` as `$toNumber` reads text: a number, or digits with spaces around them (`" 1999 "`). `[1999]`, `true`, `"0x10"` and `"   "` are refused with `E_TYPE`; they used to print `19,99 €`, `0,01 €`, `0,16 €` and `0,00 €`.

- 180787b: BREAKING — approved by moccadroid (owner), 2026-11-22: nothing unless a config relied on an overflowing `$add`, `$sub`, `$mul`, `$div`, `$sum` or `$avg` giving `Infinity` (which JSON stores as `null`): it is now an `E_TYPE` error.

  `$add`, `$sub`, `$mul` and `$div` refuse an answer that is not a JSON number. `{ "$mul": [1e308, 10] }` and `{ "$div": [1, 5e-324] }` are `E_TYPE` ("$mul gave Infinity, which is not a JSON number."), where they returned `Infinity`. `$sum`and`$avg` run as `$add`, so a sum past what a number can be is refused the same way: "$add gave Infinity, which is not a JSON number. At $sum, in the $add that $sum runs as."

- d53910e: BREAKING — approved by moccadroid (owner), 2026-11-22: nothing unless a config runs `$min` or `$max` over about 111,000 items or more under the default `maxSteps`, or relies on a stored compiled fingerprint of a config that uses them: each item now costs 9 steps instead of 8, and the desugared form, so the fingerprint, changes once.

  `$min` and `$max` skip a `null` item wherever it is in the list. `[3, null, 1]` gave `E_TYPE` while `[null, 3, 1]` gave `1`; both now give `1`, and a list of nulls gives `null`. Every list that had an answer has the same answer.

- 276f457: BREAKING — approved by moccadroid (owner), 2026-11-22: nothing unless an app relied on the second and later calls of one config object losing a constant's `__proto__` key; they now answer as the first call does.

  A `$const` whose value has a key `__proto__` keeps it as an own key on every call of a config object that is run again. From the second call (when the config's tree is kept and its constants handed out as copies), the key used to be dropped and its value became the copy's prototype, so `out.admin` read `true` through it.

- 413afbd: BREAKING — approved by moccadroid (owner), 2026-11-22: nothing unless a `$replace` replacement contains `$$`, `$&`, `` $` ``, `$'` or `$<name>` and relied on JavaScript reading it as a pattern (writing `$$` to get `$`).

  `$replace` writes its `replacement` as given. `"US$$5"` writes `US$$5` (was `US$5`), and `"[$&]"` writes `[$&]` (was the matched text in brackets). DOCS already said `search` is plain text; the replacement now is too.

- 3f92c52: BREAKING — approved by moccadroid (owner), 2026-11-22: nothing unless a config relied on `$round` with `digits` above 0 giving the binary-product answer, or a stored number was rounded that way: the same input now rounds to a different number.

  `$round` rounds a number at its decimals as they are written, not at `value × 10^digits`. With `digits: 2`: `1.1` with `"ceil"` is `1.1` (was `1.11`), `4.35` with `"floor"` is `4.35` (was `4.34`), `1.005` to the nearest is `1.01` (was `1`), `0.285` is `0.29` (was `0.28`). More digits than a number has give the number (was `NaN` for `digits: 400`, or `1e300` at 10 digits). With `digits: 0` every answer is the same as before.

- 841c010: BREAKING — approved by moccadroid (owner), 2026-11-22: nothing unless a config cut or split text with emoji or other characters outside the Basic Multilingual Plane and relied on getting half a character (which Postgres jsonb refuses and a browser shows as �).

  `$slice`, `$take` and `$drop` never cut text between the two halves of one character: a cut there moves to the near side of it. `start` 0, `end` 5 of `"Hey 👍 there"` is `"Hey "` (was `"Hey \ud83d"`), and `$take 1` of `"👍"` is `""`. `$split` with `sep: ""` splits into characters: `"a👍"` → `["a", "👍"]` (was three items). Indexes stay UTF-16 units, so every result that was whole text is the same. `$length` still counts UTF-16 units, as zod does, and now says so.

- d93170b: BREAKING — approved by moccadroid (owner), 2026-11-22: nothing unless a config relied on `$update` turning a list or a scalar on its path into an object (also for digit text past the end of a list), or on `$has` answering `false` for digit text over a list.

  `$update` and `$has` read a path as `$get` does: a number, or digit text such as `"0"` on a list, is an index. `$update` at `["items", "0", "qty"]` over a list now updates the first item; it used to replace the list with `{"0": {"qty": …}}` and lose the other items. Digit text past the end of a list (`["items", "5"]` over `[1, 2]`) is `E_MISSING_PATH`, as a number index there always was; it used to give `{"items": {"5": …}}`. `$has` with that path answers `true` where the item exists. A key on a list (`"x"`, and `"01"`, which is not index text) or on a string, number or boolean is now `E_TYPE`; it used to replace that value with a new object. A missing key or `null` on the path is still created as an object.

### Patch Changes

- 1f6d37d: `$fill` is measured at every level it fills: nested slots that use one slot twice are refused with `E_BUDGET` at the string limit, instead of first building text hundreds of megabytes long.

  `__optional` leaves out a field whose `$get` runs into `null` or a missing key, as it already left out a `$ref` to a missing path. The error without `__optional` is unchanged (`E_TYPE`); it now carries `details.absent: true`.

  The `Intl` formatter caches of `$localeDate`, `$localeMoney` and `$localeNumber` keep up to 1,000 formatters each and are emptied when full, as the path cache is; they grew with every distinct locale a process saw.

  DOCS and `$walk`'s description say when a walk ends: `post` always ends; with `pre`, a walk whose every replacement again contains a node a rule matches runs until the budget stops it (`E_BUDGET`). They said it always ends.

  `$reduce`'s DOCS and the descriptions of `as` and `acc` say that when the two are one name, the body sees the accumulator, not the item.

- d77baf9: Prism reads and writes only the data's own keys: `$.constructor` on `{}` is a missing path instead of a JavaScript function, `$groupBy` groups under `constructor` or `toString` instead of throwing, and a key called `__proto__` in the data stays a key of the result in `$merge`, `$omit`, `$pick`, `$keyBy`, `$fromEntries` and `$renameKeys`.

  `$localeDate` and `$localeNumber` refuse a locale Intl does not read (`de_AT`) with a Prism type error (`E_TYPE`) instead of a bare `RangeError`.

  A source nested deeper than the call stack reaches is stopped with `E_BUDGET` instead of a bare `RangeError`.

  The cache of parsed `$ref` paths keeps at most 1,000 paths; it grew with every distinct path a process saw.

  A config still cannot carry a key called `__proto__`: validation drops it from a plain object, a `$const` payload, a `$with` binding or a `$renameKeys` map while `validate` answers ok. DOCS.md says so; data with such a key comes in through the source.

  With `check: 'always'`, a source that contains itself is refused as not JSON (`E_TYPE`, "source.self refers back to source").

- Updated dependencies [48138de]
- Updated dependencies [da3037e]
- Updated dependencies [e957628]
- Updated dependencies [c30562a]
- Updated dependencies [efd2368]
- Updated dependencies [ca26810]
- Updated dependencies [800a541]
- Updated dependencies [9c5367b]
- Updated dependencies [322f241]
- Updated dependencies [d85bab1]
- Updated dependencies [aeaf803]
- Updated dependencies [2b174f8]
- Updated dependencies [df79faf]
- Updated dependencies [133c0ee]
- Updated dependencies [543f79d]
- Updated dependencies [61b15e4]
- Updated dependencies [7e8f6d4]
- Updated dependencies [5c52ef5]
- Updated dependencies [66eb934]
  - @niscorp/cortex@0.2.0
  - @niscorp/signal@0.2.0
  - @niscorp/strata@0.2.0

## 0.3.4

### Patch Changes

- 686e9c7: **`$localeDate` takes its zone from the source, and Prism's grammar is at version 4.** `options.timeZone` is a node, as `value` and `locale` already were: `{ "timeZone": { "$ref": "$.zone" } }` words a date where its reader is, so one mapping serves every zone instead of one config per zone. A written zone works as before and is still folded at compile time; a config with a bound zone compiles to one fingerprint, and `execute` reads the zone from each source.

  A zone written in the program is still text or it is refused as the config is read, as before (`E_SCHEMA`, its message now naming both forms a zone may take); what is new is an op there that reads one. The JSON Schema (`getConfigJsonSchema`, a profile's) says only "a node" at `timeZone` and does not carry that rule, as it does not carry a `$ref` path's; `validate` and `compile` do. The form an error message shows for `$localeDate` reads `"timeZone"?: <node>`. A zone `Intl` does not know, written or read — or a bound one that is not text, `null` included — is refused with `E_TYPE` at `$localeDate.options.timeZone`, saying what it got. An unknown written zone used to escape as a bare `RangeError` from `Intl`; it is now a `PrismError`, which is still an `Error`. The zone is looked at after the date, so a bad date is still `E_DATE_INVALID` whatever the zone, and a written zone spends no step of the budget, as before.

  **A locale tag `Intl` cannot read is refused the same way.** `$localeDate` and `$localeNumber` refuse text `Intl` cannot read as a locale tag (`"en_GB"`), written or read, with `E_TYPE` at `locale`, where it escaped as a bare `RangeError`. It is looked at after the date, so a bad date is still `E_DATE_INVALID`; where both the zone and the locale are bad, the zone is refused first. A well-formed tag `Intl` has no data for is read as before. `$localeMoney` is unchanged: it still prints the code beside the amount for a locale it cannot read, with a divisor of 100 whatever the currency, which DOCS.md now says.

  **The grammar.** `nisc.prism` goes from 3 to 4 with one migration that rewrites nothing: this is an addition, and a reader at 3 must refuse a config with a bound zone.

  **What to change:** an app that keeps Prism configs in its source moves its stamp: `npm run strata upgrade`, then `npm run strata verify`. There is nothing to edit; `strata.lock.json` goes to `nisc.prism 4`. A config written before parses to exactly what it did, so a compiled IR's fingerprint does not move. An app made by `create-nisc` from this release starts at `nisc.prism 4`.

## 0.3.3

### Patch Changes

- e4dfb25: The docs give the op count (75; 78 union members), say `$mod` also throws `E_DIVISION_BY_ZERO`, that only the binary math ops take a pair, that compiled IR does not use the path cache, and list `ops/scope.ts` and `examples/`.

  **What to change:** nothing. Documentation only.

## 0.3.2

### Patch Changes

- 7bcf306: An error says what the op got, where in the program, and the op's form, in its message. The message is what a caller passes on to a program's author, often a model that sees nothing else, and it said too little to fix anything: `Expected string for $trim`, `Path not found`, `Invalid config`.
  - **A wrong type** names the value and where: `$trim needs text, but got an object: {"value":"Quarterly contributor outreach"}. … At $map.body.title.$trim. Form: {"$trim": <node>}`. Where the field was written as an object without a `$` key, it says such an object builds an object. The form is printed from the schema.
  - **A path that found nothing** says where it stopped and what is there: `$ref "$.rows.name" stopped at "name": the value at $.rows is a list of 1 item: […], and a list is read by index, a number`. A missing key lists the keys there; a `$var` that is not there lists the variables in scope.
  - **Inside a sugar op** the position is the author's: `At s.$sum, in the $add that $sum runs as.`
  - **A refused config** puts its issues in `evaluate`'s message, as `compile` did, each with the form of the op it is on: `Invalid config: x: Unrecognized key: "fallback". Form: {"$trim": <node>}`. `validate`'s issue messages carry the same form.
  - **An object whose only key names an op is checked as that op alone.** A reader of `ConfigSchema`'s issues that picks among a union's branches, as cortex's `flattenSchemaIssues` does, now gets the op's own issues (`$map/over: Unrecognized keys: "as", "body"`) instead of `$map: Invalid key in record`, and an op name that does not exist reads `Not a Prism op…`. Which configs are accepted is unchanged.
  - The budget says where evaluation stopped; `E_NODE_SHAPE` puts the node in its message; `check: 'always'` names the first value of a source that is not plain JSON (`source.d is a Date`).

  Codes, `PrismError`, `.context` (`op`, `path`, `details`) and every export are unchanged. `$assert`'s message is the program's own and is unchanged.

  **What to change:** nothing. Code that compared a message's exact text gets the new text.

- ee625f7: `$get` reads a path segment of digits as an index when the value there is a list: `["link", "0"]` reads the first item of `link`, as `["link", 0]` does, and as JavaScript and JSON Pointer read it. Only digits count: `"01"`, `"-1"` and `" 0"` stay keys, and a key asked of a list is refused as before (`E_TYPE`, or the fallback).

  Before, `"0"` on a list was a key, which a list does not have: without a `fallback` it threw `E_TYPE`, and with one it answered the fallback for every item, which is easy to miss. A model writing a mapping wrote `["link", "0"]` with a `null` fallback and got `null` for all twelve records; lyra's people roll reads its page cursor with `["0", field]` and has answered `""` every time.

  **What to change:** nothing. A config that used a digit key on a list and relied on getting its fallback now gets the item.

- ef23b8e: `$join`, `$interpolate`, `$keyBy` and `$groupBy` refuse an object or a list where they need text, with `E_TYPE` and a message that says which item or key and what it was. They turned it into text with `String()`: an object became `"[object Object]"` and a list its items joined by commas, and nothing said so.
  - `$join`: a part that is an object or a list (`$join.parts needs items that are text, a number, true, false or null, but item 1 is an object: {"a":1}.`). `null` is still `""`.
  - `$interpolate`: a value for a `{{key}}` in the template that is an object or a list. A value the template does not use is not looked at, and a missing one is still `""`.
  - `$keyBy` and `$groupBy`: a key that is an object or a list. Text, numbers, `true`, `false` and `null` are keys as before.

  **What to change:** a config that joined or interpolated an object or a list, or grouped by one, now fails instead of answering `"[object Object]"` or `"a,b"`. Pick the field you meant (`$get`), or join the list first (`$join`).

## 0.3.1

### Patch Changes

- f55fcbe: DOCS.md and the README state seven facts about the API that were written only in source comments.

  DOCS.md: a negative index in a `$ref` path is refused, the generated JSON Schema does not carry the `$ref` path rule, and `maxValues` counts a value each time it appears. README: an example's `id` is unique and in kebab-case, an example of several operators has no `op`, which ops `MAPPING_OPS` leaves out, and that the mapping agent's `data` is the config itself.

  No behaviour changed.

  **What to change:** nothing.

- 89adcc3: The optimizer no longer keeps a local `isPlainObject` that only called `isJsonObject`; its three uses call `isJsonObject`. Prism's own `isPlainObject` means an object with no `$` key, and the local one of the same name meant any JSON object. No behaviour changed.

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

- 023bcf9: `compile` no longer reads a `$with` binding or a `$renameKeys` key that is named like an op as that op.

  A `$with` binding and a `$renameKeys` map are keyed by names, and a name may start with `$`. The optimizer walked those records as nodes, so where a name was an op's, `execute` did not answer as `evaluate` does:

  ```ts
  { $with: { let: { $upper: 'x' }, value: { $var: '$upper' } } }
  // evaluate: 'x'. execute: "Variable not found: $upper" — the binding had been folded to { $const: 'X' }.

  { $with: { let: { $ref: 2 }, value: { $var: '$ref' } } }
  // evaluate: 2. compile threw TypeError: path.startsWith is not a function.

  { $renameKeys: { from: { $ref: '$' }, map: { $upper: 'x' } } }   // over { $upper: 1 }
  // evaluate: { x: 1 }. execute: { $upper: 1 } — the key was not renamed.
  ```

  `execute` now answers all three as `evaluate` does, from a fresh IR and from one read back from storage. A config with no such name compiles to the same core and the same fingerprint as before. One with such a name compiles to a different core, so its fingerprint changes.

  **What to change:** nothing. An IR compiled earlier from such a config and stored keeps its wrong answer until it is compiled again.

- 1db6df4: A plain object template is recognised before the ops are tried, not after: `execute` and `evaluate` are up to four times faster on configs that are templates.

  A template such as `{ id: { $ref: '$.id' }, name: … }` is not an op, so the compiler attaches no handler to it, and the evaluator reached it only after asking about sixty times whether it was some op. It did that on every evaluation, in a compiled tree too, and once for each row where the template is the body of a `$map`. A template has no `$` key and every op needs one, so asking for the template first changes no answer.

  Measured, Node 24, one order unless said:

  |                                              | before  | now     |
  | -------------------------------------------- | ------- | ------- |
  | `execute`, four fields picked and renamed    | 1.32 µs | 0.31 µs |
  | `execute`, a nested shape with mapped lines  | 7.63 µs | 1.77 µs |
  | `execute`, three strings built               | 3.24 µs | 1.20 µs |
  | `evaluate`, four fields                      | 4.15 µs | 3.17 µs |
  | `execute`, a total for each of 10,000 orders | 30.4 ms | 19.8 ms |

  A config whose time is in sorting, filtering or summing is as fast as it was.

  **What to change:** nothing.

- 6d098e4: `execute` hands out a compiled config's constants frozen.

  Every `execute` of an IR answers with the IR's own constants — a `$const` list or object, and anything the compiler folded because it did not depend on the source. A caller that wrote to one changed the IR, and so every later answer:

  ```ts
  const ir = await compile({ tags: { $coalesce: [{ $ref: '$.tags' }, { $const: [] }] } });
  const first = execute(ir, { tags: null });
  first.tags.push('x');
  execute(ir, { tags: null }); // { tags: ['x'] } — for the next caller too, whoever it was
  ```

  Where an IR is kept and its answers go to different requests, as vex does with a query's mapping, that carried one request's change into the next. The constants are now frozen all the way down when a config is compiled, and again when an IR read back from storage first runs. `first.tags.push('x')` throws a `TypeError` where it is written.

  `evaluate` is as it was: what it answers may be changed. So may everything `execute` builds for the call — a template's object, a `$map`'s list.

  **What to change:** code that writes into an answer of `execute` (or of a vex read whose mapping has a constant list or object) now throws at that line, where it used to change later answers. Copy the part before changing it: `[...answer.tags, x]`.

- 8b4d97e: `$eq` and `$neq` no longer write both values out as JSON to compare two scalars.

  Two values are equal when their JSON text is, and Prism compared that text for every pair, `'paid'` against `'paid'` included. The text is now only made for two different objects or arrays: the same value is equal, and a scalar is equal to nothing but itself. Every pair is answered as before, keys in another order included.

  A filter on two fields over 10,000 rows, then a sort and a take: 3.7 ms before, 2.2 ms now. A rule of three comparisons on one row: 361 ns before, 207 ns now.

  **What to change:** nothing.

- b084e30: `$sortBy` gives every key a place: an item whose key is `null`, a boolean, or a string among numbers is no longer left wherever the sort happened to put it.

  `$sortBy` compared numbers with numbers and strings with strings. Any other pair of keys compared as equal, and an item that is equal to everything has no place in an order: where it ended up depended on which items it was compared with, so the same rows in another order came out differently.

  Now, where the keys are of more than one kind: numbers first, then strings, then `false` and `true`, and `dir: "desc"` turns that around. An item whose key is `null` is last in both directions. Items with equal keys keep the order they came in.

  A list whose keys are all numbers, or all strings, sorts exactly as it did.

  **What to change:** nothing. A list that was sorted by a key that is sometimes `null` now has those items at the end.

- 663d724: Three things `execute` did on every call, or for every node, that it did not need to.
  - An op's handler in a compiled tree was a function around the op, so every node was two calls. It is the op.
  - A template built a set of its optional field names and caught errors for each field, whether or not it had a `__optional`. One without it, which is nearly every template, now just evaluates its fields.
  - `execute` primed the path cache from the IR's path table on every call. It does so once for each IR, when it restores the IR's annotations.

  Four fields picked and renamed: 305 ns before, 232 ns now. A nested shape with mapped lines: 1.56 µs and 1.29 µs. A total for each of 10,000 orders: 13.4 ms and 12.6 ms. Answers are as they were.

  **What to change:** nothing.

- 6512d91: Four additions to Prism, and its grammar is at version 3.
  - **`$toNumber`** — a number from a number or from numeric text, as a form, a CSV or an API often sends it: `{ "$toNumber": { "value": { "$ref": "$.price" } } }`. Text is read when it is a number written in digits (`"42"`, `"-3.5"`, `".5"`, `" 1e3 "`). Anything else — `""`, `"12 kg"`, `"1,234"`, `true`, `null` — throws `E_TYPE`, or answers `fallback` where one is given. No other op converts: `$add` on `"4"` is still an error.
  - **`$mod`** — the remainder of a division: `{ "$mod": [{ "$ref": "$.row" }, 2] }`. It takes the sign of the divisor, so with a positive divisor it is never negative (`[-1, 5]` is `4`, where JavaScript's `%` gives `-1`). Throws `E_DIVISION_BY_ZERO` for a zero divisor.
  - **`$round` takes `mode`** — `"floor"` rounds down and `"ceil"` up, at the same `digits`. Without it, it rounds to the nearest, as before.
  - **`$replace` takes `all`** — `all: true` replaces every occurrence. Without it, the first, as before. `search` is text, not a pattern.

  `MAPPING_OPS` includes `$mod` and `$toNumber`, and loom's Prism editor lists both under Math.

  **The grammar.** `nisc.prism` goes from 2 to 3 with one migration that rewrites nothing: these are additions, and a reader at 2 must refuse a config that uses them. The same entry records the narrowing made earlier in this release — a `$ref` path that is not keys and indexes is refused — which the JSON Schema does not show.

  **What to change:** an app that keeps Prism configs in its source moves its stamp: `npm run strata upgrade`, then `npm run strata verify`. There is nothing to edit; `strata.lock.json` goes to `nisc.prism 3`. A config written before parses to exactly what it did, so a compiled IR's fingerprint does not move.

- 7d682b9: A valid config is checked in microseconds: the node schema tries the one member a value can be before it walks its union.

  `NodeSchema` is a union of 76 members that zod tries in order, and a plain object is the last. Each plain object in a config cost about a quarter of a millisecond to accept, so `evaluate`, `validate` and `compile` each spent about half a millisecond on a config of three operators before doing anything. A value's keys decide what it can be: one `$` key and nothing else is that op, no `$` key is a template. That member is now tried first.

  On a config of three operators (Node 24, zod 4.6.5; the same on zod 4.2.0):

  |                          | before | now    |
  | ------------------------ | ------ | ------ |
  | `ConfigSchema.safeParse` | 505 µs | 1.9 µs |
  | `evaluate`               | 517 µs | 5.7 µs |
  | `compile`                | 652 µs | 79 µs  |

  A config that is refused is then walked as before, so what is refused, and every issue and path of the refusal, is unchanged; a refusal takes a few percent longer than it did (1.27 ms to 1.30–1.38 ms for one small refused config). `getConfigJsonSchema`, `getNodeJsonSchema` and `getProfileJsonSchema` return what they returned, and `NodeSchema` is still a zod union. `safeParseAsync` takes the walk alone and is as fast as it was.

  The README, DOCS.md and DESIGN.md no longer say `execute` is "2-5x faster" than `evaluate`: it was 6 to 960 times before this change and is 1.7 to 65 times after it, by config.

  **What to change:** nothing.

- d2e9d22: `$map`, `$filter`, `$reduce`, `$sortBy`, `$groupBy` and `$keyBy` make one scope for the loop, not one for each item.

  Each of them built a new context and a new set of variables for every item, to set the loop's variable. They now make that once, as the loop's own copy, and set the variable in it for each item. What a body sees, and what is outside the loop, is as before: a variable of the same name outside is what it was when the loop is done, and a loop inside the body has a scope of its own.

  Over 10,000 orders: a total for each, 20.3 ms before and 13.4 ms now; filter, sort and take ten, 2.2 ms and 1.2 ms; a count and a sum by country, 3.6 ms and 2.1 ms; a count, a revenue and twenty rows, 15.6 ms and 9.6 ms.

  **What to change:** nothing.

- e0e8abc: A `$const` is returned as it is written, also where its data has a key named like a sugar op.

  Before a config runs, the sugar ops (`$sum`, `$avg`, `$count`, `$min`, `$max`, `$pluck`, `$take`, `$drop`, `$match`, `$flatMap`) are rewritten to core ops. That pass walked every object, so it also rewrote what is not a node:

  ```ts
  { $const: { total: { $sum: 1 } } }
  // answered { total: { $reduce: { … } } }, from evaluate and from execute alike

  { $with: { let: { $sum: [1, 2] }, value: { $var: '$sum' } } }
  // "Variable not found: __acc" — the binding called $sum was rewritten as a sum

  { $renameKeys: { from: { $ref: '$' }, map: { $count: 'n' } } }   // over { $count: 1 }
  // { $count: 1 } — not renamed
  ```

  A `$const`'s data, the names of a `$with`'s bindings and a `$renameKeys` map are now left alone; the three answer `{ total: { $sum: 1 } }`, `[1, 2]` and `{ n: 1 }`. Data that holds MongoDB-style operators, or a Prism config kept as data (as a strata migration writes one into a document), comes back as it was written.

  A config with none of these compiles to the core and fingerprint it had. One that has them compiles differently, so its fingerprint changes.

  **What to change:** nothing. An IR compiled earlier from such a config keeps its wrong constant until it is compiled again.

- 7fe1135: Two things Prism answered wrongly without a word are now refused.

  **A path it does not read.** A `$ref` path is keys and indexes, as DOCS.md says: `$.rows[0].sku`. The rest of JSONPath — a wildcard `[*]`, a filter `[?(…)]`, a slice `[0:2]`, a negative index, a quoted key `['name']`, empty brackets, `..` — was accepted by the schema, and the parser gave up on it with no segments, which reads as `$`. So `{ "$ref": "$.rows[*].sku" }` answered the whole source, and `$..sku` was read as `$.sku`. Such a path is now refused when the config is checked: `validate`, `evaluate` and `compile` give `E_SCHEMA` at the `$ref`, "Not a path Prism reads: … A path is keys and indexes only …; for every item of a list use $map or $pluck." An IR that already holds one is refused when it runs.

  **A sort key that is a list or an object.** `$sortBy` compares numbers and strings. For any other key it compared nothing, so `by: [a, b]` handed the list back in the order it came. It now throws `E_TYPE` and says what to write: sort by the second key, then by the first; the sort keeps the order of equal items.

  `getConfigJsonSchema` and the grammar snapshot are unchanged: the path rule is the parser's, beside the published pattern, not in it.

  **What to change:** a config with such a path or such a key was already answering wrongly; it now says so. Write the path with `$map` or `$pluck`, and the two-key sort as two sorts. Nothing in this repository, nisc-website, moccadroid-website or midas had one. Still as it was: a sort key that is `null`, a boolean, or a number beside a string compares as equal to everything, so such items keep no defined place.

## 0.2.2

### Patch Changes

- 7f8d202: Under `require`, the entry points of nova, prism and strata share one copy of their code, as they always have under `import`.

  The CommonJS build was not split, so every entry point carried its own copy of each class and of each React context. The ESM build is byte for byte what it was. Under `require`:
  - an error from `@niscorp/strata/postgres`, `/check`, `/upgrade` or `/node` is an `instanceof` the `StrataError` that `@niscorp/strata` exports; one from `prismTransform` of `@niscorp/prism/migrations` is an `instanceof PrismError`; one from `<Nova.Layout>` is an `instanceof NovaError` and of its own class. None of them was.
  - `upgradeStore` names the row it refused — `integration_actions (integration_id="…", action_id="…"): …`, with the upgrader's error as its `cause` — and so does a moss boot that meets a stored row it cannot read. Both gave the upgrader's sentence alone.
  - a kit registered from `@niscorp/nova/adapters/react/components` renders under `<Nova.Shell>`. It threw `useShell must be used inside <NovaShellProvider>`.

  **What to change:** nothing in an ESM app. A CommonJS app that had built on any of the above — a branch that ran because `instanceof` failed, a match on the whole text of an `upgradeStore` refusal — now sees what an ESM app sees. An app that loads both builds of one package in one process still has two copies of it.

## 0.2.1

### Patch Changes

- fe30458: Every package exports its `package.json`, so an app can say which version of a package it runs by reading it from the package:

  ```ts
  import prism from '@niscorp/prism/package.json' with { type: 'json' };
  prism.version; // the version that is installed, not the range that asked for it
  ```

  Until now the `exports` map hid it, and the only way to the version was a path into `node_modules`. `check:packages` installs the tarballs and reads every package's version this way.

  **What to change:** nothing. An app that read a version by path can read it by name.

- 259a6f7: `@niscorp/prism/examples` — the reference as data. `PRISM_EXAMPLES` is 82 examples (`{ id, group, title, description, op?, source, config, expected }`): one for each of the 73 operators, named by the operator, then nine configs of several operators working together. `PRISM_EXAMPLE_GROUPS` names the groups they come in — the reference's own (Core, Arrays, Math, …), in its order. The package's tests evaluate each example against its `expected`, and fail when an operator has no example of its own or has two, so whatever shows them shows what the installed version does. `OP_KEYS`, the grammar's operator names in its own order, is now exported from the main entry. STYLE_GUIDE.md gains "Examples": a change to what a package does changes its examples in the same commit.
- f801cc9: `prismTransform` is exported from the main entry: Prism in the shape a host's transform seam takes, `(config: unknown, source: unknown) => unknown` — what nova's shell, tide's engine and strata's upgrader are handed.

  ```ts
  import { prismTransform } from '@niscorp/prism';

  createTide({ store, transform: prismTransform, effects });
  ```

  `evaluate` is typed for a `JsonValue` source, so a host could not hand it to a seam without a cast, a JSON round trip or a parse of its own. `prismTransform` parses the config against `ConfigSchema` and refuses a source that is not plain JSON. It is the function `@niscorp/prism/migrations` has exported all along, and that export stays. Its refusal now reads `The source of a transform must be plain JSON.`; it said `A document to migrate must be plain JSON.`

  **What to change:** nothing. A host that wrote the join itself can pass `prismTransform` instead.

## 0.2.0

### Minor Changes

- f1cec45: A Prism config that validates no longer names an op Prism does not have. `validate` accepted `{ card: { $fetch: … } }` and `{ $eval: "…" }`: the plain-object branch refused only the names of ops that exist, so any other `$` key passed as a template key. Such a config could be stored — an endpoint request, a vex mapping, a strata migration — and then failed every time it was evaluated (`E_NODE_SHAPE`, "Unsupported node shape").

  A key that starts with `$` is now an op's name and nothing else. The template branch refuses every `$` key — the rule the evaluator already held — so `validate` reports it with the key and where it is (`card.$fetch: Not a Prism op. A key that starts with "$" names an op; data with such a key goes in $const.`), and `evaluate` and `compile` fail with `E_SCHEMA` before anything runs. An op's name used as a template key keeps its own message. `E_NODE_SHAPE` is left for a tree that never went through the schema: an IR handed to `execute`. Adding an op no longer takes a key away from templates.
  - **prism** — the change, and a grammar narrowing: `nisc.prism` 2, a marker with no document step (a key that never evaluated has nothing to be rewritten to). `$` keys that are data are untouched: a `$const` payload, `$with` names, `$renameKeys` and `$fromEntries` keys. The JSON Schema's template key pattern is `^(?!\$)` instead of a list of every op.
  - **nova, vex, moss, loom, cli, nisc** — no change of their own. They depend on prism and are released with it, so the set installs together; the configs they hand to prism (endpoint `request` and `response`, `$prism` bindings, vex mappings) are held to the same rule.
  - **create-nisc** — the templates' sources are recorded at `nisc.prism` 2.

  **What to change:** in a config with a `$`-prefixed key that is not a Prism op, remove the key — or put the object in `$const` if it is literal data. An app that keeps a `strata.lock.json` runs `pnpm strata upgrade`, then `pnpm strata verify`; there is nothing to edit unless it has such a config. Everything else: nothing.

  BREAKING — approved by moccadroid, 2026-10-04: a config with a `$`-prefixed key that is not a Prism op no longer validates, compiles or evaluates — also where evaluation never reached the key (an untaken `$case` branch, a short-circuited `$or`, a `$map` body over an empty array), which used to work. A vex seed mapping with one fails when it is seeded, at boot, instead of on each replay. Code that matched `E_NODE_SHAPE` from `evaluate` gets `E_SCHEMA`. The `@niscorp` packages that depend on prism move with it, so an app moves them together (`@niscorp/nisc` 0.3.0).

## 0.1.2

### Patch Changes

- b67a125: Documentation only: each package's README, reference and design docs checked against its source and corrected — install lines and peers, signatures, defaults, status codes, licenses (loom, signal: Apache-2.0), and API that existed but was not documented.

## 0.1.1

### Patch Changes

- 534eb4b: `@niscorp/strata` is a required peer: nova's shell and layout store and Prism's engine import its document-depth limit at load time, and with strata declared optional an app installing nova or Prism without it crashed on import. `check:packages` now follows every built entry's imports and refuses an undeclared one, or an optional peer loaded by a main entry.
