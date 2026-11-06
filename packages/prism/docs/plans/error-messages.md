# Prism errors that say what to fix

Status: decisions 1, 2 and 3 approved by the owner on 2026-11-06 and built. Investigated 2026-11-06 on `main` at `ace4d7c0` (`@niscorp/prism` 0.3.1).

## What happened

Haptic's pilot asked Prism's `mappingAgent` (gpt-oss-120b, low effort) for a mapping in two cases, `github-service-status` and `django-news`. Both times the model wrote `$trim` with its argument wrapped in an object:

```json
{ "$trim": { "value": { "$get": { "from": { "$var": "item" }, "path": ["fields", "name", 0] } } } }
```

`{ "value": … }` is a valid node: an object with no `$` key is a template, and a template builds an object. So the config passed the schema, ran, and `$trim` was handed an object. The model was told, four times in a row in each case:

> Your output was invalid: Running the program on all 11 records failed: Expected string for $trim. Reply with ONLY the corrected JSON envelope as your entire message.

Nothing in that says it passed an object, which object, or what `$trim` takes. The same error came back four times until the step limit (4) stopped the run; the events keep only the last program, which still has the wrapped `$trim`. In a third case (`perl`) the model wrote `$get` with the path `["link", "0"]`: the text `"0"` is read as a key, a list has no keys, and the fallback `null` was returned for all twelve records with no error at all. The pilot reported the mapping as ready.

## How an error reaches the author today

1. Prism throws a `PrismError` with a `code` (one of nine `E_…` strings), a `message`, and an optional `context` of `{ op?, path?, details? }`.
2. The caller catches it. The pilot's check (`packages/haptic/scripts/pilot/pilot.mjs:446`) does `evaluate(program, input, { check: 'always' })` and returns `{ retry: \`Running the program on all N records failed: ${error.message}\` }`. Haptic's `trial` operation (`src/discovery/trial.ts`) forwards `code`, `message`, `context.op` and `context.path`. Nothing forwards `context.details`.
3. Cortex puts the retry text into signal's correction line, `Your output was invalid: {issues}. Reply with ONLY the corrected JSON envelope…`, as a system message, and the model tries again.

So **the message string is all the author ever sees.** Whatever Prism puts in `context.details` is lost.

Two consequences found by running every case below (`evaluate(…, { check: 'always' })`, Prism 0.3.1):

- `evaluate` reports a config that fails the schema as the bare message `Invalid config`. The useful part, `$map.body.x.$get.path: Invalid input: expected array, received string`, is only in `context.details.issues`. `compile` puts the same issues into its message; `evaluate` does not. A caller that forwards the message sends the model two words.
- Before evaluation, the schema cannot catch `{ "$trim": { "value": … } }`: `$trim` takes any node, and a template is a node.
- The mapping agent's schema errors do not come from Prism's text. Cortex checks the agent's output against `ConfigSchema` itself and turns zod's issues into text with its own `flattenSchemaIssues`. Where a value fails Prism's node union, zod hands over one list of issues per kind of node, and cortex picks one list by its own rule, which is not Prism's. In a later pilot run (`bench17-runs3/python-release/120b-run2`) the model closed a brace too early, so `as` and `body` landed inside `$map.over` beside `$filter`:

  ```json
  { "$map": { "over": { "$filter": { "over": …, "as": "r", "when": … }, "as": "r", "body": { "$merge": … } } } }
  ```

  Prism's own `validate` says `$map.over: Unrecognized keys: "as", "body"`, `$map.as: … expected string, received undefined`, `$map.body: Not a Prism node…`. Cortex picked the template's list instead and the model got `data.$map: Invalid key in record` on all four tries, with no word of which key or where it belongs. The same happens for an op name that does not exist: cortex prints `x/$first: Invalid key in record`, where Prism's `validate` says `Not a Prism op. A key that starts with "$" names an op; data with such a key goes in $const.`

## Inventory

Every throw in `packages/prism/src`: 52 `throw new PrismError` statements, reached from about 70 places through shared helpers. (`engine/documentation.ts:65, 70` also throw a plain `Error`, for a JSON Schema that zod did not produce as expected; no program reaches them.) "Enough" means an author who sees only the message knows what was received, where in the program, and what form the op takes.

| Where | Op and field | Code | Message today | Missing | Enough? |
|---|---|---|---|---|---|
| `ops/string.ops.ts:47` | `$trim` | E_TYPE | `Expected string for $trim` | what it got, where, the op's form | No |
| `ops/string.ops.ts:54, 61` | `$lower`, `$upper` | E_TYPE | `Expected string for $lower` | same | No |
| `ops/string.ops.ts:68, 75` | `$split.value`, `$replace.value` | E_TYPE | `Expected string for $split` | same | No |
| `ops/string.ops.ts:9` | `$join.parts` | E_TYPE | `Expected $join.parts to evaluate to an array` | what it got, where | No |
| `ops/string.ops.ts:24` | `$interpolate.values` | E_TYPE | `Expected object for $interpolate.values` | same | No |
| `ops/array.ops.ts:11` (one helper, six uses) | `$map.over`, `$filter.over`, `$reduce.over`, `$flatten`, `$unique`, `$sortBy.over` | E_TYPE | `Expected array for $map.over` | what it got, where | No |
| `ops/array.ops.ts:60` | `$slice.from` | E_TYPE | `Expected array or string for $slice` | same | No |
| `ops/array.ops.ts:89` | `$sortBy.by` | E_TYPE | `$sortBy.by answered an object; a sort key is a string or a number. To sort by two keys, …` | a preview, where | Partly |
| `ops/core.ops.ts:17` | `$ref` | E_MISSING_PATH | `Path not found` | the path itself (only in `context.path`), where it stopped, what is there | No |
| `ops/core.ops.ts:35` | `$var` | E_VAR_NOT_FOUND | `Variable not found: rec` | the names that are in scope, where | Partly |
| `ops/core.ops.ts:51` | `$get.path` | E_TYPE | `Expected array for index access` | which segment, the value there | No |
| `ops/core.ops.ts:58` | `$get.path` | E_TYPE | `Expected object for key access` | same | No |
| `ops/core.ops.ts:66` | `$get.path` | E_MISSING_PATH | `Path not found` | the path, which key, the keys that are there | No |
| `ops/math.ops.ts:9` (one helper, five uses) | `$add`, `$sub`, `$mul`, `$div`, `$mod` | E_TYPE | `Expected numbers for $add` | which operand, both values | No |
| `ops/math.ops.ts:30, 37` | `$div`, `$mod` | E_DIVISION_BY_ZERO | `Division by zero` | where | Partly |
| `ops/math.ops.ts:49` | `$round.value` | E_TYPE | `Expected number for $round` | what it got, where | No |
| `ops/math.ops.ts:75` | `$toNumber.value` | E_TYPE | `Expected a number or numeric text for $toNumber, got "abc"` | where, the form (it has `fallback`) | Partly |
| `ops/predicate.ops.ts:33` (one helper, four uses) | `$gt`, `$gte`, `$lt`, `$lte` | E_TYPE | `Cannot compare values for $gt` | the two values and their kinds | No |
| `ops/predicate.ops.ts:62, 70, 78` | `$startsWith`, `$endsWith`, `$contains` | E_TYPE | `Expected strings for $startsWith` | which field, the value | No |
| `ops/structure.ops.ts:12` | `$merge` item | E_TYPE | `Expected object for $merge element` | which item, the value | No |
| `ops/structure.ops.ts:38, 46, 61` | `$entriesOf`, `$keyBy.over`, `$groupBy.over` | E_TYPE | `Expected object for $entriesOf` | what it got, where | No |
| `ops/object.ops.ts:9, 16, 23, 36, 47, 67` | `$keys`, `$values`, `$fromEntries`, `$pick.from`, `$omit.from`, `$length` | E_TYPE | `Expected object for $keys` | what it got, where | No |
| `ops/object.ops.ts:27` | `$fromEntries` item | E_TYPE | `Expected [key, value] pairs for $fromEntries` | which item, the value | No |
| `ops/time.ops.ts:18` (one helper, four uses) | `$date.value`, `$dateAdd.date`, `$dateDiff.from`, `$dateDiff.to` | E_TYPE | `Expected string or number for $date` | what it got, where | No |
| `ops/time.ops.ts:21` | same four | E_DATE_INVALID | `Invalid date for $date: <value>` | where; the value is not clipped | Partly |
| `ops/intl.ops.ts:14` (three uses) | `$localeDate.locale`, `$localeMoney.locale`, `$localeNumber.locale` | E_TYPE | `$localeDate needs a locale tag (e.g. "de-AT")` | what it got, where | Partly |
| `ops/intl.ops.ts:28` (two uses) | `$localeMoney.value`, `$localeNumber.value` | E_TYPE | `$localeMoney expected a number, got "abc"` | where | Partly |
| `ops/intl.ops.ts:48` | `$localeDate.value` | E_DATE_INVALID | `Invalid date for $localeDate: <value>` | where | Partly |
| `ops/intl.ops.ts:85` | `$localeMoney.currency` | E_TYPE | `$localeMoney needs an ISO-4217 currency code` | what it got, where | Partly |
| `ops/transform.ops.ts:27` | `$renameKeys.from` | E_TYPE | `Expected object for $renameKeys` | what it got, where | No |
| `ops/transform.ops.ts:53` | `$update.path` | E_MISSING_PATH | `No array item at 3` | the list's length, where | Partly |
| `ops/transform.ops.ts:69` | `$assert` | E_ASSERT | the program's own `message` | — | Enough |
| `engine/evaluate.ts:190, 194` | any (schema) | E_SCHEMA | `Invalid config` | everything: the issues are only in `context.details` | No |
| `engine/evaluate.ts:173` | any (an IR given to `execute`) | E_NODE_SHAPE | `Unsupported node shape` | the keys and a preview (only in `details`) | No |
| `engine/evaluate.ts:220` | the source | E_TYPE | `The source must be plain JSON.` | which value; this is the calling code's mistake, not the program's | Partly |
| `engine/compile.ts:67, 71` | any (schema) | E_SCHEMA | `Invalid config: <path>: <zod message>; …` | the form of the op the issue is in | Partly |
| `engine/budget.ts:25` (three uses) | the budget | E_BUDGET | `Evaluation stopped: a string of 1024 characters (limit 1000)` | where in the program | Partly |
| `utils/jsonpath.ts:13` | `$ref` path syntax | E_SCHEMA | `Not a path Prism reads: "…". A path is keys and indexes only, …; for every item of a list use $map or $pluck.` | — | Enough |

Three more things make the "where" worse than the table shows:

- **Sugar ops are named as what they run as.** `$sum`, `$avg`, `$count`, `$min`, `$max`, `$pluck`, `$take`, `$drop`, `$match` and `$flatMap` are rewritten into core ops before evaluation (`DESIGN.md`, decision 2: "Error messages reference core ops only"). `$sum` over `["1", "2"]` reports `Expected numbers for $add`; `$avg` over an empty list reports `Division by zero` with `op: "$div"`; `$pluck` over an object reports `Expected array for $map.over`. The author wrote none of those ops.
- **The same op appears many times.** The github program has five `$trim`s; the message does not say which one failed.
- **`context.op` and `context.path` are not the program position.** `op` is the op name, sometimes with a field (`$map.over`); `path` is the `$ref`'s JSONPath, the `$var`'s name, or the `$update` path.

## Silent answers

The perl case raised no error, so no message could have helped. These are the places where Prism answers instead of refusing, found by reading every op and run against Prism 0.3.1:

| Where | What it does | Can it hide a mistake in the program? |
|---|---|---|
| `$get` with `fallback` | answers the fallback when the path is missing **and** when a key is asked of a list or an index of an object | Yes: `["link", "0"]` on a list answered `null` for every record (perl) |
| `__optional` template fields | leave out a field whose `$ref` is missing; a `$ref` that asks a key of a list is reported as missing | Yes: `{ "n": { "$ref": "$.rec.tags.t" }, "__optional": ["n"] }` answers `{}` |
| `$join`, `$interpolate`, `$keyBy`, `$groupBy` | turn each value into text with `String()` | Yes: an object becomes `"[object Object]"` (`$join` of `[{ "t": 1 }]` answers `"[object Object]"`) |
| `$interpolate` | a `{{name}}` with no value becomes `""` | Yes, a misspelt name: `"Hi {{nmae}}"` answers `"Hi "` |
| `$filter.when`, `$case` `when`, `$and`, `$or`, `$not`, `$assert.when` | treat any object or list as true | Yes, the trigger's own mistake: `{ "$filter": { …, "when": { "value": { "$eq": … } } } }` keeps every item, and `{ "$not": { "value": false } }` answers `false`. Not refused here: an object can be a real "is it there" test (`$get` with a `null` fallback); only an object written in the program at that place is always a mistake, and that is the schema check this proposal leaves out |
| `$update` | a path through text replaces the text with an object | Rarely: `{ "a": "text" }` with path `["a", "b"]` answers `{ "a": { "b": 1 } }` |
| `$toNumber` and the `$locale…` ops with `fallback`, `$has`, `$coalesce`, `$empty` | answer a default or `false` | No: answering a default is what they are for |

**Do they belong in this audit?** They belong in the inventory, because for a model a silent wrong answer is worse than a bad message: it gets no retry at all. They do not belong in this refactor. There is no error whose text could be improved, and every fix (refuse, or read differently) changes what a program that runs today answers. Each is its own decision about behaviour, brought separately. Decision 2 below is the one the pilot hit.

## The proposal

**Every error leaving `evaluate`, `evaluateSafe` and `execute` says what the op received, where in the program, and the form the op takes, in its message.** Codes, the `PrismError` class, its `context` and every export stay as they are.

A type error reads:

```
<op>[.<field>] needs <what>, but got <the value, described>. [<how it was written>] At <path in the program>. Form: <the op's form>
```

`<how it was written>` is there only when the field was written in the program as an object without a `$` key: `That object was written in the program as {"value": …}, and an object without a "$" key builds an object; put the node itself there.` It is one rule for every op and field, and it names the mistake in both `$trim` cases.

### How it works

1. **The value, described.** One function in `errors.ts` describes a value as `null`, `the number 5`, `text "…"` (at most 60 characters), `a list of 2 items: […]` or `an object: {…}` (at most 80 characters of JSON). It replaces the two partial versions there are today (`whatIs` in `math.ops.ts`, and the one inside `$sortBy`'s key check).
2. **The failing node is remembered, not searched for while evaluating.** Each op that refuses passes the node it was evaluating, its field and the value it received to one function in `errors.ts`, which throws the `PrismError` with the same code and `context.op` as today and keeps the node, the field's node as written and the value in a `WeakMap` beside the error. Nothing is exported. All 52 throws move to it; most are one line for one line.
3. **The message is written once, on the way out.** `evaluate` and `execute` already have a function each that runs the tree (`run` in `evaluate.ts`, the body of `execute`). Each gets one `catch`. When a `PrismError` leaves with a remembered node, it finds that node's position in the tree by walking the tree for that object, and writes the full message onto the same error object before throwing it on. Describing the value, finding the position and printing the form happen only there. An error that is caught inside Prism and the program still succeeds (a template's `__optional` field, the optimizer trying to work a part out ahead of time) costs what it costs today plus one `WeakMap` entry.
4. **The path is the author's.** `evaluate` has the config as the author wrote it. The tree path is followed through the author's config key by key. Where the author's node is a sugar op, its keys stop matching (the tree has `$reduce` where the author wrote `$sum`). There Prism rewrites a copy of that one op with each field replaced by a marker, and looks where each marker landed: `$sum.over` lands at `$reduce.over`, `$avg.over` at `$div.0.$reduce.over`, `$match.search` at `$filter.when.$contains.search`. The field whose landing place starts the rest of the path is where the walk goes on, in the author's config. No knowledge of each rewrite is written down, and it runs only on failure. If no field matches, the error is in the part Prism added, and the message says so: `At s.$sum, in the $add that $sum runs as.` Prototyped on the rewriters of 0.3.1: an error inside `$sum.over`, `$avg.over`, `$match.search` and `$flatMap.body` maps to `s.$sum.over.…`, `s.$avg.over.…`, `m.$match.search`, `f.$flatMap.body`; an error in `$sum`'s own `$add` maps to `s.$sum`. `execute` has only the compiled tree; its paths are in the compiled form, which the caller made with `compile`.
5. **The form comes from the schema.** A function beside `opMembersOf` in `schemas/node.schema.ts` (which already reads each op's shape) prints an op's shape: `{"$trim": <node>}`, `{"$split": {"value": <node>, "sep": <text>}}`, `"fallback"?:` for an optional key. Nothing is written by hand per op, so a new op has its form the day it is added. Prototyped against the 75 ops of 0.3.1: every one prints; `$const`'s JSON value needs one special case (printed as `<any JSON>`).
6. **Where the generic sentence is not enough**, the error says more:
   - `$ref` and `$get`: which segment the path stopped at and what is there (`the value at $.records is a list of 2 items`), and for a missing key the keys that are there (at most ten).
   - `$var`: the variables in scope, without the `__` names the sugar ops use inside.
   - `E_BUDGET`: where the program was when it stopped.
   - `E_NODE_SHAPE`: the keys and the preview, now in the message.
   - The source refused by `check: 'always'`: the path of the first value that is not plain JSON and what it is (`source.d is a Date`).
7. **Schema errors carry their issues in the message.** `evaluate` writes `Invalid config: <path>: <issue>; …` as `compile` already does. An issue at an op's own object or at one of its fields (`x.$trim`, `$map.as`, `$map.body.x.$get.path`) ends with that op's form; an issue deeper down (`$case.else.$todo: Not a Prism op…`) gets none, because the op above it is not what is wrong. `validate`, `evaluate` and `compile` share `utils/issues.ts`, so all three print the same text. `context.details.issues` stays.
8. **An object whose only key is a `$` key is checked as that op only.** Today the node union (`NodeUnion` in `schemas/node.schema.ts`) tries the op its key names first and, when that fails, runs every kind of node again to report, which hands any reader of zod's issues a choice of lists. Nothing but that op can accept such an object: every op's schema is strict, and a template refuses `$` keys. So the union reports the op's own issues and stops, and whoever formats them gets one list. A sole `$` key that names no op is reported as Prism's `Not a Prism op…` issue at that key. An object that mixes a `$` key with other keys keeps today's handling, so `{ "a": 1, "$map": 2 }` still gets `An op name cannot be a plain object key. Use the op itself.` (two tests pin that sentence). Which configs pass does not change; only what a failing one reports. A test asserts that every op's schema stays strict, since this step relies on it. Values without a `$` key (a missing field, a number where a node goes) still reach cortex as a union, so cortex still picks among lists for those. This is the one change in this proposal that reaches the mapping agent's schema errors, because cortex formats the issues zod hands it.
9. **Kept as it is:** `$assert`'s message is the program's own and is not changed. The `Not a path Prism reads` refusal and the template-key refusal already say what to do.

### Before and after

The received values and the forms were printed by a prototype of steps 1 and 5 (outside the repository), on the exact programs and records from the pilot's `events.json`. The `At` positions were found by walking those programs in the order the evaluator runs them, not by the code of step 3. The sentence on how the field was written is added by hand from the rule above.

**The trigger, `github-service-status`.** The first of the five `$trim`s to run is inside the `$filter`:

```
before  Expected string for $trim
after   $trim needs text, but got an object: {"value":"\n      Git Operations\n   "}. That object was written in the program as {"value": …}, and an object without a "$" key builds an object; put the node itself there. At $map.over.$filter.when.$or.0.$eq.0.$trim. Form: {"$trim": <node>}
```

**The same mistake, `django-news`:**

```
before  Expected string for $trim
after   $trim needs text, but got an object: {"value":"Quarterly contributor outreach"}. That object was written in the program as {"value": …}, and an object without a "$" key builds an object; put the node itself there. At $map.body.title.$trim. Form: {"$trim": <node>}
```

**The perl path, without its fallback:**

```
before  Expected object for key access
after   $get path ["link","0"] stopped at "0": the value at "link" is a list of 1 item: ["/books/beginning-perl/"], and a list is read by index, a number: 0 reads its first item. At $map.body.link.$get.path. Form: {"$get": {"from": <node>, "path": [<text> or <number> or <node>, …], "fallback"?: <node>}}
```

**A schema error from `evaluate`** (`{ "x": { "$trim": { "$ref": "$.a" }, "fallback": "" } }`):

```
before  Invalid config
after   Invalid config: x: Unrecognized key: "fallback". Form: {"$trim": <node>}
```

**The mapping agent's schema error, `python-release`** (what cortex prints, simulated by running the `$map` op's own schema on the model's program and formatting the result with cortex's `flattenSchemaIssues`; the reviewer got the same text by applying step 8's rule to the full `ConfigSchema` issues):

```
before  $map: Invalid key in record
after   $map/over: Unrecognized keys: "as", "body"; $map/as: Invalid input: expected string, received undefined; $map/body: Invalid input: expected string, received undefined
```

Cortex still prints zod's words, without the op's form; the form appears where Prism formats the issues (`validate`, `evaluate`, `compile`). `$map/body … received undefined` is cortex's pick for a missing value, which step 8 does not reach.

The wording is a draft; it is settled in the build, and every message is checked by a test (below).

### What it does not do

- **No check before evaluation for `{ "$trim": { "value": … } }`.** The schema could refuse a template, a list or a number where an op needs text. That is a second place that knows what each op takes, kept in step with the ops by hand, for one class of mistake that the message above shows on the first failure.
- **No record number.** A failure inside `$map` does not say which item. The path and the received value point at the mistake; the item number would need a `catch` in each op that loops (`$map`, `$filter`, `$reduce`, `$sortBy`, `$keyBy`, `$groupBy`, `$walk`).
- **No new fields on `PrismError`.** The program position goes into the message only, because the message is what callers forward. A field (`context.at`) can be added later if a tool wants to highlight the node.
- **No change to what any program answers.** The silent answers above are untouched.

## Cost

| | |
|---|---|
| Public API | None. `PrismError`, `PrismErrorContext`, `ErrorCode` and every export stay as they are. |
| Error codes | None. Every throw keeps its code. `context.op` and `context.path` keep their values (Haptic's `trial` reads both). `context.details` keeps `issues`, `keys`, `preview` and `limit`. |
| Messages | Every message but `$assert`'s and the two refusals that already say what to do. In the monorepo nothing outside Prism compares message text (searched: apps, packages, bench, docs, and the haptic-rebuild worktree). Inside Prism, 19 assertions in 9 test files read message or issue text. By reading them: `test/evaluate.test.ts:103` (`'The source must be plain JSON.'`, exact) changes; the others match a phrase the new messages keep (`$sortBy.by answered a list`, `No array item`, `a string of N characters`, `Not a path Prism reads`, …) or pin an issue that gets no form under step 7's rule (`Not a Prism op…` at an unknown key, the op-name-as-key sentence). The build reports the real list. |
| Code | Estimated +180 / −50 lines in `src` (the prototypes of steps 1, 4 and 5 are about 75 lines). One new file, `engine/place.ts`, for steps 3 and 4, used by `evaluate.ts` and `execute.ts`. Real counts are reported after the build. |
| Docs | `DOCS.md`, "Error Codes": what a message says. `DESIGN.md`, decision 2: "Error messages reference core ops only" becomes "an error inside a sugar op names the sugar op and the core op it ran". |
| Changeset | `@niscorp/prism` patch. It names the three things a caller can see: error messages, the message text of `validate`'s issues (forms added), and the issues `ConfigSchema` hands zod's readers for an object with a sole `$` key (the op's own issues, no union). **What to change:** nothing. |
| Bundle | Baseline (`bench/prism`, `npm run sizes`): `evaluate` 504.3 kB, 110.2 kB gzip; `execute` only 499.5 kB, 108.7 kB gzip. zod is already in both, so printing forms from the schema adds no library. Budget: at most +3 kB, +1 kB gzip, for each. |
| Speed | While a program succeeds, the new work is one `catch` per call, a node handed to the budget check, and a `WeakMap` entry for an error Prism catches itself (above). Two baseline runs of the Prism rows (`npm run bench -- --only prism`) differ by 1.5% at the median and 7.9% at the worst, so one run before and one after cannot tell a small slowdown from noise. Method: three runs before and three after; each row's median over its three runs is compared. Budget: the middle row's change is within 2%, and no row is slower by more than the widest spread between the three baseline runs. |

## Decisions for the owner

1. **Build the refactor above**, including the change to `DESIGN.md` decision 2. Patch changeset.
2. **`$get` reads a path segment of digits as an index on a list.** `["link", "0"]` would read the first item, as JavaScript and JSON Pointer (RFC 6901) read it, instead of answering the fallback or throwing `E_TYPE`. This changes what a program answers, so it is separate from 1 and needs its own yes. Recommended: yes. The same mistake is already in the repository: `apps/lab/lyra/src/app/actions/domains/people/people.actions.ts:42–54` reads the last row of a page with `path: ['0', field]` and a fallback of `''`, so its page cursor is always `""` today (run on a page of two rows, it answers `""`). With this change lyra gets the row's value, which is what it was written for. (Lyra is not one of the current reference apps; it is the only place in the repository found to change.)
3. **`$join`, `$interpolate`, `$keyBy` and `$groupBy` refuse an object or a list where they need text** (`E_TYPE`, with the message of the refactor), instead of writing `"[object Object]"`. Also a change in what a program answers. Recommended: yes, after 1, in its own changeset. The other silent answers in the table stay as they are.

## How it will be checked

- A test with one wrong program for every throw site in the inventory asserts that its message names the received value, an `At` path, and (for `E_TYPE`) the form. A new refusal needs its own case there; nothing finds a refusal without one.
- A test runs wrong configs through `ConfigSchema.safeParse` and cortex's `flattenSchemaIssues` and asserts that the printed text names the op's own issue (the `python-release` program, an unknown op, an op with a key it does not take), and that every config the tests accept today is still accepted.
- The pilot's two `$trim` cases and the `python-release` case are run again against the new build, eight runs each, and the runs that recover before the step limit are counted (today: 0 of 3).
- `pnpm --filter @niscorp/prism test`, `typecheck`, `build`; `bench/prism`: `npm run sizes` and `npm run bench -- --only prism`, against the budgets above.

## Outside Prism (not part of this proposal)

- **cortex** — `flattenSchemaIssues` picks one branch of a failed union by its own rule and prints zod's outer `Invalid key in record` without the message nested under it. Step 8 takes Prism's node union out of that choice; any other union an agent's schema has keeps the problem. A change for a cortex session, if wanted.
